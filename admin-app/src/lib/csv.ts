// Minimal, dependency-free CSV reading/writing for customer import/export.

// RFC 4180-ish parser: quoted fields, doubled quotes, commas/newlines inside
// quotes, CRLF or LF line endings, optional UTF-8 BOM. Blank lines skipped.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const pushRow = () => {
    row.push(field);
    field = "";
    if (row.some((f) => f.trim() !== "")) rows.push(row);
    row = [];
  };
  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") pushRow();
    else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRow();
    } else field += ch;
  }
  if (field !== "" || row.length) pushRow();
  return rows;
}

// Spreadsheet apps treat cells starting with = + - @ as formulas; prefix
// those so an exported file can't run anything when opened.
function safeCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(safeCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  // BOM so Excel opens it as UTF-8.
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Import fields and the header names we recognise for each.
export const IMPORT_FIELDS = [
  { key: "name", label: "Name", required: true, aliases: ["name", "full name", "customer", "customer name", "client", "contact"] },
  { key: "phone", label: "Mobile / phone", required: true, aliases: ["phone", "mobile", "mobile number", "phone number", "cell", "contact number", "ph"] },
  { key: "email", label: "Email", aliases: ["email", "email address", "e-mail"] },
  { key: "rego", label: "Rego", aliases: ["rego", "registration", "plate", "number plate", "licence plate", "license plate", "car rego"] },
  { key: "make_model", label: "Make / model", aliases: ["make model", "make/model", "vehicle", "car", "make", "model"] },
  { key: "vehicle_type", label: "Vehicle type", aliases: ["vehicle type", "type", "car type", "size"] },
  { key: "last_visit", label: "Last visit", aliases: ["last visit", "last visited", "last booking", "last appointment"] },
  { key: "total_spend", label: "Total spend", aliases: ["total spend", "spend", "total spent", "lifetime value", "revenue"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comments", "comment"] },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];

const norm = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

// Guess which column holds which field from the header row. Also accepts
// separate First/Last name columns by marking them for joining.
export function guessMapping(headers: string[]): Partial<Record<ImportField, number>> & { first?: number; last?: number } {
  const out: Partial<Record<ImportField, number>> & { first?: number; last?: number } = {};
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    const aliases = (f.aliases as readonly string[]).map(norm);
    const idx = headers.findIndex((h, i) => !used.has(i) && aliases.includes(norm(h)));
    if (idx >= 0) {
      out[f.key] = idx;
      used.add(idx);
    }
  }
  if (out.name === undefined) {
    const first = headers.findIndex((h) => ["first name", "firstname", "given name"].includes(norm(h)));
    const last = headers.findIndex((h) => ["last name", "lastname", "surname", "family name"].includes(norm(h)));
    if (first >= 0) out.first = first;
    if (last >= 0) out.last = last;
  }
  return out;
}

// Map loose vehicle-type words to our four types (blank → sedan in the DB).
export function normaliseVehicleType(v: string): string {
  const s = norm(v);
  if (!s) return "";
  if (/(4wd|4x4|suv|ute|awd|four wheel)/.test(s)) return "4wd";
  if (/(van|people mover|bus|minivan)/.test(s)) return "van";
  if (/(wagon|hatch|small)/.test(s)) return "small_wagon";
  return "sedan";
}
