/**
 * Document vault helpers — expiry math, byte formatting, relative time.
 * Pure functions so the UI stays trivial and testable.
 */

export type ExpiryState = "none" | "ok" | "soon" | "expired";

/**
 * Whole days from today to the expiry date (inclusive). Negative when the
 * document has already lapsed; 0 means it lapses today.
 */
export function daysUntilExpiry(expiresOn: string): number {
  const [year, month, day] = expiresOn.split("-").map(Number);
  const expiry = new Date(year, (month ?? 1) - 1, day ?? 1, 23, 59, 59);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiry.getTime() - startOfToday.getTime()) / 86_400_000);
}

export function expiryState(expiresOn: string | null): ExpiryState {
  if (!expiresOn) return "none";
  const days = daysUntilExpiry(expiresOn);
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "ok";
}

/** Human-friendly size, e.g. "482 KB" or "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

/** Compact relative time, e.g. "just now", "4h ago", "3d ago". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** ISO date → "12 Aug 2026" for form display. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : iso;
}
