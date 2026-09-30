// Regenerates supabase/schema.sql (FRESH INSTALL ONLY) from:
//   fixtures/v1_main_schema.sql  — the v1 base schema as it was on `main`
//   ../upgrade_v2.sql            — the non-destructive v2 upgrade
// so a fresh install ends up structurally identical to an upgraded v1
// database. run.mjs verifies that (Test 2) and that this file is up to date.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function buildSchema() {
  const v1 = readFileSync(join(here, "fixtures/v1_main_schema.sql"), "utf8");
  const upgrade = readFileSync(join(here, "../upgrade_v2.sql"), "utf8");

  const start = v1.indexOf("drop table if exists bookings cascade;");
  const end = v1.indexOf("-- =============================================================================\n-- Manual test");
  if (start < 0 || end < 0) throw new Error("v1 fixture layout changed — update build-schema.mjs");
  const v1Body = v1.slice(start, end).trimEnd();

  return `-- =============================================================================
-- OzShine V2 — FRESH INSTALL SCHEMA
-- =============================================================================
-- ⚠️  FRESH INSTALL ONLY. THIS WIPES DATA. It drops and recreates every table.
-- Use it only for a brand-new, empty Supabase project.
--
-- To upgrade the EXISTING database (the one production uses), run
-- supabase/upgrade_v2.sql instead — that one is non-destructive.
--
-- GENERATED FILE — do not edit by hand. It is built by
-- supabase/tests/build-schema.mjs from the v1 base schema + upgrade_v2.sql,
-- so a fresh install always ends up identical to an upgraded database.
-- =============================================================================

-- Clean slate: v2 tables first, then the v1 tables below.
drop view if exists customer_directory;
drop table if exists voucher_redemptions cascade;
drop table if exists payments cascade;
drop table if exists invoice_items cascade;
drop table if exists invoices cascade;
drop table if exists invoice_counters cascade;
drop table if exists loyalty_rewards cascade;
drop table if exists loyalty_rules cascade;
drop table if exists vouchers cascade;
drop table if exists promo_codes cascade;
drop table if exists booking_addons cascade;
drop table if exists addons cascade;
drop table if exists message_outbox cascade;
drop table if exists campaigns cascade;
drop table if exists message_templates cascade;
drop table if exists automations cascade;
drop table if exists feedback cascade;
drop table if exists testimonials cascade;
drop table if exists waitlist cascade;
drop table if exists customer_notes cascade;
drop table if exists customer_events cascade;
drop table if exists audit_log cascade;
drop table if exists day_closes cascade;
drop table if exists rate_limits cascade;
drop table if exists staff_sessions cascade;
drop table if exists staff_pins cascade;
drop table if exists staff_invites cascade;
drop table if exists blackout_dates cascade;
drop table if exists bays cascade;
drop table if exists settings cascade;

-- -----------------------------------------------------------------------------
-- v1 base schema
-- -----------------------------------------------------------------------------
${v1Body}

-- -----------------------------------------------------------------------------
-- v2 upgrade (identical to supabase/upgrade_v2.sql)
-- -----------------------------------------------------------------------------
${upgrade}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(here, "../schema.sql"), buildSchema());
  console.log("supabase/schema.sql regenerated");
}
