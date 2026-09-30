// Money maths in integer cents. The database stores numeric(10,2) and the API
// returns numbers or numeric strings; convert with toCents() at the edge and
// never add/multiply dollar floats.

export type Cents = number;

// 65 → 6500, "65.50" → 6550, null → 0. Inputs are at most 2 decimal places
// (numeric(10,2)), so rounding the float product is exact.
export function toCents(amount: number | string | null | undefined): Cents {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

// Dollars for sending to the database (2 decimal places).
export function centsToDbAmount(cents: Cents): number {
  return Number((cents / 100).toFixed(2));
}

export function sumCents(values: Array<Cents>): Cents {
  return values.reduce((a, b) => a + b, 0);
}

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const AUD_WHOLE = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// "$65.00". Pass whole: true for "$65" (prices on the marketing site).
export function formatCents(cents: Cents, opts: { whole?: boolean } = {}): string {
  if (opts.whole && cents % 100 === 0) return AUD_WHOLE.format(cents / 100);
  return AUD.format(cents / 100);
}

export function formatAUD(
  amount: number | string | null | undefined,
  opts: { whole?: boolean; empty?: string } = {},
): string {
  if (amount === null || amount === undefined || amount === "") return opts.empty ?? "—";
  return formatCents(toCents(amount), opts);
}

// Round half away from zero of n/d for integers (same as Postgres round()).
function divRound(n: number, d: number): number {
  const q = Math.floor((2 * Math.abs(n) + d) / (2 * d));
  return n < 0 ? -q : q;
}

// GST included in a GST-inclusive total. Matches SQL gst_from_inclusive:
// round(total * rate / (1 + rate), 2). $65.00 → $5.91, $40.00 → $3.64.
export function gstFromInclusiveCents(totalCents: Cents, rate = 0.1): Cents {
  const bp = Math.round(rate * 10000);
  return divRound(totalCents * bp, 10000 + bp);
}

// Parse what a person types into a price box: "$1,200.50", "65", "65.5".
// Returns cents, or null if it isn't a valid non-negative amount.
export function parseMoneyInput(input: string): Cents | null {
  const s = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return toCents(s);
}
