/**
 * Shared format validators (P1-9) — the one implementation each, for schemas
 * to compose. Australian formats: ABN checksum per the ATO weighting, E.164
 * for numbers handed to the SMS provider (customer-facing free-text phone
 * fields stay free-text — humans store "0412 345 678", Twilio gets E.164).
 */

/** True when the 11-digit ABN passes the ATO checksum: weight each digit
 *  (first digit's weight is 10, i.e. digit−1), sum, and the total mod 89
 *  must be 0. Accepts digits with spaces/dashes already stripped. */
export function isValidAbn(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const total = weights.reduce((sum, weight, index) => {
    const digit = Number(digits[index]);
    return sum + (index === 0 ? (digit - 1) * weight : digit * weight);
  }, 0);
  return total % 89 === 0;
}

/** E.164 check for numbers handed to the provider: optional +, 8–15 digits,
 *  no leading zero after the country code. */
export function isE164PhoneNumber(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/** Normalise an Australian number to E.164: local formats ("0412 345 678",
 *  "(03) 9123 4567") lift to +61… dropping the trunk 0, and an
 *  already-international "+61…" passes through. Returns null when the value
 *  is not an AU number in a recognisable shape — the caller then sends
 *  as-is and the provider fails it honestly. */
export function normaliseAuPhoneToE164(value: string): string | null {
  const digits = value.replace(/[\s()\-.+]/g, "");
  if (/^61\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0\d{9}$/.test(digits)) return `+61${digits.slice(1)}`;
  return null;
}
