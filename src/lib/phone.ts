/**
 * Normalize a phone number to E.164 format.
 * Strips spaces, dashes, brackets, dots. Adds +1 for Canadian numbers.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9+]/g, "");

  if (digits.startsWith("+")) {
    return digits;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}
