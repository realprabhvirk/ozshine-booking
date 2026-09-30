// Unit tests for lib/core. Run with `npm test` (Node's built-in runner).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, isValidPhone, normalizeAuPhone, normalizeRego } from "./phone.ts";
import { formatCents, gstFromInclusiveCents, parseMoneyInput, toCents, formatAUD } from "./money.ts";
import {
  addDaysISO, dayKeyOf, daysBetweenISO, formatDate, formatDay, formatDuration, formatRelative,
  formatTime, shopDateOf, shopTimeOf, startOfWeekISO, todayISO,
} from "./time.ts";
import { legalNextStatuses } from "./status.ts";
import { AppError, toAppError } from "./errors.ts";
import { fieldErrors, moneyInputSchema, optionalEmailSchema, optionalRegoSchema, phoneSchema } from "./schemas.ts";
import { z } from "zod";

test("phone normalisation", () => {
  const cases: Array<[string, string | null]> = [
    ["0412 345 678", "0412345678"],
    ["+61 412 345 678", "0412345678"],
    ["61412345678", "0412345678"],
    ["+61 0412 345 678", "0412345678"],
    ["412345678", "0412345678"],
    ["(07) 3123 4567", "0731234567"],
    ["0064 21 123 4567", "+64211234567"],
    ["+1 415 555 0100", "+14155550100"],
    ["", null],
    ["   ", null],
  ];
  for (const [input, want] of cases) assert.equal(normalizeAuPhone(input), want, input);
  assert.ok(isValidPhone("0412345678"));
  assert.ok(!isValidPhone("12345"));
  assert.ok(!isValidPhone("0512345678"));
  assert.equal(formatPhone("+61412345678"), "0412 345 678");
  assert.equal(formatPhone("0731234567"), "07 3123 4567");
});

test("rego normalisation", () => {
  assert.equal(normalizeRego("abc 123"), "ABC123");
  assert.equal(normalizeRego("abc-12.3"), "ABC123");
  assert.equal(normalizeRego("  "), null);
  assert.equal(normalizeRego(null), null);
});

test("money in cents and GST", () => {
  assert.equal(toCents("65.50"), 6550);
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(null), 0);
  assert.equal(gstFromInclusiveCents(6500), 591);
  assert.equal(gstFromInclusiveCents(4000), 364);
  assert.equal(gstFromInclusiveCents(33000), 3000);
  assert.equal(gstFromInclusiveCents(5), 0);
  assert.equal(gstFromInclusiveCents(-6500), -591);
  assert.equal(formatCents(6500), "$65.00");
  assert.equal(formatCents(6500, { whole: true }), "$65");
  assert.equal(formatAUD(null), "—");
  assert.equal(parseMoneyInput("$1,200.50"), 120050);
  assert.equal(parseMoneyInput("65"), 6500);
  assert.equal(parseMoneyInput("-5"), null);
  assert.equal(parseMoneyInput("6.555"), null);
});

test("Brisbane dates", () => {
  // 15:30 UTC on 30 Sep = 01:30 on 1 Oct in Brisbane.
  const late = new Date("2026-09-30T15:30:00Z");
  assert.equal(shopDateOf(late), "2026-10-01");
  assert.equal(shopTimeOf(late), "01:30");
  assert.equal(todayISO(late), "2026-10-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysISO("2028-03-01", -1), "2028-02-29");
  assert.equal(daysBetweenISO("2026-09-30", "2026-10-07"), 7);
  assert.equal(dayKeyOf("2026-10-05"), "mon");
  assert.equal(startOfWeekISO("2026-10-04"), "2026-09-28");
  assert.equal(formatDate("2026-10-06"), "Tue 6 Oct");
  assert.equal(formatDate("2026-10-06", "medium"), "6 Oct 2026");
  assert.equal(formatDay("2026-10-07", "short", "2026-10-06"), "Tomorrow");
  assert.equal(formatTime("09:30:00"), "9:30am");
  assert.equal(formatTime("13:00"), "1pm");
  assert.equal(formatTime("00:15"), "12:15am");
  assert.equal(formatDuration(90), "1 h 30 min");
  assert.equal(formatDuration(45), "45 min");
  const now = new Date("2026-10-06T02:00:00Z");
  assert.equal(formatRelative(new Date("2026-10-06T01:55:00Z"), now), "5 min ago");
  assert.equal(formatRelative(new Date("2026-10-05T02:00:00Z"), now), "yesterday");
});

test("booking status flow", () => {
  assert.deepEqual(legalNextStatuses("pending"), ["approved", "declined", "cancelled"]);
  assert.deepEqual(legalNextStatuses("ready"), ["completed"]);
  assert.deepEqual(legalNextStatuses("completed"), []);
});

test("database errors become friendly AppErrors", () => {
  const e = toAppError({ message: "SLOT_TAKEN", details: "Sorry — that time was just taken.", code: "P0001" });
  assert.equal(e.code, "SLOT_TAKEN");
  assert.equal(e.message, "Sorry — that time was just taken.");
  assert.equal(toAppError({ message: "OVERPAYMENT", details: "", code: "P0001" }).message, "That's more than what's owing.");
  assert.equal(toAppError({ message: "permission denied for table x", code: "42501" }).code, "PERMISSION");
  assert.equal(toAppError(new TypeError("Failed to fetch")).code, "NETWORK");
  assert.equal(toAppError(new Error("boom")).code, "UNKNOWN");
  assert.ok(toAppError(new AppError("NOT_FOUND")) instanceof AppError);
});

test("form schemas", () => {
  assert.equal(phoneSchema.parse("+61 412 345 678"), "0412345678");
  assert.equal(phoneSchema.safeParse("123").success, false);
  assert.equal(optionalEmailSchema.parse(""), null);
  assert.equal(optionalEmailSchema.parse(" Jess@Example.com "), "jess@example.com");
  assert.equal(optionalEmailSchema.safeParse("nope").success, false);
  assert.equal(optionalRegoSchema.parse("abc 123"), "ABC123");
  assert.equal(optionalRegoSchema.parse(""), null);
  assert.equal(moneyInputSchema.parse("$65"), 6500);
  const r = z.object({ phone: phoneSchema }).safeParse({ phone: "1" });
  assert.equal(r.success, false);
  if (!r.success) assert.deepEqual(Object.keys(fieldErrors(r.error)), ["phone"]);
});
