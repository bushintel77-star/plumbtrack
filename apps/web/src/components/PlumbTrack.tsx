"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Cloud,
  Droplet,
  Map,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  Sun,
  Moon,
  Trash2,
  Wifi,
  ArrowLeft,
  X,
  Camera,
} from "lucide-react";

import type { Job, View } from "@/types";
import {
  CALLOUT_FEE,
  CENTS_PER_KM,
  GPS_LOCK_DURATION_MS,
  RATE_STANDARD,
  XERO_SYNC_DURATION_MS,
} from "@/lib/constants";
import {
  disaggregateForStp,
  interpretStoredShift,
  previousShiftEnd,
} from "@/lib/award";
import {
  derivedJobStatus,
  formatDuration,
  gstAmount,
  incGst,
  invoiceTotal,
  jobCosting,
  labourTotal,
  quoteSubtotal,
  totalClosedSeconds,
} from "@/lib/billing";
import { useTimer } from "@/hooks/useTimer";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { PlumbTrackProvider, usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { GlassCard } from "@/components/ui/GlassCard";
import { useToast } from "@/components/ui/Toast";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { BottomNav } from "@/components/layout/BottomNav";
import { MessagesView, useMessagesDrawer } from "./messages/MessagesView";
import { StaffClockInSheet } from "@/components/messages/StaffClockInSheet";
import { TodayStream } from "@/components/features/TodayStream";
import { NotificationFeedView } from "@/components/notifications/NotificationFeedView";
import { DailyReportView } from "@/components/features/DailyReportView";
import { ResidentialJobView } from "@/components/features/ResidentialJobView";
import { ProjectDashboard } from "@/components/features/ProjectDashboard";
import { SyncCenterView } from "@/components/features/SyncCenterView";
import { IntegrationHub } from "@/components/features/IntegrationHub";
import { IntegrationHealthView } from "@/components/features/IntegrationHealthView";

// ── Main export ─────────────────────────────────────────────────────────────

export default function PlumbTrack() {
  return (
    <PlumbTrackProvider>
      <PlumbTrackInner />
    </PlumbTrackProvider>
  );
}

// ── Inner component (has context access) ────────────────────────────────────

function PlumbTrackInner() {
  const s = usePlumbTrackCtx();
  const { job, quote, view, activeTab, clientName, running, startedAt, theme } = s;
  const [staffSheet, setStaffSheet] = useState<{ open: boolean; mode: "clockin" | "switch" }>({
    open: false,
    mode: "clockin",
  });
  const messages = useMessagesDrawer();

  // Timer — per-staff, uses absolute UTC timestamps for resilience
  const liveSeconds = useTimer(running, startedAt);
  const online = useOnlineStatus();
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const openStaffClockIn = () => setStaffSheet({ open: true, mode: "clockin" });
  const closeStaffSheet = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setStaffSheet((prev) => ({ ...prev, open: false }));
  };

  // Clock press: running staff clock off directly; idle staff pick who clocks on.
  const onClockPress = () => {
    if (running) {
      s.clockOff();
      toast.toast("info", `${s.currentStaffName} clocked off`);
    } else openStaffClockIn();
  };
  const closedSeconds = job ? totalClosedSeconds(job.timeEntries) : 0;
  const billedSeconds = closedSeconds + (running ? liveSeconds : 0);

  const showBack = view !== "list";
  const isMessages = view === "list" && activeTab === "messages";

  function headerLabel(): string {
    if (view === "gpsLock") return "Acquiring GPS…";
    if (view === "notificationFeed") return "Notification Feed";
    if (view === "timesheet") return "Staff Timesheets";
    if (view === "syncCenter") return "Sync Centre";
    if (view === "integrationHealth") return "Integration Health";
    if (view === "dailyReport") return "Daily Report";
    if (view === "checklist") return "Safety Checklist";
    if (view === "dashboard") return "Dashboard";
    if (view === "list") {
      if (activeTab === "jobs") return "Today's Jobs";
      if (activeTab === "quotes") return "Quotes";
      if (activeTab === "messages") return "Messages";
      if (activeTab === "dashboard") return "Dashboard";
      return "Settings";
    }
    if (view === "job") return job?.id ?? "";
    if (view === "signoff") return "Sign Off";
    if (view === "invoice") return "Invoice";
    if (view === "quote") return quote?.id ?? "";
    if (view === "quoteSignoff") return "Approve Quote";
    return "";
  }

  return (
    <div data-theme={theme} className="app-shell min-h-screen flex flex-col relative overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="app-header px-4 py-2.5 flex items-center gap-2.5 shrink-0 relative z-10">
        {showBack ? (
          <button
            type="button"
            onClick={s.handleBack}
            className="p-2 -ml-1 rounded-xl hover:bg-slate-800 active:bg-slate-700 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={20} className="text-slate-400" />
          </button>
        ) : isMessages ? (
          <button
            type="button"
            onClick={messages.openDrawer}
            className="p-2 -ml-1 rounded-xl hover:bg-slate-800 active:bg-slate-700 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Open channel list"
          >
            <Map size={20} className="text-slate-400" />
          </button>
        ) : (
          <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center">
            <Droplet size={20} className="text-accent" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.15em] text-accent font-bold leading-none mb-1">
            Caulfield South Plumbing
          </p>
          <p className="text-base font-semibold text-white truncate">{headerLabel()}</p>
        </div>

        {/* Persistent tracking transparency chip — visible whenever the
            shift-level GPS watch is alive (on shift, not on break). */}
        {(s.activeShift || s.openBreak) && (
          <span
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider"
            style={{
              background: s.trackingActive ? "rgba(74,222,128,0.1)" : "rgba(251,191,36,0.1)",
              border: `1px solid ${s.trackingActive ? "rgba(74,222,128,0.25)" : "rgba(251,191,36,0.25)"}`,
              color: s.trackingActive ? "#4ADE80" : "#FBBF24",
            }}
            aria-label={
              s.trackingActive
                ? "Location tracking active"
                : "On unpaid meal break — location tracking paused"
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${s.trackingActive ? "bg-green-400 animate-pulse" : "bg-amber-400"}`}
            />
            {s.trackingActive ? "Tracking" : "Paused"}
          </span>
        )}
      </header>

      {/* ── GPS Lock Overlay ───────────────────────────────────── */}
      {view === "gpsLock" && <GpsLockOverlay />}

      {/* ── Offline banner (client-only to avoid SSR hydration mismatch) ─── */}
      {mounted && !online && (
        <div className="bg-amber-900/60 border-b border-amber-700/50 px-5 py-2.5 text-center z-10">
          <p className="text-amber-200 text-xs font-medium tracking-wide flex items-center justify-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            You are offline — changes will sync when connectivity returns
          </p>
        </div>
      )}

      {/* ── Main Content ───────────────────────────────────────── */}
      {isMessages ? (
        <MessagesView drawerOpen={messages.drawerOpen} openDrawer={messages.openDrawer} closeDrawer={messages.closeDrawer} />
      ) : (
        <main
          className="app-main flex-1 overflow-y-auto pb-[calc(1.5rem+var(--bottom-nav-clearance))]"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#334155 transparent" }}
        >
          {view === "list" && activeTab === "jobs" && <TodayStream />}
          {view === "list" && activeTab === "quotes" && <QuoteListView />}
          {view === "list" && activeTab === "dashboard" && <ProjectDashboard />}
            {view === "list" && activeTab === "settings" && <SettingsView />}
          {view === "notificationFeed" && <NotificationFeedView />}
          {view === "timesheet" && <TimesheetView />}
          {view === "syncCenter" && <SyncCenterView />}
          {view === "integrationHealth" && <IntegrationHealthView />}
          {view === "dailyReport" && job && <DailyReportView />}
          {view === "dashboard" && <ProjectDashboard />}
          {view === "job" && job && (
            <ResidentialJobView
              job={job}
              billedSeconds={billedSeconds}
              onClockPress={onClockPress}
              onSwitchStaff={() => setStaffSheet({ open: true, mode: "switch" })}
            />
          )}
          {view === "signoff" && job && <JobSignoffView job={job} />}
          {view === "invoice" && job && <InvoiceView job={job} billedSeconds={billedSeconds} />}
          {view === "quote" && quote && <QuoteBuilderView quote={quote} />}
          {view === "quoteSignoff" && quote && <QuoteSignoffView quote={quote} />}
        </main>
      )}

      {/* ── Bottom Tab Bar (list view only) ────────────────────── */}
      {view === "list" && (
        <BottomNav activeTab={activeTab} onTabChange={s.setActiveTab} unreadCount={mounted ? s.totalUnread : 0} />
      )}

      {/* ── Staff clock-in / operator sheet ─────────────────────── */}
      <StaffClockInSheet
        open={staffSheet.open}
        mode={staffSheet.mode}
        onClose={closeStaffSheet}
      />
    </div>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────

function QuoteListView() {
  const { quotes, openQuote, createQuote } = usePlumbTrackCtx();

  return (
    <div className="p-3 space-y-2">
      <button type="button" onClick={createQuote} className="w-full min-h-[48px] rounded-xl bg-accent text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-accent/20 haptic">
        <Plus size={16} /> New quote
      </button>
      {quotes.map((q) => {
        const sub = quoteSubtotal(q.lines);
        return (
        <button
          key={q.id}
          type="button"
          onClick={() => openQuote(q.id)}
                       className="surface-card surface-card--interactive w-full text-left p-3.5 min-h-[80px]"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-mono tracking-wide text-slate-500 bg-white/[0.04] border border-white/[0.06] rounded-md px-1.5 py-0.5">
              {q.id}
            </span>
            <QuoteStatusBadge status={q.status} />
          </div>
          <p className="font-semibold text-white text-[15px] tracking-tight mb-0.5">{q.client}</p>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <MapPin size={11} /> {q.address}
          </p>
          <p className="text-sm text-slate-500 mt-2 line-clamp-2 leading-relaxed">{q.description}</p>
          <p className="text-sm font-bold text-accent mt-2">${incGst(sub).toFixed(2)} inc. GST</p>
        </button>
      )})}
    </div>
  );
}

function SettingsView() {
  const { discardFailedSync, resetDemo, pendingSyncCount, retryFailedSync, syncStatus, theme, toggleTheme } = usePlumbTrackCtx();
  const { setView } = usePlumbTrackCtx();
  const [slackStatus, setSlackStatus] = useState<"checking" | "connected" | "offline">("checking");

  useEffect(() => {
    import("@/lib/notifications").then(({ fetchSlackStatus }) => {
      fetchSlackStatus()
        .then((r) => setSlackStatus(r.slackConnected ? "connected" : "offline"))
        .catch(() => setSlackStatus("offline"));
    });
  }, []);

  return (
    <div className="p-3 space-y-2">
      <GlassCard>
        <h3 className="text-white font-semibold text-sm mb-4">Business Profile</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Company</span><span className="text-white">Caulfield South Plumbing</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Trade</span><span className="text-white">Plumbing</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Labour Rate</span><span className="text-white">${RATE_STANDARD}/hr</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Callout Fee</span><span className="text-white">${CALLOUT_FEE}</span></div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold text-sm">Appearance</h3>
            <p className="text-slate-500 text-xs mt-1">Choose the field view that suits your light conditions.</p>
          </div>
          <button type="button" onClick={toggleTheme} className="theme-toggle min-h-[44px] rounded-xl px-3 flex items-center gap-2 text-xs font-bold" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="text-white font-semibold text-sm mb-4">Integrations</h3>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-slate-400" />
            <p className="text-white text-sm font-medium">Slack</p>
          </div>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
            slackStatus === "checking" ? "bg-slate-700/50 text-slate-400" :
            slackStatus === "connected" ? "bg-accent/15 text-accent" : "bg-slate-700/50 text-slate-500"
          }`}>
            {slackStatus === "checking" ? "Checking…" : slackStatus === "connected" ? "Connected" : "Offline"}
          </span>
        </div>
        <p className="text-slate-500 text-xs">
          {slackStatus === "offline" ? "Dispatcher unreachable — in-app simulation only" :
           slackStatus === "connected" ? "Live relay to HQ Slack workspace" : "Checking dispatcher status…"}
        </p>
        <button
          type="button"
          onClick={() => setView("notificationFeed")}
          className="w-full mt-4 py-3 rounded-xl bg-white/[0.04] text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[48px] active:bg-white/[0.08] transition border border-white/[0.08]"
        >
          <Send size={13} /> View Notification Feed
        </button>
        <button
          type="button"
          onClick={() => setView("timesheet")}
          className="w-full mt-3 py-3 rounded-xl bg-white/[0.04] text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[48px] active:bg-white/[0.08] transition border border-white/[0.08]"
        >
          <Clock size={13} /> View Staff Timesheets
        </button>
        <button
          type="button"
          onClick={() => setView("syncCenter")}
          className="w-full mt-3 py-3 rounded-xl bg-white/[0.04] text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[48px] active:bg-white/[0.08] transition border border-white/[0.08]"
        >
          <Cloud size={13} /> Open Sync Centre
        </button>
        <button
          type="button"
          onClick={() => setView("integrationHealth")}
          className="w-full mt-3 py-3 rounded-xl bg-accent/10 text-accent text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[48px] active:bg-accent/20 transition border border-accent/20"
        >
          <Wifi size={13} /> Integration Health
        </button>
      </GlassCard>

      <IntegrationHub />

      <GlassCard>
        <h3 className="text-white font-semibold text-sm mb-4">Data</h3>
        <p className="text-slate-500 text-xs mb-4">
          Field actions save locally first and sync automatically when connectivity returns.
        </p>
        <div className="flex items-center gap-2 mb-4">
          <span className={`w-2 h-2 rounded-full ${pendingSyncCount > 0 ? "bg-accent animate-pulse" : "bg-accent/30"}`} />
          <p className="text-xs text-slate-400">
            {syncStatus.label}
          </p>
        </div>
        {syncStatus.failed > 0 && (
          <div className="space-y-2 mb-3">
            <button type="button" onClick={() => { void retryFailedSync(); }} className="w-full min-h-[48px] rounded-xl bg-red-500/10 text-red-300 text-xs font-semibold border border-red-500/20 active:bg-red-500/20 transition">
              Retry failed updates
            </button>
            <button type="button" onClick={() => { void discardFailedSync(); }} className="w-full min-h-[44px] rounded-xl bg-white/[0.04] text-slate-400 text-xs font-semibold border border-white/[0.08] active:bg-white/[0.08] transition">
              Dismiss failed updates
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={resetDemo}
          className="w-full py-3 rounded-xl bg-red-500/10 text-red-400 text-xs font-semibold border border-red-500/20 hover:bg-red-500/20 transition min-h-[48px]"
        >
          Reset Demo Data
        </button>
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Job Signoff
// ═══════════════════════════════════════════════════════════════════════════════

function JobSignoffView({ job }: { job: Job }) {
  const { saveSignature, clientName, setClientName } = usePlumbTrackCtx();

  return (
    <div className="p-3 space-y-2">
      <GlassCard>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Completion summary</p>
        <p className="text-sm text-slate-300 mb-2">{job.scope}</p>
        <div className="grid grid-cols-3 gap-2">
          {job.photos.map((p) => (
            <div key={p.id} className="aspect-square surface-inset flex flex-col items-center justify-center text-slate-500">
              {p.url ? (
                <img src={p.url} alt={p.label} className="w-full h-full object-cover rounded-xl" />
              ) : (
                <>
                  <Camera size={14} />
                  <span className="text-[9px] mt-1">{p.label}</span>
                </>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Client name (confirm)</label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={job.client}
          className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-white mb-3 focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <SignaturePad onSave={saveSignature} confirmLabel="Confirm client signature" />
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Invoice
// ═══════════════════════════════════════════════════════════════════════════════

function InvoiceView({ job, billedSeconds }: { job: Job; billedSeconds: number }) {
  const { xeroSyncing, xeroDone, startXeroSync, closeInvoice, quotes } = usePlumbTrackCtx();
  const labour = labourTotal(billedSeconds);
  const reportMaterials = job.dailyReports.flatMap((report) => report.materials ?? []);
  const serviceItems = job.serviceItems ?? [];
  const hasFixedServiceKit = serviceItems.some((item) => item.source === "kit");
  const materialsTotal = reportMaterials.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const serviceItemsTotal = serviceItems.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const baseInvoiceTotal = hasFixedServiceKit ? 0 : invoiceTotal(billedSeconds);
  const total = baseInvoiceTotal + materialsTotal + serviceItemsTotal;
  const synced = !!job.xeroSyncedAt || xeroDone;

  const originQuote = job.quoteId ? quotes.find((q) => q.id === job.quoteId) : undefined;
  const costing = jobCosting(originQuote?.lines, billedSeconds);

  return (
    <div className="p-3 space-y-2">
      <GlassCard className="text-center">
        <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto mb-1.5">
          <Check size={20} />
        </div>
        <p className="font-semibold text-white">Job Signed Off</p>
        <p className="text-xs text-slate-500 mt-0.5">Completion report ready for {job.client}</p>
      </GlassCard>

      <GlassCard>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Invoice — {job.id}</p>
        <div className="text-sm space-y-2">
          {hasFixedServiceKit ? (
            <div className="flex justify-between text-slate-300"><span>Fixed service package</span><span>${serviceItemsTotal.toFixed(2)}</span></div>
          ) : (
            <>
              <div className="flex justify-between text-slate-300"><span>Callout fee</span><span>${CALLOUT_FEE.toFixed(2)}</span></div>
              <div className="flex justify-between text-slate-300">
                <span>Labour · {formatDuration(Math.floor(billedSeconds))} @ ${RATE_STANDARD}/hr</span>
                <span>${labour.toFixed(2)}</span>
              </div>
            </>
          )}
          {serviceItemsTotal > 0 && !hasFixedServiceKit && (
            <div className="flex justify-between text-slate-300">
              <span>Service items · {serviceItems.length} item{serviceItems.length === 1 ? "" : "s"}</span>
              <span>${serviceItemsTotal.toFixed(2)}</span>
            </div>
          )}
          {materialsTotal > 0 && (
            <div className="flex justify-between text-slate-300">
              <span>Daily report materials · {reportMaterials.length} item{reportMaterials.length === 1 ? "" : "s"}</span>
              <span>${materialsTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="h-px bg-white/[0.06]" />
          <div className="flex justify-between font-bold text-white"><span>Total (excl. GST)</span><span>${total.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-500 text-xs"><span>GST (10%)</span><span>${gstAmount(total).toFixed(2)}</span></div>
        </div>
        {job.signature && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <p className="text-[10px] text-slate-600 mb-1">Client signature</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={job.signature} alt="Client signature" className="h-12 rounded-lg border border-white/[0.08] bg-white/[0.03]" />
          </div>
        )}
      </GlassCard>

      {/* ── Job costing (quote vs actual) ────────────────────── */}
      {costing && (
        <GlassCard>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quote vs Actual</p>
          <div className="text-sm space-y-2.5">
            <div className="flex justify-between text-slate-300">            <span>Labour estimated (quote)</span><span>${costing.quoteLabour.toFixed(2)}</span></div>
            <div className="flex justify-between text-slate-300"><span>Labour actual</span><span>${costing.actualLabour.toFixed(2)}</span></div>
            <div className="h-px bg-white/[0.06]" />
            <div className={`flex justify-between font-bold text-sm ${costing.overBudget ? "text-red-400" : "text-accent"}`}>
              <span>{costing.overBudget ? "Over budget" : "Under budget"}</span>
              <span>{costing.overBudget ? "+" : "−"}${Math.abs(costing.actualLabour - costing.quoteLabour).toFixed(2)}</span>
            </div>
          </div>
        </GlassCard>
      )}

      <button type="button" onClick={startXeroSync} disabled={xeroSyncing || synced}      className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98] transition ${
          synced
            ? "bg-accent/15 text-accent border border-accent/30"
            : "surface-card text-white disabled:opacity-50"
        }`}
      >
        {xeroSyncing ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Syncing to Xero…</>)
        : synced ? (<><Check size={15} /> Invoice created in Xero</>)
        : (<><Send size={15} /> Sync to Xero &amp; Close</>)}
      </button>
      {synced && (
        <button type="button" onClick={closeInvoice}
          className="w-full py-3 rounded-xl bg-slate-800/50 text-slate-400 text-sm font-medium border border-slate-700/50 active:bg-slate-700/50 transition min-h-[48px]"
        >Back to Jobs</button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Quote Builder + Signoff
// ═══════════════════════════════════════════════════════════════════════════════

function QuoteBuilderView({ quote }: { quote: import("@/types").Quote }) {
  const { addLine, updateLine, removeLine, updateQuoteMeta, sendQuote } = usePlumbTrackCtx();
  const sub = quoteSubtotal(quote.lines);

  return (
    <div className="p-3 space-y-2">
      <GlassCard>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quote details</p>
        <div className="space-y-2">
          {(["client", "address", "description"] as const).map((field) => (
            <label key={field} className="block">
              <span className="sr-only">Quote {field}</span>
              {field === "description" ? (
                <textarea value={quote[field]} onChange={(event) => updateQuoteMeta(quote.id, field, event.target.value)} rows={2} className="w-full app-input border rounded-lg px-3 py-2 text-sm text-white resize-y" aria-label={`Quote ${field}`} />
              ) : (
                <input value={quote[field]} onChange={(event) => updateQuoteMeta(quote.id, field, event.target.value)} className="w-full app-input border rounded-lg px-3 py-2 text-sm text-white" aria-label={`Quote ${field}`} />
              )}
            </label>
          ))}
        </div>
      </GlassCard>
      <GlassCard>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Line Items</p>
        <div className="space-y-2">
          {quote.lines.map((l) => (
            <div key={l.id} className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor={`quote-${quote.id}-${l.id}-description`}>Description for line item {l.id}</label>
              <input id={`quote-${quote.id}-${l.id}-description`} value={l.desc} onChange={(e) => updateLine(l.id, "desc", e.target.value)}
                className="flex-1 text-xs app-input border rounded px-2 py-1.5 text-white" />
              <label className="sr-only" htmlFor={`quote-${quote.id}-${l.id}-quantity`}>Quantity for {l.desc}</label>
              <input id={`quote-${quote.id}-${l.id}-quantity`} type="number" min="0.01" value={l.qty} onChange={(e) => updateLine(l.id, "qty", Number(e.target.value))}
                className="w-12 text-xs app-input border rounded px-1.5 py-1.5 text-center text-white" />
              <span className="text-[10px] text-slate-500 w-6">{l.unit}</span>
              <span className="text-xs text-slate-500">$</span>
              <label className="sr-only" htmlFor={`quote-${quote.id}-${l.id}-rate`}>Rate for {l.desc}</label>
              <input id={`quote-${quote.id}-${l.id}-rate`} type="number" min="0" value={l.rate} onChange={(e) => updateLine(l.id, "rate", Number(e.target.value))}
                className="w-14 text-xs app-input border rounded px-1.5 py-1.5 text-center text-white" />
              <button type="button" onClick={() => removeLine(l.id)} aria-label={`Remove line item ${l.desc}`} className="w-9 h-9 flex items-center justify-center rounded-md text-slate-600 hover:text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine} className="mt-3 min-h-[44px] text-xs flex items-center gap-1 text-accent font-medium">
          <Plus size={13} /> Add line item
        </button>
        <div className="border-t border-white/[0.06] mt-3 pt-3 text-sm space-y-1">
          <div className="flex justify-between text-slate-400"><span>Subtotal (ex. GST)</span><span>${sub.toFixed(2)}</span></div>
          <div className="flex justify-between text-slate-500 text-xs"><span>GST (10%)</span><span>${gstAmount(sub).toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold text-white"><span>Total</span><span>${incGst(sub).toFixed(2)}</span></div>
        </div>
      </GlassCard>
      <button type="button" onClick={sendQuote} disabled={quote.lines.length === 0 || !quote.client.trim() || !quote.address.trim() || !quote.description.trim()}
        className="w-full py-3.5 rounded-xl bg-accent text-white font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98] transition shadow-lg shadow-accent/25"
      ><Send size={15} /> Send quote for client approval</button>
    </div>
  );
}

function QuoteSignoffView({ quote }: { quote: import("@/types").Quote }) {
  const { clientName, setClientName, approveQuote } = usePlumbTrackCtx();
  const sub = quoteSubtotal(quote.lines);

  return (
    <div className="p-3 space-y-2">
      <GlassCard>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Quote summary — {quote.id}</p>
        <p className="text-sm text-slate-300 mb-2">{quote.description}</p>
        <div className="text-sm space-y-1">
          {quote.lines.map((l) => (
            <div key={l.id} className="flex justify-between text-slate-400">
              <span>{l.desc} × {l.qty}{l.unit}</span>
              <span>${(l.qty * l.rate).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-white/[0.06] mt-2 pt-2 flex justify-between font-semibold text-white text-sm">
          <span>Total inc. GST</span><span>${incGst(sub).toFixed(2)}</span>
        </div>
      </GlassCard>
      <GlassCard>
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Client name (confirm)</label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={quote.client}
          className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-white mb-3 focus:outline-none focus:ring-2 focus:ring-accent/50"
        />
        <SignaturePad onSave={(dataUrl) => approveQuote(dataUrl)} confirmLabel="Approve quote" />
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GPS Lock Overlay
// ═══════════════════════════════════════════════════════════════════════════════

function GpsLockOverlay() {
  return (
    <div className="absolute inset-0 z-20 app-overlay flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 rounded-full border-4 border-accent/30 border-t-accent animate-spin" />
      <p className="text-white font-semibold text-lg">Acquiring GPS…</p>
      <p className="text-slate-500 text-sm">Locking your position at the job address</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Timesheet View
// ═══════════════════════════════════════════════════════════════════════════════

function TimesheetView() {
  const { jobs, members, shifts } = usePlumbTrackCtx();
  const [period, setPeriod] = useState<"week" | "month">("week");

  const staffHours = useMemo(() => {
    const now = Date.now();
    const cutoff = now - (period === "week" ? 7 : 30) * 24 * 60 * 60 * 1000;
    const map: Record<string, {
      name: string;
      totalSec: number;
      entries: { jobId: string; start: string; end: string | null; duration: number }[];
    }> = {};
    for (const m of members.filter((x) => x.role !== "bot")) {
      map[m.id] = { name: m.name, totalSec: 0, entries: [] };
    }
    for (const j of jobs) {
      for (const e of j.timeEntries) {
        if (!e.start || new Date(e.start).getTime() < cutoff) continue;
        const sid = e.staffId ?? "tim";
        if (!map[sid]) continue;
        const duration = e.end
          ? (new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000
          : (Date.now() - new Date(e.start).getTime()) / 1000;
        map[sid].totalSec += duration;
        map[sid].entries.push({ jobId: j.id, start: e.start, end: e.end, duration });
      }
    }
    return Object.values(map).filter((s) => s.totalSec > 0).sort((a, b) => b.totalSec - a.totalSec);
  }, [jobs, members, period]);

  // Award-interpreted shifts per staff member, chained chronologically so
  // clause 16.5 (10-hour rest) sees the previous shift's log-off.
  const staffShifts = useMemo(() => {
    const now = Date.now();
    const cutoff = now - (period === "week" ? 7 : 30) * 24 * 60 * 60 * 1000;
    return members
      .filter((m) => m.role !== "bot")
      .map((m) => {
        const mine = shifts
          .filter((s) => s.staffId === m.id)
          .filter((s) => new Date(s.loggedOnAt).getTime() >= cutoff)
          .sort((a, b) => new Date(a.loggedOnAt).getTime() - new Date(b.loggedOnAt).getTime());
        const interpreted = mine.map((shift) => {
          const breakdown = interpretStoredShift(shift, previousShiftEnd(shifts, m.id, shift.loggedOnAt));
          const stp = disaggregateForStp(breakdown, {
            kmDriven: shift.kmDriven,
            toilElection: shift.toilElection,
          });
          return { shift, breakdown, stp };
        });
        // lucide's Map icon shadows the global Map in this module — use a Record.
        const codeHours: Record<string, number> = {};
        let grossPay = 0;
        let totalHours = 0;
        const stpTotals = { ote: 0, overtime: 0, ph: 0, allowance: 0, toilHours: 0 };
        for (const { breakdown, stp } of interpreted) {
          grossPay += breakdown.grossPay;
          totalHours += breakdown.totalHours;
          for (const c of breakdown.components) {
            codeHours[c.code] = (codeHours[c.code] ?? 0) + c.hours;
          }
          stpTotals.ote += stp.ordinaryTimeEarnings;
          stpTotals.overtime += stp.overtime;
          stpTotals.ph += stp.publicHolidayPenalty;
          stpTotals.allowance += stp.centsPerKmAllowance;
          stpTotals.toilHours += stp.toilAccruedHours;
        }
        return {
          name: m.name,
          interpreted,
          codeHours: Object.entries(codeHours).sort(
            (a, b) => PAY_CODE_ORDER.indexOf(a[0]) - PAY_CODE_ORDER.indexOf(b[0]),
          ),
          grossPay,
          totalHours,
          stpTotals,
        };
      })
      .filter((s) => s.interpreted.length > 0);
  }, [members, shifts, period]);

  return (
    <div className="p-3 space-y-2">
      <div className="flex gap-2">
        {(["week", "month"] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider min-h-[44px] transition ${
              period === p ? "bg-accent/15 text-accent border border-accent/30" : "surface-card text-slate-400 border border-white/[0.08]"
            }`}
          >{p === "week" ? "This Week" : "This Month"}</button>
        ))}
      </div>

      {staffShifts.map((s) => (
        <GlassCard key={s.name}>
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="font-semibold text-white text-sm">{s.name}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">MA000036 · shifts: {s.interpreted.length}</p>
            </div>
            <div className="text-right">
              <span className="block text-xs font-mono text-accent bg-accent/10 rounded-lg px-2 py-0.5">
                {s.totalHours.toFixed(2)} hrs
              </span>
              <span className="block text-[10px] text-slate-500 mt-1 font-mono">
                gross ${s.grossPay.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 mb-3">
            {s.codeHours.map(([code, hours]) => (
              <div key={code} className="flex justify-between text-xs text-slate-400">
                <span>{PAY_CODE_LABELS[code] ?? code}</span>
                <span className="font-mono">{hours.toFixed(2)} hrs</span>
              </div>
            ))}
          </div>

          <div className="pt-2.5 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">STP Phase 2</p>
            <div className="flex justify-between text-[11.5px] text-slate-500"><span>Ordinary time earnings</span><span className="font-mono">${s.stpTotals.ote.toFixed(2)}</span></div>
            <div className="flex justify-between text-[11.5px] text-slate-500"><span>Overtime (separate)</span><span className="font-mono">${s.stpTotals.overtime.toFixed(2)}</span></div>
            {s.stpTotals.ph > 0 && (
              <div className="flex justify-between text-[11.5px] text-slate-500"><span>Public holiday penalty</span><span className="font-mono">${s.stpTotals.ph.toFixed(2)}</span></div>
            )}
            {s.stpTotals.allowance > 0 && (
              <div className="flex justify-between text-[11.5px] text-slate-500"><span>Allowance — cents per km</span><span className="font-mono">${s.stpTotals.allowance.toFixed(2)}</span></div>
            )}
            {s.stpTotals.toilHours > 0 && (
              <div className="flex justify-between text-[11.5px] text-accent"><span>TOIL accrued</span><span className="font-mono">{s.stpTotals.toilHours.toFixed(2)} hrs</span></div>
            )}
          </div>
        </GlassCard>
      ))}

      {staffHours.length === 0 && staffShifts.length === 0 && (
        <GlassCard><p className="text-slate-500 text-sm text-center py-4">No hours recorded this {period}.</p></GlassCard>
      )}

      {staffHours.length > 0 && (
        <>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 pt-1">Job time entries</p>
          {staffHours.map((s) => (
            <GlassCard key={s.name}>
              <div className="flex justify-between items-center mb-3">
                <p className="font-semibold text-white text-sm">{s.name}</p>
                <span className="text-xs font-mono text-accent bg-accent/10 rounded-lg px-2 py-0.5">{formatDuration(Math.floor(s.totalSec))}</span>
              </div>
              <div className="space-y-1.5">
                {s.entries.slice(0, 10).map((e, i) => (
                  <div key={i} className="flex justify-between text-xs text-slate-500">
                    <span className="truncate max-w-[55%]">{e.jobId}</span>
                    <span className="font-mono">{formatDuration(Math.floor(e.duration))}</span>
                    <span className={e.end ? "text-slate-600" : "text-accent"}>{e.end ? "closed" : "running"}</span>
                  </div>
                ))}
                {s.entries.length > 10 && <p className="text-[10px] text-slate-600 mt-1">+{s.entries.length - 10} more entries</p>}
              </div>
            </GlassCard>
          ))}
        </>
      )}

      {(staffHours.length > 0 || staffShifts.length > 0) && (
        <button type="button"
          onClick={() => exportTimesheetCsv(staffShifts, staffHours, period)}
          className="w-full py-3 rounded-xl bg-white/[0.04] text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[48px] active:bg-white/[0.08] transition border border-white/[0.08]"
        ><Send size={13} /> Export Payroll CSV (STP Phase 2)</button>
      )}
    </div>
  );
}

const PAY_CODE_ORDER = ["ORDINARY", "OT_150", "OT_200", "PH_250"];
const PAY_CODE_LABELS: Record<string, string> = {
  ORDINARY: "Ordinary hours (100%)",
  OT_150: "Overtime — first 2 hrs (150%)",
  OT_200: "Overtime (200%)",
  PH_250: "Public holiday (250%)",
};

function exportTimesheetCsv(
  shiftRows: {
    name: string;
    interpreted: { shift: import("@/types").Shift; breakdown: import("@/lib/award").ShiftPayBreakdown; stp: import("@/lib/award").StpDisaggregation }[];
    stpTotals: { ote: number; overtime: number; ph: number; allowance: number; toilHours: number };
  }[],
  entryRows: { name: string; totalSec: number; entries: { jobId: string; start: string; end: string | null; duration: number }[] }[],
  period: "week" | "month",
) {
  const lines = ["Staff,RecordType,Detail,Start,End,Hours,Amount (AUD)"];
  for (const s of shiftRows) {
    for (const { shift, breakdown, stp } of s.interpreted) {
      for (const c of breakdown.components) {
        lines.push(
          `"${s.name}","${PAY_CODE_LABELS[c.code] ?? c.code}","${shift.workType} shift ×${c.multiplier}","${shift.loggedOnAt}","${shift.loggedOffAt ?? ""}",${c.hours.toFixed(2)},${c.amount.toFixed(2)}`,
        );
      }
      lines.push(`"${s.name}","Allowance — cents per km","${stp.kmClaimed} km @ ${CENTS_PER_KM}c","${shift.loggedOnAt}","${shift.loggedOffAt ?? ""}",,${stp.centsPerKmAllowance.toFixed(2)}`);
      if (stp.toilAccruedHours > 0) {
        lines.push(`"${s.name}","TOIL accrued (1:1)","overtime banked","${shift.loggedOnAt}","${shift.loggedOffAt ?? ""}",${stp.toilAccruedHours.toFixed(2)},0.00`);
      }
    }
    lines.push(`"${s.name}","STP — Ordinary time earnings","","","",,${s.stpTotals.ote.toFixed(2)}`);
    lines.push(`"${s.name}","STP — Overtime","","","",,${s.stpTotals.overtime.toFixed(2)}`);
    lines.push(`"${s.name}","STP — Public holiday penalty","","","",,${s.stpTotals.ph.toFixed(2)}`);
    lines.push(`"${s.name}","STP — Allowance (cents per km)","","","",,${s.stpTotals.allowance.toFixed(2)}`);
    lines.push(`"${s.name}","STP — TOIL accrued (hours)","","","",${s.stpTotals.toilHours.toFixed(2)},`);
  }
  for (const s of entryRows) {
    for (const e of s.entries) {
      lines.push(
        `"${s.name}","Job time entry","${e.jobId}","${new Date(e.start).toISOString()}","${e.end ? new Date(e.end).toISOString() : ""}",${(e.duration / 3600).toFixed(2)},`,
      );
    }
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `plumbtrack-timesheet-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Status Badges
// ═══════════════════════════════════════════════════════════════════════════════

function QuoteStatusBadge({ status }: { status: import("@/types").QuoteStatus }) {
  const styles: Record<string, string> = {
    accepted: "bg-white/[0.08] text-slate-300 border border-white/[0.08]",
    sent: "bg-accent/15 text-accent border border-accent/20",
    draft: "bg-slate-700/50 text-slate-400 border border-white/[0.06]",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-0.5 rounded-full ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  );
}
