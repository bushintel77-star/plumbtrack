/** Display-only formatting helpers. Internal ids remain unchanged for state, keys, and API calls. */

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
