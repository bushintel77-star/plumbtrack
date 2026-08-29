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
  Trash2,
  Wifi,
  ArrowLeft,
  X,
  Camera,
  CreditCard,
  Copy,
  ExternalLink,
  Search,
  LayoutDashboard,
  FolderOpen,
  Settings,
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
import { config } from "@/lib/config";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { PlumbTrackProvider, usePlumbTrackCtx } from "@/state/usePlumbTrack";
import { GlassCard } from "@/components/ui/GlassCard";
import { BottomSheet, SheetActionCard } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { describeSession, enrollDeviceSession, getAuthSession, type AuthSession } from "@/lib/auth";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { BottomNav } from "@/components/layout/BottomNav";
import { MessagesView, useMessagesDrawer } from "./messages/MessagesView";
import { StaffClockInSheet } from "@/components/messages/StaffClockInSheet";
import { TodayStream } from "@/components/features/TodayStream";
import { CrewRouteJobTree } from "@/components/features/CrewRouteJobTree";
import { SearchSheet } from "@/components/search/SearchSheet";
import { DocumentsView } from "@/components/features/DocumentsView";
import { NotificationFeedView } from "@/components/notifications/NotificationFeedView";
import { DailyReportView } from "@/components/features/DailyReportView";
import { ResidentialJobView } from "@/components/features/ResidentialJobView";
import { ProjectDashboard } from "@/components/features/ProjectDashboard";
import { SyncCenterView } from "@/components/features/SyncCenterView";
import { IntegrationHub } from "@/components/features/IntegrationHub";
import { IntegrationHealthView } from "@/components/features/IntegrationHealthView";
import { formatSerial, formatSerialWithHash } from "@/lib/display";

