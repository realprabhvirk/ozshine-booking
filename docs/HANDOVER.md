# OzShine Beenleigh — V2 "Shop OS" handover

One system for the Beenleigh shop, replacing PickTime (bookings) and Odoo (CRM/POS):

- **Booking site** (`customer-app/`): what customers see. Prices, online booking, their booking link, receipts, rewards account.
- **Staff app** (`admin-app/`): what the shop runs on. The live Floor, schedule, checkout and invoices, customers, messages, reports, settings, and the shop TV.
- **Database** (Supabase): one project shared by both.

Both apps deploy automatically from `main` on Vercel (one project each).

## Go-live checklist

1. ✅ `upgrade_v2.sql` run on Supabase.
2. ⏳ Run `post_merge_hardening.sql` (see `docs/SUPABASE_STEPS.md`).
3. ⏳ Supabase: turn **Confirm email** back on and set the URL configuration.
4. ⏳ If demo data was loaded: run `remove_demo.sql`.
5. ⏳ Staff app → **Settings → Business**:
   - enter the **ABN** (invoices then say "Tax invoice")
   - enter the email and review link
   - switch **off** the "demo" banner on the booking site
6. ⏳ Check **Settings → Hours & booking**, **Services & prices** and **Extras** against what the shop really charges. The extras and job lengths were my estimates (see `docs/UPGRADE_NOTES.md`).
7. ⏳ Optional:
   - Messages → Setup → make the daily-job key, then add it in Vercel as `CRON_SECRET`
   - point a custom domain at the booking site and set `NEXT_PUBLIC_SITE_URL`
8. Later, once the owner approves the cost: sign up for Twilio (SMS) and/or Resend (email), add their keys in Vercel, then Messages → Setup → **Switch to live sending**.

## Vercel settings (both projects)

Each site is its own Vercel project, both connected to this one repo. They only work if each points at its own folder:

| Project | Root Directory | Framework Preset | Env vars (Production + Preview + Development) |
|---|---|---|---|
| ozshine-booking (booking site) | `customer-app` | Next.js | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| ozshine-admin (staff app) | `admin-app` | Next.js | same two (plus the optional ones in `docs/UPGRADE_NOTES.md`) |

Leave Build Command, Output Directory and Install Command on their defaults. If the Root Directory is blank, Vercel publishes the raw repo files instead of the app: the home page shows 404 while files like `/CLAUDE.md` load.

## Where things are (staff app)

| Menu | What it's for |
|---|---|
| **Floor** (home) | Today, live: new requests (with a chime), arrivals, cars in bays, ready for pickup, done. Tap a card to move it along or check out. |
| **Schedule** | Day and week views, rescheduling and bay assignment. |
| **New sale** | Walk-in now, or a phone booking for later. |
| **Money** | Invoices, Debtors (who owes), End of day (cash count and close), GST by quarter. |
| **Customers** | Search, profiles, cars, notes, messages, rewards, merge, import/export. |
| **History** | Every past job, filterable, each linked to its invoice. |
| **Messages** | Sent messages, campaigns, automatic messages, wording, feedback & reviews, setup. |
| **Reports** | Revenue, cars, services, extras, busiest hours, payment methods, loyalty, promos, CSV export. |
| **Settings** | Business and ABN, hours and booking rules, services and prices, extras and bays, closures, promos/loyalty/vouchers, Shop TV, audit log. |

The shop runs on **one owner login** (admin). Everything done in the app is recorded against it. If staff logins are ever added, per-person PINs switch on automatically.

## How it's built (for the next developer)

- **Two independent Next.js 16 apps** (App Router, Tailwind 4, TypeScript). No shared package: `src/lib/core` is copied into both and a test fails if the copies drift.
- **Every write goes through a Postgres function** (`supabase/upgrade_v2.sql`). Prices are recalculated server-side, slots are re-checked under a lock, and the booking status flow is enforced. Each change records who made it, and money changes go to `audit_log`. The apps only *read* tables directly, and row-level security decides what each role can see.
- **Errors:** functions raise `oz_raise(CODE, message)`, and `lib/core/errors.ts` turns codes into friendly text.
- **Live updates:** Supabase Realtime on bookings, invoices and payments, plus a 60-second backup poll. The public booking page and the TV poll instead, since the public role can't subscribe to private tables.
- **Messages:** everything goes to `message_outbox`. Demo mode marks messages "simulated". In live mode the daily cron (`admin-app/src/app/api/cron/messages`, `vercel.json`) hands them to Twilio/Resend. It's authenticated by `CRON_SECRET`, which the database checks against a bcrypt hash, so **no service-role key is used anywhere**.
- **Tests:** `supabase/tests` (93, real SQL in PGlite), plus `npm test` in each app. Run `npm run typecheck && npm run lint && npm run build` in an app before a PR.
- **Env vars:** see the table in `docs/UPGRADE_NOTES.md`. Only the Supabase URL and anon key are required.

## Known limitations

- Phone numbers aren't verified (no SMS yet), so online accounts only auto-link to past visits when the email matches or the old record has no email. Staff can merge duplicates.
- Campaigns send immediately. There's no scheduling for later yet.
- Real SMS/email needs provider accounts, which are not set up.
- One location only (Beenleigh), by design.

## Suggested next steps

1. SMS one-time codes at sign-up (closes the phone-verification gap and allows account linking by phone).
2. Twilio/Resend accounts, so confirmations and reminders really go out.
3. Custom domain for the booking site.
4. If more staff join: add their logins (per-person PINs then switch on automatically).

Full decision log: `docs/UPGRADE_NOTES.md`. Click-through checks: `docs/TEST_PLAN.md`.
