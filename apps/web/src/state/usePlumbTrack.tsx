"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from "react";
import type { AppState, DocumentCategory, Job, OutboxOperation, PlumbDocument, PlumbDocumentVersion, Quote, QuoteLineField, Rfi, Shift, ShiftWorkType, SlackMember, TimeEntry, View, Tab, SlackChannel } from "@/types";
import { API_URL, DEFAULT_ORG_ID, GPS_LOCK_DURATION_MS, STORAGE_KEY, XERO_SYNC_DURATION_MS } from "@/lib/constants";
import { disaggregateForStp, interpretShift, previousShiftEnd, type ShiftPayBreakdown, type StpDisaggregation } from "@/lib/award";
import { api } from "@/lib/api";
import { enrollDeviceSession, getAuthSession } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { dispatchNotification } from "@/lib/notifications";
import { discardFailedOutboxOperations, enqueueOutboxOperation, getOutboxMedia, mediaToBlob, mediaToDataUrl, migrateLegacyOperations, putOutboxMedia, removeOutboxMedia, retryFailedOutboxOperations, retryOutboxOperation } from "@/lib/outbox";
import { createSyncManager, DeferredSyncError, TerminalSyncError } from "@/lib/syncManager";
import { useOutboxStatus } from "@/hooks/useOutboxStatus";
import { useShiftTracking } from "@/hooks/useShiftTracking";
import { seedChannels, seedDocuments, seedJobs, seedMembers, seedMessages, seedQuotes, seedRfis } from "@/lib/seed";
import { reducer } from "./reducer";
import type { Action } from "./actions";

// ── Persistence helpers ──────────────────────────────────────────────────────

function emptyState(): AppState {
  return {
    jobs: seedJobs,
    quotes: seedQuotes,
    channels: seedChannels,
    members: seedMembers,
    messages: seedMessages,
    shifts: [],
    syncQueue: [],
    serverEntryIds: {},
    documents: seedDocuments,
    rfis: seedRfis,
  };
}

function loadState(): AppState {
  try {
    if (typeof window === "undefined") {
      return emptyState();
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyState();
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.jobs) && parsed.jobs.length > 0 && Array.isArray(parsed?.quotes)) {
      // Backfill staffId + new array fields on legacy entries.
      const jobs = parsed.jobs.map((j: Job) => {
        const seedJob = seedJobs.find((candidate) => candidate.id === j.id);
        return {
        ...j,
        // Preserve contact metadata for installs that persisted state before
        // residential phone/access fields were introduced.
        phone: j.phone ?? seedJob?.phone,
        accessCode: j.accessCode ?? seedJob?.accessCode,
        timeEntries: (j.timeEntries ?? []).map((e: TimeEntry) => ({ ...e, staffId: e.staffId ?? "tim" })),
        serviceItems: j.serviceItems ?? [],
        voiceNotes: j.voiceNotes ?? [],
        logEntries: j.logEntries ?? [],
        dailyReports: j.dailyReports ?? [],
        checklists: j.checklists ?? [],
        milestones: j.milestones ?? [],
      };
      });
      return {
        jobs,
        quotes: parsed.quotes,
        channels: Array.isArray(parsed.channels) ? parsed.channels : seedChannels,
        members: Array.isArray(parsed.members) ? parsed.members : seedMembers,
        messages: Array.isArray(parsed.messages) ? parsed.messages : seedMessages,
        shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
        syncQueue: Array.isArray(parsed.syncQueue) ? parsed.syncQueue : [],
        serverEntryIds: parsed.serverEntryIds && typeof parsed.serverEntryIds === "object" ? parsed.serverEntryIds : {},
        documents: Array.isArray(parsed.documents) ? parsed.documents : seedDocuments,
        rfis: Array.isArray(parsed.rfis) ? parsed.rfis : seedRfis,
      };
    }
    return emptyState();
  } catch {
    return emptyState();
  }
}

function persistState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — ignore */
  }
}

function clearPersistedState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Context ────────────────────────────────────────────────────────────────

type PlumbTrackCtx = ReturnType<typeof usePlumbTrackImpl>;

const Ctx = createContext<PlumbTrackCtx | null>(null);

/** Read shared state from the PlumbTrack provider. */
export function usePlumbTrackCtx(): PlumbTrackCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlumbTrackCtx must be used within <PlumbTrackProvider>");
  return ctx;
}