type AppTheme = "dark" | "light";
const THEME_STORAGE_KEY = "plumbtrack-theme";

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
  const { job, quote, view, activeTab, clientName, running, startedAt, openJob, openQuote } = s;
  const [staffSheet, setStaffSheet] = useState<{ open: boolean; mode: "clockin" | "switch" }>({
    open: false,
    mode: "clockin",
  });
  const messages = useMessagesDrawer();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchDocFocus, setSearchDocFocus] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    const nextTheme: AppTheme = saved === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const changeTheme = (nextTheme: AppTheme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

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
  const isDashboardSurface = view === "dashboard" || (view === "list" && (activeTab === "jobs" || activeTab === "dashboard"));

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
      if (activeTab === "documents") return "Documents";
      return "Settings";
    }
    if (view === "job") return job ? formatSerial(job.id) : "";
    if (view === "signoff") return "Sign Off";
    if (view === "invoice") return "Invoice";
    if (view === "quote") return quote ? formatSerial(quote.id) : "";
    if (view === "quoteSignoff") return "Approve Quote";
    return "";
  }

  return (
    <div
      data-theme={theme}
      className={`app-shell min-h-screen flex flex-col relative overflow-hidden ${isDashboardSurface ? "dashboard-chassis" : "workspace-flat"}`}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="app-header px-4 pt-[calc(env(safe-area-inset-top)+0.625rem)] pb-2.5 flex items-center gap-2.5 shrink-0 relative z-10">
        {showBack ? (
          <button
            type="button"
            onClick={s.handleBack}
            className="p-2 -ml-1 rounded-xl hover:bg-fill-strong active:bg-fill-strong transition min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={20} className="text-ink-low" />
          </button>
        ) : isMessages ? (
          <button
            type="button"
            onClick={messages.openDrawer}
            className="p-2 -ml-1 rounded-xl hover:bg-fill-strong active:bg-fill-strong transition min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Open channel list"
          >
            <Map size={20} className="text-ink-low" />
          </button>
        ) : (
          <div className="w-11 h-11 rounded-xl bg-accent-dim flex items-center justify-center instrument-mark" aria-hidden="true">
            <Droplet size={20} className="text-accent" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-2xs uppercase tracking-[0.15em] text-accent font-bold leading-none mb-1">
            {config.orgName}
          </p>
          <p className="text-lg font-bold text-ink truncate instrument-wordmark">{headerLabel()}</p>
        </div>

        {/* Global search */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="shrink-0 w-11 h-11 rounded-xl hover:bg-fill-strong active:bg-fill-strong transition flex items-center justify-center"
          aria-label="Search everything"
        >
          <Search size={20} className="text-ink-low" />
        </button>

        {/* Persistent tracking transparency chip */}
        {(s.activeShift || s.openBreak) && (
          <span
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-2xs font-bold uppercase tracking-wider"
            style={{
              background: s.trackingActive ? "var(--status-complete-dim)" : "var(--status-pending-dim)",
              border: `1px solid ${s.trackingActive ? "var(--status-complete-border)" : "var(--status-pending-border)"}`,
              color: s.trackingActive ? "var(--status-complete)" : "var(--status-pending)",
            }}
            aria-label={
              s.trackingActive
                ? "Location tracking active"
                : "On unpaid meal break — location tracking paused"
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${s.trackingActive ? "bg-complete animate-pulse" : "bg-pending"}`}
            />
            {s.trackingActive ? "Tracking" : "Paused"}
          </span>
        )}
      </header>

      {/* ── GPS Lock Overlay ───────────────────────────────────── */}
      {view === "gpsLock" && <GpsLockOverlay />}

      {/* ── Offline banner ─── */}
      {mounted && !online && (
        <div className="bg-pending-dim border-b border-pending-line px-5 py-2.5 text-center z-10">
          <p className="text-pending text-xs font-medium tracking-wide flex items-center justify-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-pending animate-pulse" />
            You are offline — changes will sync when connectivity returns
          </p>
        </div>
      )}

      {/* ── Main Content ───────────────────────────────────────── */}
      {isMessages ? (
        <MessagesView
          drawerOpen={messages.drawerOpen}
          openDrawer={messages.openDrawer}
          closeDrawer={messages.closeDrawer}
          onOpenJob={(id) => openJob(`J-${id}`)}
          onOpenQuote={(id) => openQuote(`Q-${id}`)}
        />
      ) : (
        <main
          className="app-main flex-1 overflow-y-auto pb-[calc(1.5rem+var(--bottom-nav-clearance))]"
          style={{ scrollbarWidth: "thin", scrollbarColor: "var(--surface-border) transparent" }}
        >
          {view === "list" && activeTab === "jobs" && <><CrewRouteJobTree /><TodayStream /></>}
          {view === "list" && activeTab === "quotes" && <QuoteListView />}
          {view === "list" && activeTab === "dashboard" && <ProjectDashboard />}
          {view === "list" && activeTab === "documents" && (
            <DocumentsView
              focusDocId={searchDocFocus}
              onFocusConsumed={() => setSearchDocFocus(null)}
            />
          )}
          {view === "list" && activeTab === "settings" && <SettingsView theme={theme} onThemeChange={changeTheme} />}
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
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setMoreOpen(false);
            s.setActiveTab(tab);
          }}
          onMorePress={() => setMoreOpen(true)}
          unreadCount={mounted ? s.totalUnread : 0}
        />
      )}

      {/* ── More — weekly-touch destinations ───────────────────── */}
      <BottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        subtitle="Lower-frequency destinations"
        label="More destinations"
      >
        <div className="grid grid-cols-2 gap-2.5">
          <SheetActionCard
            icon={LayoutDashboard}
            title="Dashboard"
            hint="Portfolio progress at a glance"
            onClick={() => {
              setMoreOpen(false);
              s.setActiveTab("dashboard");
            }}
          />
          <SheetActionCard
            icon={FolderOpen}
            title="Documents"
            hint="Specs, certs and compliance vault"
            onClick={() => {
              setMoreOpen(false);
              s.setActiveTab("documents");
            }}
          />
          <SheetActionCard
            icon={Settings}
            title="Settings"
            hint="Theme, integrations and demo data"
            onClick={() => {
              setMoreOpen(false);
              s.setActiveTab("settings");
            }}
          />
        </div>
      </BottomSheet>

      {/* ── Staff clock-in / operator sheet ─────────────────────── */}
      <StaffClockInSheet
        open={staffSheet.open}
        mode={staffSheet.mode}
        onClose={closeStaffSheet}
      />

      {/* ── Global search ────────────────────────────────────────── */}
      <SearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenDocument={(documentId) => {
          setSearchDocFocus(documentId);
          s.setActiveTab("documents");
        }}
      />
    </div>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────

function QuoteListView() {
  const { quotes, openQuote, createQuote } = usePlumbTrackCtx();

  return (
    <div className="p-3 space-y-2">
      <button type="button" onClick={createQuote} className="hardware-pusher w-full min-h-[48px] text-sm font-bold flex items-center justify-center gap-2 haptic">
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
            <span className="text-xs font-mono tracking-wide text-ink-low bg-fill border border-line rounded-md px-1.5 py-0.5">
              {formatSerialWithHash(q.id)}
            </span>
            <QuoteStatusBadge status={q.status} />
          </div>
          <p className="font-semibold text-ink text-base tracking-tight mb-0.5">{q.client}</p>
          <p className="text-xs text-ink-low flex items-center gap-1.5">
            <span className="icon-socket icon-socket--xs"><MapPin size={12} /></span> {q.address}
          </p>
          <p className="text-sm text-ink-low mt-2 line-clamp-2 leading-relaxed">{q.description}</p>
          <p className="text-sm font-bold text-accent mt-2">${incGst(sub).toFixed(2)} inc. GST</p>
        </button>
      )})}
    </div>
  );
}

function SettingsView({ theme, onThemeChange }: { theme: AppTheme; onThemeChange: (theme: AppTheme) => void }) {
  const { discardFailedSync, resetDemo, pendingSyncCount, retryFailedSync, syncStatus } = usePlumbTrackCtx();
  const { setView } = usePlumbTrackCtx();
  const [slackStatus, setSlackStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    setAuthSession(getAuthSession());
  }, []);

  const reEnroll = async () => {
    setEnrolling(true);
    const session = await enrollDeviceSession();
    setAuthSession(session);
    setEnrolling(false);
  };

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
        <h3 className="text-ink font-semibold text-sm mb-4">Business Profile</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-ink-low">Company</span><span className="text-ink">{config.orgName}</span></div>
          <div className="flex justify-between"><span className="text-ink-low">Trade</span><span className="text-ink">Plumbing</span></div>
          <div className="flex justify-between"><span className="text-ink-low">Labour Rate</span><span className="text-ink">${RATE_STANDARD}/hr</span></div>
          <div className="flex justify-between"><span className="text-ink-low">Callout Fee</span><span className="text-ink">${CALLOUT_FEE}</span></div>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-ink font-semibold text-sm">Appearance</h3>
            <p className="text-ink-low text-xs mt-1">Choose the field view for current light conditions.</p>
          </div>
          <div className="appearance-switch" role="group" aria-label="Appearance theme">
            <span className={`appearance-switch-thumb ${theme === "light" ? "is-light" : ""}`} aria-hidden="true" />
            <button
              type="button"
              className={`appearance-switch-option ${theme === "dark" ? "is-active" : ""}`}
              aria-pressed={theme === "dark"}
              onClick={() => onThemeChange("dark")}
            >
              DARK
            </button>
            <button
              type="button"
              className={`appearance-switch-option ${theme === "light" ? "is-active" : ""}`}
              aria-pressed={theme === "light"}
              onClick={() => onThemeChange("light")}
            >
              LIGHT
            </button>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <h3 className="text-ink font-semibold text-sm mb-4">Integrations</h3>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-ink-low" />
            <p className="text-ink text-sm font-medium">Slack</p>
          </div>
          <span className={`text-2xs font-black uppercase tracking-normal px-2 py-1 rounded-full ${
            slackStatus === "checking" ? "bg-fill-strong text-ink-low" :
            slackStatus === "connected" ? "bg-accent-dim text-accent" : "bg-fill-strong text-ink-low"
          }`}>
            {slackStatus === "checking" ? "Checking…" : slackStatus === "connected" ? "Connected" : "Offline"}
          </span>
        </div>
        <p className="text-ink-low text-xs">
          {slackStatus === "offline" ? "Dispatcher unreachable — in-app simulation only" :
           slackStatus === "connected" ? "Live relay to HQ Slack workspace" : "Checking dispatcher status…"}
        </p>
        <button
          type="button"
          onClick={() => setView("notificationFeed")}
          className="w-full mt-4 py-3 rounded-xl bg-fill text-ink-mid text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[48px] active:bg-fill-strong transition border border-line"
        >
          <Send size={14} /> View Notification Feed
        </button>
        <button
          type="button"
          onClick={() => setView("timesheet")}
          className="w-full mt-3 py-3 rounded-xl bg-fill text-ink-mid text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[48px] active:bg-fill-strong transition border border-line"
        >
          <Clock size={14} /> View Staff Timesheets
        </button>
        <button
          type="button"
          onClick={() => setView("syncCenter")}
          className="w-full mt-3 py-3 rounded-xl bg-fill text-ink-mid text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[48px] active:bg-fill-strong transition border border-line"
        >
          <Cloud size={14} /> Open Sync Centre
        </button>
        <button
          type="button"
          onClick={() => setView("integrationHealth")}
          className="w-full mt-3 py-3 rounded-xl bg-accent-dim text-accent text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[48px] active:bg-accent-dim transition border border-accent-line"
        >
          <Wifi size={14} /> Integration Health
        </button>
      </GlassCard>

      <IntegrationHub />

      <GlassCard>
        <div className="flex items-center justify-between gap-3 mb-4"><h3 className="text-ink font-semibold text-sm">Data</h3><span className={`sync-live-indicator ${syncStatus.failed > 0 ? "is-attention" : syncStatus.pending > 0 ? "is-queued" : "is-live"}`}><span aria-hidden="true" />{syncStatus.failed > 0 ? "Needs attention" : syncStatus.pending > 0 ? "Queued" : "Live"}</span></div>
        <p className="text-ink-low text-xs mb-4">
          Everything syncs automatically when a connection exists. Open Sync Centre only when a queued update needs attention.
        </p>
        <div className="flex items-center gap-2 mb-4">
          <span className={`w-2 h-2 rounded-full ${pendingSyncCount > 0 ? "bg-accent animate-pulse" : "bg-fill-strong"}`} />
          <p className="text-xs text-ink-low">
            {syncStatus.label}
          </p>
        </div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-ink-low">API endpoint</span>
          <span className="text-xs font-mono text-ink-low truncate max-w-[55%]">{config.apiUrl}</span>
        </div>
        <div className="flex items-center justify-between mb-4 gap-2">
          <span className="text-xs text-ink-low">Device session</span>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${authSession ? "bg-complete" : "bg-fill-strong"}`} />
            <span className="text-xs text-ink-low truncate">{describeSession(authSession)}</span>
            <button
              type="button"
              onClick={() => { void reEnroll(); }}
              disabled={enrolling}
              className="shrink-0 text-2xs font-bold uppercase tracking-wider text-accent disabled:opacity-50 min-h-[32px] px-2 rounded-lg border border-accent-line haptic"
            >
              {enrolling ? "Enrolling…" : "Re-enroll"}
            </button>
          </span>
        </div>
        {syncStatus.failed > 0 && (
          <div className="space-y-2 mb-3">
            <button type="button" onClick={() => { void retryFailedSync(); }} className="w-full min-h-[48px] rounded-xl bg-urgent-dim text-urgent text-xs font-semibold border border-urgent-line active:bg-urgent-dim transition">
              Retry failed updates
            </button>
            <button type="button" onClick={() => { void discardFailedSync(); }} className="w-full min-h-[44px] rounded-xl bg-fill text-ink-low text-xs font-semibold border border-line active:bg-fill-strong transition">
              Dismiss failed updates
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setLogoutOpen(true)
          className="w-full py-3 rounded-xl bg-fill text-ink-low text-xs font-semibold border border-line hover:bg-fill-strong transition min-h-[48px]"
        >
          Log Out
        </button>
        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className="w-full py-3 rounded-xl bg-urgent-dim text-urgent text-xs font-semibold border border-urgent-line hover:bg-urgent-dim transition min-h-[48px]"
        >
          Reset Demo Data
        </button>
      </GlassCard>

      <GlassCard>
        <h3 className="text-ink font-semibold text-sm mb-1">Free tier services</h3>
        <p className="text-ink-low text-xs mb-3">Everything below is $0/month — no subscriptions required.</p>
        <div className="space-y-2.5">
          {[
            { name: "Slack relay", detail: "Incoming webhook · posts field updates to your channel", live: "Free plan" },
            { name: "Stripe payments", detail: "Checkout pay-links on invoices · charges only when a client pays", live: "Test mode free" },
            { name: "Weather (Open-Meteo)", detail: "Live conditions in daily reports · keyless API", live: "Free" },
            { name: "Payroll export", detail: "STP Phase 2 CSV from the timesheet", live: "Free" },
            { name: "CI (GitHub Actions)", detail: "Lint, typecheck, test and build on every push", live: "Free minutes" },
          ].map((svc) => (
            <div key={svc.name} className="flex items-center gap-3">
              <span className="icon-socket icon-socket--xs icon-socket--complete shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink">{svc.name}</p>
                <p className="text-xs text-ink-low leading-relaxed">{svc.detail}</p>
              </div>
              <span className="shrink-0 text-2xs font-black uppercase tracking-normal px-2 py-1 rounded-full bg-complete-dim text-complete border border-complete-line">
                {svc.live}
              </span>
            </div>
          ))}
        </div>
      </GlassCard>

      <BottomSheet open={logoutOpen} onClose={() => setLogoutOpen(false)} title="Log out?" subtitle="This clears your local session" label="Confirm log out">
        <div className="space-y-3">
          <p className="text-sm text-ink-mid leading-relaxed">
            All locally saved shifts, job progress, and sync state will be cleared. The app will reload with fresh demo data.
          </p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setLogoutOpen(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong bg-fill text-sm font-semibold text-ink-mid active:bg-fill-strong transition haptic">
              Cancel
            </button>
            <button type="button" onClick={resetDemo} className="flex-1 min-h-[48px] rounded-xl bg-urgent text-on-accent text-sm font-bold active:bg-urgent transition haptic">
              Log out
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={resetOpen} onClose={() => setResetOpen(false)} title="Reset demo data?" subtitle="This clears everything stored on this device" label="Confirm reset">
        <div className="space-y-3">
          <p className="text-sm text-ink-mid leading-relaxed">
            All field work, photos, quotes, messages, shifts and sync history saved locally will be permanently removed and replaced with the original demo data.
          </p>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setResetOpen(false)} className="flex-1 min-h-[48px] rounded-xl border border-line-strong bg-fill text-sm font-semibold text-ink-mid active:bg-fill-strong transition haptic">
              Cancel
            </button>
            <button type="button" onClick={resetDemo} className="flex-1 min-h-[48px] rounded-xl bg-urgent text-on-accent text-sm font-bold active:bg-urgent transition haptic">
              Reset everything
            </button>
          </div>
        </div>
      </BottomSheet>
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
        <p className="text-xs font-bold text-ink-low uppercase tracking-wider mb-2">Completion summary</p>
        <p className="text-sm text-ink-mid mb-2">{job.scope}</p>
        <div className="grid grid-cols-3 gap-2">
          {job.photos.map((p) => (
            <div key={p.id} className="aspect-square surface-inset flex flex-col items-center justify-center text-ink-low">
              {p.url ? (
                <img src={p.url} alt={p.label} className="w-full h-full object-cover rounded-xl" />
              ) : (
                <>
                  <Camera size={14} />
                  <span className="text-2xs mt-1">{p.label}</span>
                </>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <label className="text-xs font-bold text-ink-low uppercase tracking-wider block mb-1">Client name (confirm)</label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={job.client}
          className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink mb-3 focus:outline-none focus:ring-2 focus:ring-accent/50"
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
  const [payLink, setPayLink] = useState<{ url: string; mode: "live" | "test" } | null>(null);
  const [payLinkBusy, setPayLinkBusy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
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

  const createPayLink = async () => {
    setPayLinkBusy(true);
    try {
      const result = await api.createPaymentLink(job.id, total);
      setPayLink({ url: result.url, mode: result.mode });
    } catch {
      setPayLink({
        url: `https://checkout.stripe.com/c/pay/cs_test_plumbtrack_${job.id.replace(/[^A-Za-z0-9-]/g, "")}`,
        mode: "test",
      });
    } finally {
      setPayLinkBusy(false);
    }
  };

  const copyPayLink = async () => {
    if (!payLink) return;
    try {
      await navigator.clipboard?.writeText(payLink.url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1600);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="p-3 space-y-2">
      <GlassCard className="text-center">
        <div className="w-10 h-10 rounded-full bg-accent-dim text-accent flex items-center justify-center mx-auto mb-1.5">
          <Check size={20} />
        </div>
        <p className="font-semibold text-ink">Job Signed Off</p>
        <p className="text-xs text-ink-low mt-0.5">Completion report ready for {job.client}</p>
      </GlassCard>

      <GlassCard>
        <p className="text-xs font-bold text-ink-low uppercase tracking-wider mb-2.5">Invoice — {formatSerial(job.id)}</p>
        <div className="text-sm space-y-2">
          {hasFixedServiceKit ? (
            <div className="flex justify-between text-ink-mid"><span>Fixed service package</span><span>${serviceItemsTotal.toFixed(2)}</span></div>
          ) : (
            <>
              <div className="flex justify-between text-ink-mid"><span>Callout fee</span><span>${CALLOUT_FEE.toFixed(2)}</span></div>
              <div className="flex justify-between text-ink-mid">
                <span>Labour · {formatDuration(Math.floor(billedSeconds))} @ ${RATE_STANDARD}/hr</span>
                <span>${labour.toFixed(2)}</span>
              </div>
            </>
          )}
          {serviceItemsTotal > 0 && !hasFixedServiceKit && (
            <div className="flex justify-between text-ink-mid">
              <span>Service items · {serviceItems.length} item{serviceItems.length === 1 ? "" : "s"}</span>
              <span>${serviceItemsTotal.toFixed(2)}</span>
            </div>
          )}
          {materialsTotal > 0 && (
            <div className="flex justify-between text-ink-mid">
              <span>Daily report materials · {reportMaterials.length} item{reportMaterials.length === 1 ? "" : "s"}</span>
              <span>${materialsTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="h-px bg-fill-strong" />
          <div className="flex justify-between font-bold text-ink"><span>Total (excl. GST)</span><span>${total.toFixed(2)}</span></div>
          <div className="flex justify-between text-ink-low text-xs"><span>GST (10%)</span><span>${gstAmount(total).toFixed(2)}</span></div>
        </div>
        {job.signature && (
          <div className="mt-3 pt-3 border-t border-line">
            <p className="text-2xs text-ink-low mb-1">Client signature</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={job.signature} alt="Client signature" className="h-12 rounded-lg border border-line bg-fill" />
          </div>
        )}
      </GlassCard>

      {/* ── Job costing (quote vs actual) ────────────────────── */}
      {costing && (
        <GlassCard>
          <p className="text-xs font-bold text-ink-low uppercase tracking-wider mb-3">Quote vs Actual</p>
          <div className="text-sm space-y-2.5">
            <div className="flex justify-between text-ink-mid">            <span>Labour estimated (quote)</span><span>${costing.quoteLabour.toFixed(2)}</span></div>
            <div className="flex justify-between text-ink-mid"><span>Labour actual</span><span>${costing.actualLabour.toFixed(2)}</span></div>
            <div className="h-px bg-fill-strong" />
            <div className={`flex justify-between font-bold text-sm ${costing.overBudget ? "text-urgent" : "text-accent"}`}>
              <span>{costing.overBudget ? "Over budget" : "Under budget"}</span>
              <span>{costing.overBudget ? "+" : "−"}${Math.abs(costing.actualLabour - costing.quoteLabour).toFixed(2)}</span>
            </div>
          </div>
        </GlassCard>
      )}

      <button type="button" onClick={startXeroSync} disabled={xeroSyncing || synced}      className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98] transition ${
          synced
            ? "bg-accent-dim text-accent border border-accent-line"
            : "surface-card text-ink disabled:opacity-50"
        }`}
      >
        {xeroSyncing ? (<><div className="w-4 h-4 border-2 border-edge border-t-edge rounded-full animate-spin" />Syncing to Xero…</>)
        : synced ? (<><Check size={16} /> Invoice created in Xero</>)
        : (<><Send size={16} /> Sync to Xero &amp; Close</>)}
      </button>
      {synced && (
        <button type="button" onClick={closeInvoice}
          className="w-full py-3 rounded-xl bg-fill-strong text-ink-low text-sm font-medium border border-line active:bg-fill-strong transition min-h-[48px]"
        >Back to Jobs</button>
      )}

      <GlassCard>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-ink-low uppercase tracking-wider">Payment</p>
          {payLink && (
            <span className={`text-2xs font-black uppercase tracking-normal px-2 py-1 rounded-full border ${payLink.mode === "live" ? "bg-complete-dim text-complete border-complete-line" : "bg-pending-dim text-pending border-pending-line"}`}>
              {payLink.mode === "live" ? "LIVE CHECKOUT" : "TEST MODE — NO CHARGE"}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-low mb-2.5">Stripe Checkout is free to use — no subscription; Stripe only takes a cut when the client pays.</p>
        {!payLink ? (
          <button
            type="button"
            onClick={createPayLink}
            disabled={payLinkBusy}
            className="w-full min-h-[48px] rounded-xl bg-fill-strong border border-line text-ink text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 haptic"
          >
            {payLinkBusy ? (<><div className="w-4 h-4 border-2 border-edge border-t-edge rounded-full animate-spin" />Creating…</>) : (<><CreditCard size={16} /> Get payment link</>)}
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-low break-all font-mono">{payLink.url}</p>
            <div className="flex gap-2">
              <a
                href={payLink.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-h-[44px] rounded-xl bg-accent text-on-accent text-sm font-semibold flex items-center justify-center gap-2 haptic"
              >
                <ExternalLink size={16} /> Open checkout
              </a>
              <button
                type="button"
                onClick={copyPayLink}
                className="min-h-[44px] px-4 rounded-xl bg-fill-strong border border-line text-ink text-sm font-semibold flex items-center justify-center gap-2 haptic"
              >
                <Copy size={16} /> {copiedLink ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </GlassCard>
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
        <p className="text-xs font-bold text-ink-low uppercase tracking-wider mb-3">Quote details</p>
        <div className="space-y-2">
          {(["client", "address", "description"] as const).map((field) => (
            <label key={field} className="block">
              <span className="sr-only">Quote {field}</span>
              {field === "description" ? (
                <textarea value={quote[field]} onChange={(event) => updateQuoteMeta(quote.id, field, event.target.value)} rows={2} className="w-full app-input border rounded-lg px-3 py-2 text-sm text-ink resize-y" aria-label={`Quote ${field}`} />
              ) : (
                <input value={quote[field]} onChange={(event) => updateQuoteMeta(quote.id, field, event.target.value)} className="w-full app-input border rounded-lg px-3 py-2 text-sm text-ink" aria-label={`Quote ${field}`} />
              )}
            </label>
          ))}
        </div>
      </GlassCard>
      <GlassCard>
        <p className="text-xs font-bold text-ink-low uppercase tracking-wider mb-3">Line Items</p>
        <div className="space-y-2">
          {quote.lines.map((l) => (
            <div key={l.id} className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor={`quote-${quote.id}-${l.id}-description`}>Description for line item {l.id}</label>
              <input id={`quote-${quote.id}-${l.id}-description`} value={l.desc} onChange={(e) => updateLine(l.id, "desc", e.target.value)}
                className="flex-1 text-sm app-input border rounded px-2.5 py-2.5 min-h-[44px] text-ink" />
              <label className="sr-only" htmlFor={`quote-${quote.id}-${l.id}-quantity`}>Quantity for {l.desc}</label>
              <input id={`quote-${quote.id}-${l.id}-quantity`} type="number" min="0.01" step="0.01" value={l.qty} onChange={(e) => updateLine(l.id, "qty", Number(e.target.value))}
                className="w-16 text-sm app-input border rounded px-2 py-2.5 min-h-[44px] text-center text-ink" />
              <span className="text-xs text-ink-low w-6">{l.unit}</span>
              <span className="text-sm text-ink-low">$</span>
              <label className="sr-only" htmlFor={`quote-${quote.id}-${l.id}-rate`}>Rate for {l.desc}</label>
              <input id={`quote-${quote.id}-${l.id}-rate`} type="number" min="0" value={l.rate} onChange={(e) => updateLine(l.id, "rate", Number(e.target.value))}
                className="w-16 text-sm app-input border rounded px-2 py-2.5 min-h-[44px] text-center text-ink" />
              <button type="button" onClick={() => removeLine(l.id)} aria-label={`Remove line item ${l.desc}`} className="w-11 h-11 min-h-[44px] flex items-center justify-center rounded-md text-ink-low hover:text-urgent"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine} className="mt-3 min-h-[44px] text-xs flex items-center gap-1 text-accent font-medium">
          <Plus size={16} /> Add line item
        </button>
        <div className="border-t border-line mt-3 pt-3 text-sm space-y-1">
          <div className="flex justify-between text-ink-low"><span>Subtotal (ex. GST)</span><span>${sub.toFixed(2)}</span></div>
          <div className="flex justify-between text-ink-low text-xs"><span>GST (10%)</span><span>${gstAmount(sub).toFixed(2)}</span></div>
          <div className="flex justify-between font-semibold text-ink"><span>Total</span><span>${incGst(sub).toFixed(2)}</span></div>
        </div>
      </GlassCard>
      <button type="button" onClick={sendQuote} disabled={quote.lines.length === 0 || !quote.client.trim() || !quote.address.trim() || !quote.description.trim()}
        className="w-full py-3.5 rounded-xl bg-accent text-on-accent font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98] transition shadow-hardware"
      ><Send size={16} /> Send quote for client approval</button>
    </div>
  );
}

function QuoteSignoffView({ quote }: { quote: import("@/types").Quote }) {
  const { clientName, setClientName, approveQuote } = usePlumbTrackCtx();
  const sub = quoteSubtotal(quote.lines);

  return (
    <div className="p-3 space-y-2">
      <GlassCard>
        <p className="text-xs font-bold text-ink-low uppercase tracking-wider mb-2">Quote summary — {formatSerial(quote.id)}</p>
        <p className="text-sm text-ink-mid mb-2">{quote.description}</p>
        <div className="text-sm space-y-1">
          {quote.lines.map((l) => (
            <div key={l.id} className="flex justify-between text-ink-low">
              <span>{l.desc} × {l.qty}{l.unit}</span>
              <span>${(l.qty * l.rate).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-line mt-2 pt-2 flex justify-between font-semibold text-ink text-sm">
          <span>Total inc. GST</span><span>${incGst(sub).toFixed(2)}</span>
        </div>
      </GlassCard>
      <GlassCard>
        <label className="text-xs font-bold text-ink-low uppercase tracking-wider block mb-1">Client name (confirm)</label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={quote.client}
          className="w-full app-input border rounded-lg px-3 py-2.5 text-sm text-ink mb-3 focus:outline-none focus:ring-2 focus:ring-accent/50"
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
      <div className="w-16 h-16 rounded-full border-4 border-accent-line border-t-accent animate-spin" />
      <p className="text-ink font-semibold text-lg">Acquiring GPS…</p>
      <p className="text-ink-low text-sm">Locking your position at the job address</p>
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

  // Award-interpreted shifts per staff member
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
      <CrewRouteJobTree />
      <div className="flex gap-2">
        {(["week", "month"] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider min-h-[44px] transition ${
              period === p ? "bg-accent-dim text-accent border border-accent-line" : "surface-card text-ink-low border border-line"
            }`}
          >{p === "week" ? "This Week" : "This Month"}</button>
        ))}
      </div>

      {staffShifts.map((s) => (
        <GlassCard key={s.name}>
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="font-semibold text-ink text-sm">{s.name}</p>
              <p className="text-2xs text-ink-low mt-0.5">MA000036 · shifts: {s.interpreted.length}</p>
            </div>
            <div className="text-right">
              <span className="block text-xs font-mono text-accent bg-accent-dim rounded-lg px-2 py-0.5">
                {s.totalHours.toFixed(2)} hrs
              </span>
              <span className="block text-2xs text-ink-low mt-1 font-mono">
                gross ${s.grossPay.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 mb-3">
            {s.codeHours.map(([code, hours]) => (
              <div key={code} className="flex justify-between text-xs text-ink-low">
                <span>{PAY_CODE_LABELS[code] ?? code}</span>
                <span className="font-mono">{hours.toFixed(2)} hrs</span>
              </div>
            ))}
          </div>

          <div className="pt-2.5 space-y-1" style={{ borderTop: "1px solid var(--surface-border-subtle)" }}>
            <p className="text-2xs font-bold text-ink-low uppercase tracking-wider mb-1">STP Phase 2</p>
            <div className="flex justify-between text-xs text-ink-low"><span>Ordinary time earnings</span><span className="font-mono">${s.stpTotals.ote.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs text-ink-low"><span>Overtime (separate)</span><span className="font-mono">${s.stpTotals.overtime.toFixed(2)}</span></div>
            {s.stpTotals.ph > 0 && (
              <div className="flex justify-between text-xs text-ink-low"><span>Public holiday penalty</span><span className="font-mono">${s.stpTotals.ph.toFixed(2)}</span></div>
            )}
            {s.stpTotals.allowance > 0 && (
              <div className="flex justify-between text-xs text-ink-low"><span>Allowance — cents per km</span><span className="font-mono">${s.stpTotals.allowance.toFixed(2)}</span></div>
            )}
            {s.stpTotals.toilHours > 0 && (
              <div className="flex justify-between text-xs text-accent"><span>TOIL accrued</span><span className="font-mono">{s.stpTotals.toilHours.toFixed(2)} hrs</span></div>
            )}
          </div>
        </GlassCard>
      ))}

      {staffHours.length === 0 && staffShifts.length === 0 && (
        <GlassCard><p className="text-ink-low text-sm text-center py-4">No hours recorded this {period}.</p></GlassCard>
      )}

      {staffHours.length > 0 && (
        <>
          <p className="text-2xs font-bold text-ink-low uppercase tracking-wider px-1 pt-1">Job time entries</p>
          {staffHours.map((s) => (
            <GlassCard key={s.name}>
              <div className="flex justify-between items-center mb-3">
                <p className="font-semibold text-ink text-sm">{s.name}</p>
                <span className="text-xs font-mono text-accent bg-accent-dim rounded-lg px-2 py-0.5">{formatDuration(Math.floor(s.totalSec))}</span>
              </div>
              <div className="space-y-1.5">
                {s.entries.map((e, i) => (
                  <div key={i} className="flex justify-between text-xs text-ink-low">
                    <span className="font-mono">{formatSerial(e.jobId)}</span>
                    <span>{formatDuration(Math.floor(e.duration))}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Quote Status Badge
// ═══════════════════════════════════════════════════════════════════════════════

function QuoteStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: "Draft", color: "var(--text-muted)", bg: "var(--surface-hover-subtle)" },
    sent: { label: "Sent", color: "var(--status-pending)", bg: "var(--status-pending-dim)" },
    approved: { label: "Approved", color: "var(--status-complete)", bg: "var(--status-complete-dim)" },
    rejected: { label: "Rejected", color: "var(--status-urgent)", bg: "var(--status-urgent-dim)" },
  };
  const token = map[status] ?? map.draft;
  return (
    <span className="text-2xs font-black uppercase tracking-normal px-2 py-1 rounded-full" style={{ color: token.color, backgroundColor: token.bg }}>
      {token.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pay Code Labels
// ═══════════════════════════════════════════════════════════════════════════════

const PAY_CODE_ORDER = ["ORD", "OT15", "OT20", "SAT", "PH", "TOIL", "KM"];
const PAY_CODE_LABELS: Record<string, string> = {
  ORD: "Ordinary time",
  OT15: "Overtime 150%",
  OT20: "Overtime 200%",
  SAT: "Saturday",
  PH: "Public holiday",
  TOIL: "TOIL",
  KM: "Kilometre allowance",
};