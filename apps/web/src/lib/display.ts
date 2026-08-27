/** Display-only formatting helpers. Internal ids remain unchanged for state, keys, and API calls. */

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * Local-timezone YYYY-MM-DD. Never use toISOString().slice(0, 10) for
 * "today" — that's UTC, and in UTC+10 every morning before 10am computes
 * yesterday, silently corrupting daily-report matching, dashboard hour
 * buckets and seeded expiry dates.
 */
export function localDateStr(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Render an internal id as a compact stamped serial.
 *
 * Existing short domain ids such as J-1043 stay readable. Longer generated
 * ids use the first seven alphanumeric characters in the requested PREFIX-0000
 * shape, e.g. cmt97b9lk... becomes CMT-97B9.
 */
export function formatSerial(id: string): string {
  const normalized = id.replace(/^#/, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalized) return "";

  if (/^[JQ]\d{1,6}$/.test(normalized)) {
    return `${normalized[0]}-${normalized.slice(1)}`;
  }

  const compact = normalized.slice(0, 7);
  return compact.length > 3 ? `${compact.slice(0, 3)}-${compact.slice(3)}` : compact;
}

export function formatSerialWithHash(id: string): string {
  const serial = formatSerial(id);
  return serial ? `#${serial}` : "";
}
