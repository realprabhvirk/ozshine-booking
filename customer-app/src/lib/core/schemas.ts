// Form validation shared by both apps. The database validates everything
// again — these exist for instant, friendly feedback.
import { z } from "zod";
import { isValidPhone, normalizeAuPhone, normalizeRego } from "./phone.ts";
import { parseMoneyInput } from "./money.ts";
import { VEHICLE_TYPES } from "./status.ts";

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Please enter a name")
  .max(80, "That name is too long");

// Required phone → canonical "0412345678".
export const phoneSchema = z.string().transform((value, ctx) => {
  const n = normalizeAuPhone(value);
  if (!n) {
    ctx.addIssue({ code: "custom", message: "Please enter a phone number" });
    return z.NEVER;
  }
  if (!isValidPhone(n)) {
    ctx.addIssue({ code: "custom", message: "That doesn't look like a valid phone number" });
    return z.NEVER;
  }
  return n;
});

// Optional phone: blank → null.
export const optionalPhoneSchema = z.string().transform((value, ctx) => {
  const n = normalizeAuPhone(value);
  if (!n) return null;
  if (!isValidPhone(n)) {
    ctx.addIssue({ code: "custom", message: "That doesn't look like a valid phone number" });
    return z.NEVER;
  }
  return n;
});

// Optional email: blank → null, otherwise lower-cased and checked.
export const optionalEmailSchema = z
  .string()
  .trim()
  .transform((v) => v.toLowerCase())
  .pipe(z.union([z.literal(""), z.email("That doesn't look like a valid email")]))
  .transform((v) => (v === "" ? null : v));

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("That doesn't look like a valid email"));

// Optional rego: blank → null, otherwise "ABC123".
export const optionalRegoSchema = z.string().transform((value, ctx) => {
  const r = normalizeRego(value);
  if (r && !/^[A-Z0-9]{1,10}$/.test(r)) {
    ctx.addIssue({ code: "custom", message: "Regos are letters and numbers only (up to 10)" });
    return z.NEVER;
  }
  return r;
});

export const vehicleTypeSchema = z.enum(VEHICLE_TYPES, "Please choose a vehicle type");

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a date");
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Please choose a time");
export const uuidSchema = z.uuid();

// "$1,200.50" → 120050 (cents).
export const moneyInputSchema = z.string().transform((value, ctx) => {
  const c = parseMoneyInput(value);
  if (c === null) {
    ctx.addIssue({ code: "custom", message: "Enter an amount like 65 or 65.50" });
    return z.NEVER;
  }
  return c;
});

export const notesSchema = z
  .string()
  .trim()
  .max(500, "Please keep it under 500 characters")
  .transform((v) => (v === "" ? null : v));

// First error message per field, for showing under inputs.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
