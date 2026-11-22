/**
 * WhatsApp number at sign-up, stored in E.164 (+5511999998888).
 * Brazilian numbers may be typed without the country code (DDD + number,
 * 10 or 11 digits); anything else needs a leading "+" and 8–15 digits.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 && !digits.startsWith("0") ? `+${digits}` : null;
  }
  const national = (digits.length === 12 || digits.length === 13) && digits.startsWith("55") ? digits.slice(2) : digits;
  return isBrazilianNumber(national) ? `+55${national}` : null;
}

/** DDD (11–99) + a mobile (9 + 8 digits) or a landline (8 digits starting 2–8). */
function isBrazilianNumber(digits: string): boolean {
  if (!/^[1-9][1-9]/.test(digits)) return false;
  if (digits.length === 11) return digits[2] === "9";
  if (digits.length === 10) return /[2-8]/.test(digits[2]);
  return false;
}