// ── Provider ────────────────────────────────────────────────────────────────

/** Wraps children with the shared PlumbTrack state. */
export function PlumbTrackProvider({ children }: { children: React.ReactNode }) {
  const value = usePlumbTrackImpl();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── Hook (internal) ─────────────────────────────────────────────────────────

function usePlumbTrackImpl() {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  const { jobs, quotes, channels, members, messages } = state;

  const [activeTab, setActiveTab] = useState<Tab>("jobs");
  const [view, setView] = useState<View>("list");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string>("general");
  const [currentStaffId, setCurrentStaffId] = useState<string>("tim");
  const [clientName, setClientName] = useState("");
  const [gpsLocking, setGpsLocking] = useState(false);
  const [xeroSyncing, setXeroSyncing] = useState(false);
  const [xeroDone, setXeroDone] = useState(false);

  // Derived
  const job = useMemo(() => jobs.find((j) => j.id === activeId) ?? null, [jobs, activeId]);
  const quote = useMemo(() => quotes.find((q) => q.id === activeId) ?? null, [quotes, activeId]);
  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? channels[0] ?? null,
    [channels, activeChannelId],
  );

  // Staff identity — who's operating the device / clocking time.
  const staffMembers = useMemo(() => members.filter((m) => m.role !== "bot"), [members]);
  const currentStaff = useMemo(
    () => members.find((m) => m.id === currentStaffId) ?? members[0] ?? null,
    [members, currentStaffId],
  );
  const currentStaffName = currentStaff?.name.split(" ")[0] ?? "Staff";

  // Timer state reflects the current staff member's open entry on the job, so
  // each crew member has their own open entry and clock-off closes only theirs.
  const running = useMemo(
    () => !!job && job.timeEntries.some((e) => e.staffId === currentStaffId && e.end === null),
    [job, currentStaffId],
  );
  const startedAt = useMemo(() => {
    if (!job || !running) return null;
    const open = [...job.timeEntries].reverse().find((e) => e.staffId === currentStaffId && e.end === null);
    return open ? new Date(open.start).getTime() : null;
  }, [job, running, currentStaffId]);

  // ── Shift state (log-on / log-off) ────────────────────────────────────────
  // Tracking is derived, never stored: the GPS watch can only exist while the
  // shift is open and no unpaid meal break is running.
  const activeShift = useMemo(
    () => state.shifts.find((s) => s.staffId === currentStaffId && s.loggedOffAt === null) ?? null,
    [state.shifts, currentStaffId],
  );
  const openBreak = useMemo(
    () => activeShift?.breaks.find((b) => b.end === null) ?? null,
    [activeShift],
  );
  const trackingActive = !!activeShift && !openBreak;
  const shiftTracking = useShiftTracking(trackingActive);

  // Unread counts per channel (messages newer than lastReadAt, not authored by me).
  const unreadByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of channels) {
      const lastRead = c.lastReadAt ? new Date(c.lastReadAt).getTime() : 0;
      map[c.id] = messages.filter(
        (m) => m.channelId === c.id && new Date(m.ts).getTime() > lastRead && m.authorId !== "tim",
      ).length;
    }
    return map;
  }, [channels, messages]);

  const totalUnread = useMemo(
    () => Object.values(unreadByChannel).reduce((sum, n) => sum + n, 0),
    [unreadByChannel],
  );

  // Persist on every state change
  useEffect(() => { persistState(state); }, [state]);

  // Theme is a user preference, not job data. Start dark for SSR parity, then
  // hydrate the saved preference on the client without blocking field work.
  useEffect(() => {
    const saved = window.localStorage.getItem("plumbtrack-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("plumbtrack-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === "dark" ? "light" : "dark");
  }, []);

  // Register the lightweight background-sync bridge. It wakes the foreground
  // manager when the browser reports connectivity, while browsers without
  // Background Sync continue using the normal online listener and timer.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
    // Background-precache the data-download URLs (document vault + quote
    // lists) so they open offline too, not just the shell. `.ready` resolves
    // with the newest controlling worker (the SW skip-waits + claims), so the
    // message lands on a worker that has the precache handler. The org header
    // is mandatory — without it the tenant plugin rejects precache fetches 400.
    void navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({
        type: "PLUMBTRACK_PRECACHE",
        urls: [`${API_URL}/api/documents`, `${API_URL}/api/quotes`],
        headers: { "x-organization-id": DEFAULT_ORG_ID },
      });
    }).catch(() => undefined);
  }, []);

  // Merge remote data on mount — after ensuring a signed device session,
  // because production API calls are rejected without a bearer token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAuthSession()) await enrollDeviceSession();
      if (cancelled) return;
      try {
        const [rj, rq] = await Promise.all([api.listJobs(), api.listQuotes()]);
        if (!cancelled) dispatch({ type: "MERGE_REMOTE", jobs: rj, quotes: rq });
      } catch {
        /* API unreachable — keep local state */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Durable IndexedDB outbox migration ────────────────────────────────────
  // Stage 1 localStorage operations are copied once into IndexedDB. The
  // compatibility queue is cleared only after durable storage succeeds.
  useEffect(() => {
    if (state.syncQueue.length === 0) return;
    let cancelled = false;
    void migrateLegacyOperations(state.syncQueue).then((migrated) => {
      if (migrated && !cancelled) dispatch({ type: "CLEAR_SYNC_QUEUE" });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [state.syncQueue, dispatch]);

  const outboxStatus = useOutboxStatus();

  const handleOutboxOperation = useCallback(async (operation: OutboxOperation) => {
    const payload = operation.payload as Record<string, unknown>;
    if (operation.kind === "clock-in") {
      const created = await api.createTimeEntry(String(payload.jobId), {
        opId: operation.id,
        staffId: String(payload.staffId),
        start: String(payload.start),
        lat: typeof payload.lat === "number" ? payload.lat : null,
        lng: typeof payload.lng === "number" ? payload.lng : null,
      });
      dispatch({ type: "RECORD_ENTRY_SERVER_ID", localEntryId: String(payload.localEntryId), serverId: created.id });
      return;
    }
    if (operation.kind === "clock-out") {
      const serverId = state.serverEntryIds[String(payload.localEntryId)];
      if (!serverId) throw new DeferredSyncError();
      await api.updateTimeEntry(String(payload.jobId), serverId, { end: String(payload.end) });
      return;
    }
    if (operation.kind === "create-job") {
      const serverJob = await api.createJob({
        client: String(payload.client),
        address: String(payload.address),
        scope: String(payload.scope),
        ...(payload.phone ? { phone: String(payload.phone) } : {}),
        ...(payload.accessCode ? { accessCode: String(payload.accessCode) } : {}),
      });
      dispatch({ type: "REPLACE_JOB", localId: String(payload.localJobId), job: serverJob });
      return;
    }
    if (operation.kind === "sync-quote") {
      await api.updateQuote(String(payload.quoteId), payload as { status?: "draft" | "sent" | "accepted"; signature?: string; client?: string; address?: string; description?: string });
      return;
    }
    if (operation.kind === "create-quote") {
      const created = await api.createQuote({
        client: String(payload.client),
        address: String(payload.address),
        description: String(payload.description),
        lines: Array.isArray(payload.lines) ? payload.lines as Array<{ desc: string; qty: number; unit: string; rate: number }> : [],
      });
      dispatch({ type: "MERGE_REMOTE", jobs: [], quotes: [created] });
      return;
    }
    if (operation.kind === "notification") {
      await dispatchNotification({
        text: String(payload.text),
        channel: String(payload.channel),
        author: String(payload.author),
        opId: operation.id,
      });
      return;
    }
    if (operation.kind === "photo-upload") {
      const mediaId = String(payload.mediaId);
      const jobId = String(payload.jobId);
      const label = String(payload.label);
      const media = await getOutboxMedia(mediaId);
      if (!media) throw new TerminalSyncError("Photo data is missing — capture the photo again");
      const binary = await mediaToBlob(media);
      let intent;
      try {
        intent = await api.createPhotoUploadIntent({
          jobId,
          opId: operation.id,
          label,
          contentType: media.mimeType === "image/*" ? "image/jpeg" : media.mimeType,
          byteSize: binary.size,
        });
      } catch (error) {
        // Local/demo servers may not have object storage configured yet. Keep
        // their existing URL payload path working, but never fall back for an
        // authorization or provider error in a configured deployment.
        const status = error instanceof HttpError
          ? error.status
          : error instanceof Error && "status" in error
            ? Number((error as { status?: unknown }).status)
            : null;
        if (status !== 503) throw error;
        await api.createPhoto(jobId, { label, url: await mediaToDataUrl(media), opId: operation.id });
        await removeOutboxMedia(mediaId);
        return;
      }
      await api.uploadPhotoBinary(intent, binary);
      await api.completePhotoUpload(intent.assetId);
      await removeOutboxMedia(mediaId);
    }
  }, [state.serverEntryIds, dispatch]);

  useEffect(() => {
    const manager = createSyncManager(handleOutboxOperation);
    return manager.start();
  }, [handleOutboxOperation]);

  // Pending writes for UI (Settings and the field activity rail).
  const pendingSyncCount = outboxStatus.pending + outboxStatus.processing + outboxStatus.failed;
  const retryFailedSync = useCallback(() => retryFailedOutboxOperations(), []);
  const retrySyncOperation = useCallback((id: string) => retryOutboxOperation(id), []);
  const discardFailedSync = useCallback(() => discardFailedOutboxOperations(), []);

  // ── Slack helpers ─────────────────────────────────────────────────────────

  const postMessage = useCallback((channelId: string, authorId: string, text: string, dependsOn?: string[], parentId?: string) => {
    const opId = crypto.randomUUID();
    dispatch({ type: "POST_MESSAGE", channelId, authorId, text, parentId });
    // Slack is a downstream integration. Queue the handoff alongside the
    // local message so weak signal cannot silently lose an HQ update.
    dispatch({ type: "QUEUE_NOTIFICATION", opId, channel: channelId, author: authorId, text, dependsOn });
  }, []);

  const sendMessage = useCallback(
    (text: string, parentId?: string) => {
      if (!activeChannel) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      postMessage(activeChannel.id, currentStaffId, trimmed, undefined, parentId);
      // Mark my own channel read (my message is the newest).
      dispatch({ type: "MARK_CHANNEL_READ", channelId: activeChannel.id, ts: new Date().toISOString() });
    },
    [activeChannel, currentStaffId, postMessage],
  );

  const openChannel = useCallback(
    (channelId: string) => {
      setActiveChannelId(channelId);
      dispatch({ type: "MARK_CHANNEL_READ", channelId, ts: new Date().toISOString() });
      // If we're on the list view in the jobs tab, jump to the messages tab.
      setActiveTab("messages");
    },
    [],
  );

  const toggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      dispatch({ type: "TOGGLE_REACTION", messageId, emoji, userId: currentStaffId });
    },
    [currentStaffId],
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const openJob = useCallback(
    (id: string) => {
      setActiveId(id);
      setView("job");
    },
    [],
  );

  const openQuote = useCallback((id: string) => {
    setActiveId(id);
    setView("quote");
  }, []);

  const createQuote = useCallback(() => {
    const localId = `Q-${Math.floor(1000 + Math.random() * 9000)}`;
    dispatch({
      type: "CREATE_QUOTE",
      quote: {
        id: localId,
        client: "New client",
        address: "Address to confirm",
        description: "New plumbing quote",
        status: "draft",
        signature: null,
        lines: [{ id: crypto.randomUUID(), desc: "New item", qty: 1, unit: "ea", rate: 0 }],
      },
    });
    setActiveId(localId);
    setActiveTab("quotes");
    setView("quote");
  }, []);

  const updateQuoteMeta = useCallback((quoteId: string, field: "client" | "address" | "description", value: string) => {
    dispatch({ type: "UPDATE_QUOTE_META", quoteId, field, value });
  }, []);

  const startClockOn = useCallback(
    (jobId: string, staffId: string) => {
      setGpsLocking(true);
      setView("gpsLock");

      // Start the real geolocation request immediately.
      const geo = new Promise<{ lat: number; lng: number } | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        const timeout = setTimeout(() => resolve(null), GPS_LOCK_DURATION_MS);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timeout);
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => {
            clearTimeout(timeout);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: GPS_LOCK_DURATION_MS, maximumAge: 60_000 },
        );
      });

      // Wait for either GPS lock or the 1.5s floor (whichever finishes first).
      const minDelay = new Promise((r) => setTimeout(r, GPS_LOCK_DURATION_MS));
      void Promise.all([geo, minDelay]).then(([coords]) => {
        dispatch({
          type: "CLOCK_ON",
          jobId,
          staffId,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        });
        setGpsLocking(false);
        setView("job");
        setCurrentStaffId(staffId);

        const j = jobs.find((x) => x.id === jobId);
        const staff = members.find((m) => m.id === staffId);
        const name = staff?.name.split(" ")[0] ?? "Staff";
        const gps = coords ? " — GPS verified" : "";
        postMessage("field-updates", "plumbtrack", `📍 ${name} clocked on at ${j?.id ?? jobId}${gps}.`);
      });
    },
    [jobs, members, postMessage],
  );

  const clockOff = useCallback(() => {
    if (!activeId || !job || !running) return;
    // Close only the current staff member's open entry — other crew members'
    // running entries on the same job stay untouched.
    dispatch({ type: "CLOCK_OFF", jobId: activeId, staffId: currentStaffId });
    // Slack integration: announce clock-off in #field-updates.
    postMessage("field-updates", "plumbtrack", `🕐 ${currentStaffName} clocked off at ${job.id}.`);
  }, [activeId, job, running, currentStaffId, currentStaffName, postMessage]);

  // ── Shift actions (log-on / log-off) ──────────────────────────────────────

  /** Customer-facing ETA ping — queued like every outbound message. */
  const sendOnTheWay = useCallback(
    (jobId: string, etaMinutes: number) => {
      const j = jobs.find((x) => x.id === jobId);
      if (!j) return;
      postMessage(
        "field-updates",
        "plumbtrack",
        `🚚 ${currentStaffName} is on the way to ${j.client} (${j.id}) — ETA about ${etaMinutes} min. Track arrival in your booking confirmation.`,
      );
    },
    [jobs, currentStaffName, postMessage],
  );

  const logOn = useCallback(
    (workType: ShiftWorkType) => {
      const startedAt = new Date().toISOString();
      dispatch({ type: "LOG_ON", staffId: currentStaffId, workType, startedAt, noticeAckAt: startedAt });
      const label =
        workType === "callback" ? " (call-back)" : workType === "inclement" ? " (inclement weather)" : "";
      postMessage("field-updates", "plumbtrack", `🔐 ${currentStaffName} logged on${label} — shift tracking active until log-off.`);
    },
    [currentStaffId, currentStaffName, postMessage],
  );

  const startMealBreak = useCallback(() => {
    dispatch({ type: "START_BREAK", staffId: currentStaffId });
    postMessage("field-updates", "plumbtrack", `🍽️ ${currentStaffName} started an unpaid meal break — tracking paused.`);
  }, [currentStaffId, currentStaffName, postMessage]);

  const endMealBreak = useCallback(() => {
    dispatch({ type: "END_BREAK", staffId: currentStaffId });
    postMessage("field-updates", "plumbtrack", `🍽️ ${currentStaffName} back from break — tracking resumed.`);
  }, [currentStaffId, currentStaffName, postMessage]);

  const interpretActiveShift = useCallback(
    (asOf: string, workTypeOverride?: ShiftWorkType): ShiftPayBreakdown | null => {
      if (!activeShift) return null;
      return interpretShift({
        start: activeShift.loggedOnAt,
        end: asOf,
        breaks: activeShift.breaks.map((b) => ({ start: b.start, end: b.end ?? asOf })),
        workType: workTypeOverride ?? activeShift.workType,
        previousShiftEnd: previousShiftEnd(state.shifts, currentStaffId, activeShift.loggedOnAt),
      });
    },
    [activeShift, state.shifts, currentStaffId],
  );

  const logOff = useCallback(
    (
      opts: { workType?: ShiftWorkType; kmDriven?: number; toilElection?: boolean } = {},
    ): { shift: Shift; breakdown: ShiftPayBreakdown; stp: StpDisaggregation } | null => {
      if (!activeShift) return null;
      const endedAt = new Date().toISOString();
      const effectiveWorkType = opts.workType ?? activeShift.workType;
      const breakdown = interpretShift({
        start: activeShift.loggedOnAt,
        end: endedAt,
        breaks: activeShift.breaks.map((b) => ({ start: b.start, end: b.end ?? endedAt })),
        workType: effectiveWorkType,
        previousShiftEnd: previousShiftEnd(state.shifts, currentStaffId, activeShift.loggedOnAt),
      });
      const stp = disaggregateForStp(breakdown, {
        kmDriven: opts.kmDriven,
        toilElection: opts.toilElection,
      });
      dispatch({
        type: "LOG_OFF",
        staffId: currentStaffId,
        endedAt,
        workType: effectiveWorkType,
        ...(opts.kmDriven !== undefined ? { kmDriven: opts.kmDriven } : {}),
        ...(opts.toilElection !== undefined ? { toilElection: opts.toilElection } : {}),
      });
      postMessage(
        "field-updates",
        "plumbtrack",
        `🔓 ${currentStaffName} logged off — ${breakdown.totalHours.toFixed(2)} hrs, gross $${breakdown.grossPay.toFixed(2)}. Tracking stopped.`,
      );
      return { shift: { ...activeShift, loggedOffAt: endedAt, workType: effectiveWorkType }, breakdown, stp };
    },
    [activeShift, state.shifts, currentStaffId, currentStaffName, postMessage],
  );

  const addPhoto = useCallback(
    (label: string, url = "") => {
      if (!activeId) return;
      const photoId = crypto.randomUUID();
      const uploadOpId = crypto.randomUUID();
      dispatch({ type: "ADD_PHOTO", jobId: activeId, photo: { id: photoId, label, url, takenAt: new Date().toISOString() } });
      if (!url) return;

      // Keep the local preview instant, but move the heavy payload into the
      // media store so it is not dependent on localStorage limits.
      void putOutboxMedia({ id: photoId, data: url, mimeType: "image/jpeg", createdAt: new Date().toISOString() })
        .then(() => enqueueOutboxOperation({
          id: uploadOpId,
          kind: "photo-upload",
          payload: { jobId: activeId, photoId, label, mediaId: photoId },
        }))
        .then(() => postMessage("field-updates", "plumbtrack", `📸 ${label} photo added to ${activeId}.`, [uploadOpId]))
        .catch(() => undefined);
    },
    [activeId, postMessage],
  );

  const saveSignature = useCallback(
    (dataUrl: string) => {
      if (!job) return;
      const name = clientName.trim() || job.client;
      dispatch({ type: "SIGN_JOB", jobId: job.id, signature: dataUrl, client: name });
      setView("invoice");
      // Slack integration: announce sign-off in #field-updates.
      postMessage("field-updates", "plumbtrack", `✅ ${job.id} signed off by ${name}.`);
    },
    [job, clientName, postMessage],
  );

  const addLine = useCallback(() => {
    if (!quote) return;
    dispatch({
      type: "ADD_QUOTE_LINE",
      quoteId: quote.id,
      line: { id: crypto.randomUUID(), desc: "New item", qty: 1, unit: "ea", rate: 0 },
    });
  }, [quote]);

  const updateLine = useCallback(
    (lineId: string, field: QuoteLineField, value: string | number) => {
      if (!quote) return;
      dispatch({ type: "UPDATE_QUOTE_LINE", quoteId: quote.id, lineId, field, value });
    },
    [quote],
  );

  const removeLine = useCallback(
    (lineId: string) => {
      if (!quote) return;
      dispatch({ type: "REMOVE_QUOTE_LINE", quoteId: quote.id, lineId });
    },
    [quote],
  );

  const sendQuote = useCallback(() => {
    if (!quote) return;
    dispatch({ type: "UPDATE_QUOTE_STATUS", quoteId: quote.id, status: "sent" });
    setView("quoteSignoff");
    // Slack integration: announce the quote was sent in #quotes.
    postMessage("quotes", "plumbtrack", `📤 ${quote.id} sent to ${quote.client} for approval.`);
  }, [quote, postMessage]);

  const approveQuote = useCallback(
    (dataUrl: string) => {
      if (!quote) return;
      const name = clientName.trim() || quote.client;
      dispatch({ type: "UPDATE_QUOTE_STATUS", quoteId: quote.id, status: "accepted", signature: dataUrl });

      // Optimistically create the job locally so the UI responds instantly.
      const localId = `J-${Math.floor(1000 + Math.random() * 9000)}`;
      dispatch({
        type: "CREATE_JOB_FROM_QUOTE",
        job: {
          id: localId,
          client: name,
          address: quote.address,
          scope: quote.description,
          quoteId: quote.id,
          retentionPercent: 5,
          status: "scheduled",
          signature: null,
          timeEntries: [],
          photos: [],
          logEntries: [],
          dailyReports: [],
          checklists: [],
          milestones: [],
        },
      });

      // Slack integration: announce the accepted quote in #jobs.
      postMessage("jobs", "plumbtrack", `📋 ${quote.id} accepted by ${name} — ${localId} scheduled.`);

      // Server sync is handled by the reducer's CREATE_JOB_FROM_QUOTE which
      // enqueues a "create-job" sync op — the offline queue replays it with
      // retry + online event, same as time entries. On replay success the
      // local temp id is swapped for the real server cuid id via REPLACE_JOB.

      setActiveId(null);
      setActiveTab("jobs");
      setView("list");
      setClientName("");
    },
    [quote, clientName, postMessage],
  );

  const startXeroSync = useCallback(() => {
    if (!activeId) return;
    setXeroSyncing(true);
    setXeroDone(false);
    setTimeout(() => {
      setXeroSyncing(false);
      setXeroDone(true);
      // Persist the sync so the success state survives navigation/reload.
      dispatch({ type: "MARK_JOB_XERO_SYNCED", jobId: activeId });
      // Slack integration: announce the Xero draft in #field-updates.
      postMessage("field-updates", "plumbtrack", `🧾 Invoice draft created in Xero for ${activeId}.`);
    }, XERO_SYNC_DURATION_MS);
  }, [activeId, postMessage]);

  const resetDemo = useCallback(() => {
    clearPersistedState();
    window.location.reload();
  }, []);

  // ── Documents (vault) ────────────────────────────────────────────────────

  const addDocument = useCallback(
    (input: {
      name: string;
      category: DocumentCategory;
      tags: string[];
      jobId: string | null;
      expiresOn: string | null;
      notes: string;
      fileName: string;
      size: number;
      mimeType: string;
      url: string;
    }) => {
      const document: PlumbDocument = {
        id: crypto.randomUUID(),
        name: input.name.trim() || input.fileName || "Untitled document",
        category: input.category,
        tags: input.tags,
        jobId: input.jobId,
        expiresOn: input.expiresOn,
        notes: input.notes,
        versions: [
          {
            id: crypto.randomUUID(),
            fileName: input.fileName,
            size: input.size,
            mimeType: input.mimeType,
            url: input.url,
            uploadedAt: new Date().toISOString(),
            uploadedBy: currentStaffId,
          },
        ],
        createdAt: new Date().toISOString(),
        createdBy: currentStaffId,
      };
      dispatch({ type: "ADD_DOCUMENT", document });
      const jobRef = input.jobId ? ` on ${input.jobId}` : "";
      postMessage(
        input.jobId ? "field-updates" : "general",
        "plumbtrack",
        `📄 **${document.name}** added${jobRef} (${input.category}).`,
      );
      return document;
    },
    [currentStaffId, postMessage, dispatch],
  );

  const updateDocument = useCallback(
    (documentId: string, patch: Partial<Pick<PlumbDocument, "name" | "category" | "tags" | "expiresOn" | "notes">>) => {
      dispatch({ type: "UPDATE_DOCUMENT", documentId, patch });
    },
    [],
  );

  const addDocumentVersion = useCallback(
    (documentId: string, version: Omit<PlumbDocumentVersion, "id" | "uploadedAt" | "uploadedBy">) => {
      const doc = state.documents.find((d) => d.id === documentId);
      const full: PlumbDocumentVersion = {
        ...version,
        id: crypto.randomUUID(),
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentStaffId,
      };
      dispatch({ type: "ADD_DOCUMENT_VERSION", documentId, version: full });
      postMessage("field-updates", "plumbtrack", `📄 **${doc?.name ?? "Document"}** updated — new version (v${(doc?.versions.length ?? 0) + 1}).`);
      return full;
    },
    [state.documents, currentStaffId, postMessage, dispatch],
  );

  const deleteDocument = useCallback(
    (documentId: string) => {
      const doc = state.documents.find((d) => d.id === documentId);
      dispatch({ type: "DELETE_DOCUMENT", documentId });
      if (doc) postMessage("general", "plumbtrack", `🗑️ **${doc.name}** removed from the vault.`);
    },
    [state.documents, postMessage, dispatch],
  );

  // ── RFIs (requests-for-information) ─────────────────────────────────────

  const raiseRfi = useCallback(
    (jobId: string, question: string, attachmentId: string | null) => {
      const rfi: Rfi = {
        id: crypto.randomUUID(),
        jobId,
        question: question.trim(),
        attachmentId,
        status: "raised",
        raisedBy: currentStaffId,
        raisedAt: new Date().toISOString(),
        answer: "",
        answeredBy: null,
        answeredAt: null,
      };
      dispatch({ type: "RAISE_RFI", rfi });
      postMessage("jobs", "plumbtrack", `❓ RFI raised on ${jobId}: “${rfi.question}”`);
      return rfi;
    },
    [currentStaffId, postMessage, dispatch],
  );

  const answerRfi = useCallback(
    (rfiId: string, answer: string) => {
      const rfi = state.rfis.find((r) => r.id === rfiId);
      dispatch({ type: "ANSWER_RFI", rfiId, answer: answer.trim(), answeredBy: currentStaffId });
      postMessage("jobs", "plumbtrack", `💬 RFI answered on ${rfi?.jobId ?? "job"}: “${answer.trim()}”`);
    },
    [state.rfis, currentStaffId, postMessage, dispatch],
  );

  const closeRfi = useCallback(
    (rfiId: string) => {
      const rfi = state.rfis.find((r) => r.id === rfiId);
      dispatch({ type: "CLOSE_RFI", rfiId });
      postMessage("jobs", "plumbtrack", `✅ RFI closed on ${rfi?.jobId ?? "job"}.`);
    },
    [state.rfis, postMessage, dispatch],
  );

  // ── Navigation ───────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    switch (view) {
      case "job":
      case "quote":
        setActiveId(null);
        setView("list");
        break;
      case "signoff":
        setView("job");
        break;
      case "invoice":
        setActiveId(null);
        setView("list");
        break;
      case "quoteSignoff":
        setView("quote");
        break;
      case "gpsLock":
        setGpsLocking(false);
        setView("job");
        break;
      case "notificationFeed":
      case "syncCenter":
      case "integrationHealth":
      case "timesheet":
      case "dailyReport":
      case "checklist":
      case "dashboard":
        setView("list");
        break;
      default:
        setActiveId(null);
        setView("list");
        break;
    }
    setClientName("");
    setXeroDone(false);
  }, [view]);

  const closeInvoice = useCallback(() => {
    setActiveId(null);
    setActiveTab("jobs");
    setView("list");
    setClientName("");
    setXeroDone(false);
  }, []);

  return {
    // State
    jobs, quotes, job, quote,
    channels, members, messages,
    activeChannel, activeChannelId, setActiveChannelId,
    unreadByChannel, totalUnread,
    activeTab, setActiveTab,
    theme, toggleTheme,
    view, setView,
    activeId, setActiveId,
    clientName, setClientName,
    syncStatus: outboxStatus,
    gpsLocking,
    xeroSyncing, xeroDone,

    // Staff identity
    staffMembers, currentStaff, currentStaffId, setCurrentStaffId, currentStaffName,
    running, startedAt,

    // Shift (log-on / log-off)
    shifts: state.shifts, activeShift, openBreak, trackingActive, shiftTracking,
    logOn, startMealBreak, endMealBreak, logOff, interpretActiveShift, sendOnTheWay,

    // Actions
    openJob, openQuote, createQuote, updateQuoteMeta,
    startClockOn, clockOff, addPhoto, saveSignature,
    addLine, updateLine, removeLine,
    sendQuote, approveQuote,
    startXeroSync, resetDemo,

    // Slack
    sendMessage, openChannel, toggleReaction, postMessage,

    // Documents
    documents: state.documents, rfis: state.rfis,
    addDocument, updateDocument, addDocumentVersion, deleteDocument,
    raiseRfi, answerRfi, closeRfi,

    // Sync
    pendingSyncCount, retryFailedSync, retrySyncOperation, discardFailedSync,

    // Navigation
    handleBack, closeInvoice,

    // Dispatch (for low-level use)
    dispatch,
  };
}
