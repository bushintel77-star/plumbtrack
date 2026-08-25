import type { AppState } from "@/types";
import type { Action } from "./actions";

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "MERGE_REMOTE": {
      const remoteJobIds = new Set(action.jobs.map((j) => j.id));
      const remoteQuoteIds = new Set(action.quotes.map((q) => q.id));
      return {
        ...state,
        jobs: [
          // Backfill staffId on legacy server entries (single-operator model),
          // and merge time entries so locally-pending (unsynced) ones survive
          // while synced entries dedupe against their server twins.
          ...action.jobs.map((j) => {
            const local = state.jobs.find((lj) => lj.id === j.id);
            const remoteEntries = (j.timeEntries ?? []).map((e) => ({ ...e, staffId: e.staffId ?? "tim" }));
            if (!local) {
              return { ...j, timeEntries: remoteEntries };
            }
            const remoteIds = new Set(remoteEntries.map((e) => e.id));
            const pendingLocal = local.timeEntries.filter(
              (e) => !remoteIds.has(e.id) && state.serverEntryIds[e.id] === undefined,
            );
            return {
              ...j,
              timeEntries: [...remoteEntries, ...pendingLocal],
              serviceItems: [
                ...(j.serviceItems ?? []),
                ...(local.serviceItems ?? []).filter((item) => !(j.serviceItems ?? []).some((remoteItem) => remoteItem.id === item.id)),
              ],
              voiceNotes: [
                ...(j.voiceNotes ?? []),
                ...(local.voiceNotes ?? []).filter((note) => !(j.voiceNotes ?? []).some((remoteNote) => remoteNote.id === note.id)),
              ],
              safetyConfirmation: local.safetyConfirmation ?? j.safetyConfirmation,
              phone: local.phone ?? j.phone,
              accessCode: local.accessCode ?? j.accessCode,
            };
          }),
          // Preserve locally-created jobs the server doesn't know about yet.
          ...state.jobs.filter((j) => !remoteJobIds.has(j.id)),
        ],
        quotes: [
          ...action.quotes,
          ...state.quotes.filter((q) => !remoteQuoteIds.has(q.id)),
        ],
      };
    }

    case "CLOCK_ON": {
      const entryId = crypto.randomUUID();
      const start = new Date().toISOString();
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? {
                ...j,
                timeEntries: [
                  ...j.timeEntries,
                  { id: entryId, staffId: action.staffId, start, end: null, lat: action.lat, lng: action.lng },
                ],
              }
            : j,
        ),
        // Queue the write so the server gets the authoritative timesheet.
        syncQueue: [
          ...state.syncQueue,
          {
            kind: "clock-in",
            opId: crypto.randomUUID(),
            jobId: action.jobId,
            localEntryId: entryId,
            payload: { staffId: action.staffId, start, lat: action.lat, lng: action.lng },
          },
        ],
      };
    }

    case "CLOCK_OFF": {
      // Close the latest open entry for this staff member only — other crew
      // members' running entries on the same job stay untouched.
      let closedEntryId: string | null = null;
      const jobs = state.jobs.map((j) => {
        if (j.id !== action.jobId) return j;
        let closed = false;
        const timeEntries = j.timeEntries.map((e) => {
          if (closed) return e;
          if (e.staffId === action.staffId && e.end === null) {
            closed = true;
            closedEntryId = e.id;
            return { ...e, end: new Date().toISOString() };
          }
          return e;
        });
        return { ...j, timeEntries };
      });
      if (!closedEntryId) return state;
      const openDependency = state.syncQueue.find(
        (op) => op.kind === "clock-in" && op.localEntryId === closedEntryId,
      );
      return {
        ...state,
        jobs,
        // Queue the close so it replays against the server entry once the
        // matching clock-in has been acknowledged.
        syncQueue: [
          ...state.syncQueue,
          {
            kind: "clock-out",
            opId: crypto.randomUUID(),
            jobId: action.jobId,
            localEntryId: closedEntryId,
            payload: { end: new Date().toISOString() },
            ...(openDependency ? { dependsOn: [openDependency.opId] } : {}),
          },
        ],
      };
    }

    case "REMOVE_SYNC_OP":
      return { ...state, syncQueue: state.syncQueue.filter((op) => op.opId !== action.opId) };

    // ── Shifts (log-on / log-off) ───────────────────────────────────────────

    case "LOG_ON": {
      // One open shift per staff member — a second log-on is ignored.
      const alreadyOn = state.shifts.some(
        (s) => s.staffId === action.staffId && s.loggedOffAt === null,
      );
      if (alreadyOn) return state;
      return {
        ...state,
        shifts: [
          ...state.shifts,
          {
            id: crypto.randomUUID(),
            staffId: action.staffId,
            workType: action.workType,
            loggedOnAt: action.startedAt,
            loggedOffAt: null,
            breaks: [],
            toilElection: false,
            trackingNoticeAckAt: action.noticeAckAt,
          },
        ],
      };
    }

    case "START_BREAK": {
      return {
        ...state,
        shifts: state.shifts.map((s) =>
          s.staffId === action.staffId && s.loggedOffAt === null && !s.breaks.some((b) => b.end === null)
            ? { ...s, breaks: [...s.breaks, { id: crypto.randomUUID(), start: new Date().toISOString(), end: null }] }
            : s,
        ),
      };
    }

    case "END_BREAK": {
      return {
        ...state,
        shifts: state.shifts.map((s) =>
          s.staffId === action.staffId && s.loggedOffAt === null
            ? {
                ...s,
                breaks: s.breaks.map((b) =>
                  b.end === null ? { ...b, end: new Date().toISOString() } : b,
                ),
              }
            : s,
        ),
      };
    }

    case "LOG_OFF": {
      // Log-off finalises the whole workday: any open meal break is closed,
      // every open time entry for the staff member is closed across all jobs
      // (each queued for offline replay), and the shift is sealed with the
      // work-type / allowance / TOIL decisions captured at log-off.
      let foundOpen = false;
      const shifts = state.shifts.map((s) => {
        if (s.staffId !== action.staffId || s.loggedOffAt !== null) return s;
        foundOpen = true;
        return {
          ...s,
          loggedOffAt: action.endedAt,
          breaks: s.breaks.map((b) => (b.end === null ? { ...b, end: action.endedAt } : b)),
          ...(action.workType !== undefined ? { workType: action.workType } : {}),
          ...(action.kmDriven !== undefined ? { kmDriven: action.kmDriven } : {}),
          ...(action.toilElection !== undefined ? { toilElection: action.toilElection } : {}),
        };
      });
      if (!foundOpen) return state;

      const closedAt = action.endedAt;
      const closedIds: string[] = [];
      const jobs = state.jobs.map((j) => {
        let changed = false;
        const timeEntries = j.timeEntries.map((e) => {
          if (e.staffId === action.staffId && e.end === null) {
            changed = true;
            closedIds.push(e.id);
            return { ...e, end: closedAt };
          }
          return e;
        });
        return changed ? { ...j, timeEntries } : j;
      });

      const clockOutOps = closedIds.map((entryId) => {
        const jobId = jobs.find((j) => j.timeEntries.some((e) => e.id === entryId))?.id ?? "";
        const openDependency = state.syncQueue.find(
          (op) => op.kind === "clock-in" && op.localEntryId === entryId,
        );
        return {
          kind: "clock-out" as const,
          opId: crypto.randomUUID(),
          jobId,
          localEntryId: entryId,
          payload: { end: closedAt },
          ...(openDependency ? { dependsOn: [openDependency.opId] } : {}),
        };
      });

      return { ...state, shifts, jobs, syncQueue: [...state.syncQueue, ...clockOutOps] };
    }

    case "QUEUE_NOTIFICATION":
      return {
        ...state,
        syncQueue: state.syncQueue.some((op) => op.opId === action.opId)
          ? state.syncQueue
          : [
              ...state.syncQueue,
              {
                kind: "notification" as const,
                opId: action.opId,
                payload: { text: action.text, channel: action.channel, author: action.author },
                dependsOn: action.dependsOn,
              },
            ],
      };

    case "CLEAR_SYNC_QUEUE":
      return { ...state, syncQueue: [] };

    case "RECORD_ENTRY_SERVER_ID":
      return {
        ...state,
        serverEntryIds: { ...state.serverEntryIds, [action.localEntryId]: action.serverId },
      };

    case "ADD_PHOTO":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? { ...j, photos: [...j.photos, action.photo] }
            : j,
        ),
      };

    case "ADD_SERVICE_ITEM":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? { ...j, serviceItems: [...(j.serviceItems ?? []), action.item] }
            : j,
        ),
      };

    case "UPDATE_SERVICE_ITEM_QTY":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? {
                ...j,
                serviceItems: (j.serviceItems ?? []).map((item) =>
                  item.id === action.itemId ? { ...item, qty: Math.max(1, action.qty) } : item,
                ),
              }
            : j,
        ),
      };

    case "REMOVE_SERVICE_ITEM":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? { ...j, serviceItems: (j.serviceItems ?? []).filter((item) => item.id !== action.itemId) }
            : j,
        ),
      };

    case "ADD_VOICE_NOTE":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? { ...j, voiceNotes: [...(j.voiceNotes ?? []), action.note] }
            : j,
        ),
      };

    case "SET_SAFETY_CONFIRMATION":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId ? { ...j, safetyConfirmation: action.confirmation } : j,
        ),
      };

    case "SIGN_JOB":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? { ...j, signature: action.signature, status: "completed" as const, client: action.client }
            : j,
        ),
      };

    case "SET_JOB_STATUS":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId ? { ...j, status: action.status } : j,
        ),
      };

    case "CREATE_QUOTE": {
      const createOp = {
        kind: "create-quote" as const,
        opId: crypto.randomUUID(),
        localQuoteId: action.quote.id,
        payload: {
          client: action.quote.client,
          address: action.quote.address,
          description: action.quote.description,
          lines: action.quote.lines.map(({ desc, qty, unit, rate }) => ({ desc, qty, unit, rate })),
        },
      };
      return { ...state, quotes: [action.quote, ...state.quotes], syncQueue: [...state.syncQueue, createOp] };
    }

    case "UPDATE_QUOTE_META": {
      const quote = state.quotes.find((item) => item.id === action.quoteId);
      if (!quote) return state;
      const op = {
        kind: "sync-quote" as const,
        opId: crypto.randomUUID(),
        quoteId: action.quoteId,
        payload: { [action.field]: action.value },
      };
      return {
        ...state,
        quotes: state.quotes.map((item) => item.id === action.quoteId ? { ...item, [action.field]: action.value } : item),
        syncQueue: [...state.syncQueue, op],
      };
    }

    case "UPDATE_QUOTE_STATUS": {
      const op = {
        kind: "sync-quote" as const,
        opId: crypto.randomUUID(),
        quoteId: action.quoteId,
        payload: {
          status: action.status,
          ...(action.signature !== undefined && { signature: action.signature }),
        },
      };
      return {
        ...state,
        quotes: state.quotes.map((q) =>
          q.id === action.quoteId
            ? { ...q, status: action.status, ...(action.signature !== undefined && { signature: action.signature }) }
            : q,
        ),
        syncQueue: [...state.syncQueue, op],
      };
    }

    case "ADD_QUOTE_LINE":
      return {
        ...state,
        quotes: state.quotes.map((q) =>
          q.id === action.quoteId ? { ...q, lines: [...q.lines, action.line] } : q,
        ),
      };

    case "UPDATE_QUOTE_LINE": {
      const { field } = action;
      return {
        ...state,
        quotes: state.quotes.map((q) =>
          q.id === action.quoteId
            ? {
                ...q,
                lines: q.lines.map((l) =>
                  l.id === action.lineId
                    ? { ...l, [field]: field === "desc" || field === "unit" ? action.value : Number(action.value) }
                    : l,
                ),
              }
            : q,
        ),
      };
    }

    case "REMOVE_QUOTE_LINE":
      return {
        ...state,
        quotes: state.quotes.map((q) =>
          q.id === action.quoteId
            ? { ...q, lines: q.lines.filter((l) => l.id !== action.lineId) }
            : q,
        ),
      };

    case "CREATE_JOB_FROM_QUOTE": {
      // Enqueue a server-side create op for the new job.  Until the op
      // replays, the job lives under its local temporary id.
      const createOp = {
        kind: "create-job" as const,
        opId: crypto.randomUUID(),
        localJobId: action.job.id,
        payload: {
          client: action.job.client,
          address: action.job.address,
          scope: action.job.scope,
          ...(action.job.phone ? { phone: action.job.phone } : {}),
          ...(action.job.accessCode ? { accessCode: action.job.accessCode } : {}),
        },
      };
      return {
        ...state,
        jobs: [action.job, ...state.jobs],
        syncQueue: [...state.syncQueue, createOp],
      };
    }

    case "REPLACE_JOB":
      return {
        ...state,
        jobs: state.jobs.map((j) => (j.id === action.localId ? action.job : j)),
      };

    case "MARK_JOB_XERO_SYNCED":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId ? { ...j, xeroSyncedAt: new Date().toISOString() } : j,
        ),
      };

    case "POST_MESSAGE":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            channelId: action.channelId,
            authorId: action.authorId,
            text: action.text,
            ts: new Date().toISOString(),
            reactions: {},
          },
        ],
      };

    case "TOGGLE_REACTION":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId
            ? {
                ...m,
                reactions: {
                  ...m.reactions,
                  [action.emoji]: (m.reactions[action.emoji] ?? 0) > 0 ? 0 : 1,
                },
              }
            : m,
        ),
      };

    case "MARK_CHANNEL_READ":
      return {
        ...state,
        channels: state.channels.map((c) =>
          c.id === action.channelId ? { ...c, lastReadAt: action.ts } : c,
        ),
      };

    case "ADD_MANUAL_TIME":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? {
                ...j,
                timeEntries: [
                  ...j.timeEntries,
                  {
                    id: crypto.randomUUID(),
                    staffId: action.staffId,
                    start: action.start,
                    end: action.end,
                    lat: null,
                    lng: null,
                  },
                ],
              }
            : j,
        ),
      };

    case "ADD_LOG_ENTRY":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId ? { ...j, logEntries: [...j.logEntries, action.entry] } : j,
        ),
      };

    case "ADD_DAILY_REPORT": {
      const exists = state.jobs.find((j) => j.id === action.jobId)?.dailyReports.find((r) => r.id === action.report.id);
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? {
                ...j,
                dailyReports: exists
                  ? j.dailyReports.map((r) => (r.id === action.report.id ? action.report : r))
                  : [...j.dailyReports, action.report],
              }
            : j,
        ),
      };
    }

    case "ADD_CHECKLIST":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId ? { ...j, checklists: [...j.checklists, action.checklist] } : j,
        ),
      };

    case "TOGGLE_CHECKLIST_ITEM":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? {
                ...j,
                checklists: j.checklists.map((c) =>
                  c.id === action.checklistId
                    ? {
                        ...c,
                        items: c.items.map((it) =>
                          it.id === action.itemId ? { ...it, result: action.result } : it,
                        ),
                        completedAt: c.items.every((it) => (it.id === action.itemId ? action.result : it.result) !== null)
                          ? new Date().toISOString()
                          : null,
                      }
                    : c,
                ),
              }
            : j,
        ),
      };

    case "ADD_MILESTONE":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId ? { ...j, milestones: [...j.milestones, action.milestone] } : j,
        ),
      };

    case "UPDATE_MILESTONE":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? {
                ...j,
                milestones: j.milestones.map((m) =>
                  m.id === action.milestoneId
                    ? {
                        ...m,
                        status: action.status,
                        ...(action.status === "claimed" ? { claimedAt: new Date().toISOString() } : {}),
                        ...(action.status === "paid" ? { paidAt: new Date().toISOString() } : {}),
                      }
                    : m,
                ),
              }
            : j,
        ),
      };

    case "SUBMIT_DAILY_REPORT":
      return {
        ...state,
        jobs: state.jobs.map((j) =>
          j.id === action.jobId
            ? {
                ...j,
                dailyReports: j.dailyReports.map((r) =>
                  r.id === action.reportId ? { ...r, submittedAt: new Date().toISOString() } : r,
                ),
              }
            : j,
        ),
      };

    default:
      return state;
  }
}
