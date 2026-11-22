export function formatMoney(cents: number, locale: string, currency = "BRL"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function formatDate(value: Date | string | null | undefined, locale: string, withTime = false): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(locale, withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" });
}
