export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "AUD", "CAD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function formatMoney(cents: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
}

/** PayPal expects decimal strings with two fraction digits for these currencies. */
export function centsToPayPalValue(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Invalid amount in cents: ${cents}`);
  return (cents / 100).toFixed(2);
}

export function payPalValueToCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Unparseable PayPal amount: ${value}`);
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "0").padEnd(2, "0"));
  return whole * 100 + fraction;
}

export function parseMoneyInput(input: string | number): number {
  const num = typeof input === "number" ? input : Number(String(input).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num < 0) throw new Error("Invalid amount.");
  return Math.round(num * 100);
}
