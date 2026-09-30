// Phone and rego rules. These MUST match the SQL functions normalize_au_phone,
// is_valid_phone and normalize_rego in supabase/upgrade_v2.sql — the database
// normalises again on save, so this is for instant feedback and matching.

// Postgres btrim() only strips spaces, so this does the same.
const trimSpaces = (s: string) => s.replace(/^ +| +$/g, "");

// Canonical national format: "0412345678". "+61 412 345 678", "61412345678",
// "0412-345-678" and "412345678" all become "0412345678". Non-Australian
// numbers keep a leading "+". Empty input returns null.
export function normalizeAuPhone(input: string | null | undefined): string | null {
  const raw = trimSpaces(input ?? "");
  const plus = raw.startsWith("+") || raw.startsWith("00");
  let d = raw.replace(/[^0-9]/g, "");
  if (d === "") return null;
  if (raw.startsWith("00")) d = d.slice(2);
  if (d.startsWith("61") && (plus || d.length === 11)) {
    d = "0" + d.slice(2);
    // "+61 0412..." style double prefix
    if (d.startsWith("00")) d = d.slice(1);
    return d;
  }
  if (plus) return "+" + d;
  if (d.length === 9 && "23478".includes(d[0])) return "0" + d;
  return d;
}

// Valid = an Australian mobile/landline (10 digits starting 02/03/04/07/08)
// or an international number in +E.164 form. Pass a NORMALISED number.
export function isValidPhone(normalized: string | null | undefined): boolean {
  if (!normalized) return false;
  return /^0[2-478][0-9]{8}$/.test(normalized) || /^\+[1-9][0-9]{7,14}$/.test(normalized);
}

// Display format: "0412 345 678" for mobiles, "07 3123 4567" for landlines.
export function formatPhone(input: string | null | undefined): string {
  const n = normalizeAuPhone(input);
  if (!n) return "";
  if (/^04[0-9]{8}$/.test(n)) return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  if (/^0[2378][0-9]{8}$/.test(n)) return `${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
  return n;
}

// "abc 123" / "ABC-123" → "ABC123". Empty → null.
export function normalizeRego(input: string | null | undefined): string | null {
  const r = (input ?? "").replace(/[ \t\n\r\f\v.-]/g, "").toUpperCase();
  return r === "" ? null : r;
}
