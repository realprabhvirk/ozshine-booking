CLAUDE.md — OzShine Beenleigh Booking + Admin System
This file is read automatically at the start of every Claude Code session on this repo. It IS the build brief — don't ask me to re-explain context that's already written here. If something here seems out of date vs. what's actually in the repo, trust the repo and flag the mismatch.
Who this is for / working style
I (Mr Virk) am a freelance web developer, not deeply technical on infra. I work entirely through Claude Code on the web — no terminal, no local machine involved at any point. That means:

* Never tell me to run something in "my terminal" or "locally" — I don't have one open. If a command genuinely needs running, run it yourself inside your sandbox.
* No `npm run dev` / dev server — I never preview via localhost. My only way of seeing your work is a Vercel Preview URL, generated automatically from a PR.
* Work on a branch, open a PR when a phase is done. Don't push straight to `main`. Merging to `main` is the production release step — I do that myself once I've checked the preview.
* Before opening a PR, run `npm run build` (and lint/typecheck) inside whichever app folder you touched, as a sanity check. This is a one-off build check, not a dev server — catches obvious breakage before I wait on Vercel's remote build.
* Write PR descriptions assuming I'm non-technical: what changed, what to actually click/check on the preview URL to verify it, in plain language.

What this product is
A bespoke booking + business management system for OzShine Hand Car Wash, Beenleigh location only (one of their 3 stores — this build is Beenleigh-scoped, not multi-location). It's a demo to win the shop owner's approval to fully replace their current setup: PickTime (appointment booking) + a separate Odoo-based CRM/POS. One unified system instead of two.
The core user loop that has to work end to end (first milestone): a customer books a wash on the public site (as a guest, no account needed) → it appears live on the admin dashboard → staff approve it → staff mark it complete and invoice it → it shows up in order history with who processed it. If that loop works cleanly, the product's proven.
Repo structure (monorepo, two independent apps)

```
ozshine-booking/
  customer-app/     <- public booking site, own Next.js project (own package.json etc.)
  admin-app/        <- staff dashboard, own separate Next.js project
  supabase/
    schema.sql      <- the one script I paste into Supabase's SQL Editor myself
  CLAUDE.md         <- this file

```

Each app is a fully independent Next.js project — don't share a `package.json` or assume a single root config between them. They only share the Supabase backend (same URL/keys, different `.env` files in each app folder).
Deployment: two separate Vercel projects, both connected to this one GitHub repo, each with its Root Directory set to its own folder (`customer-app` / `admin-app`) in Vercel's project settings. I set this up on my end — you don't need to touch Vercel directly. A push to `main` in either folder rebuilds that app's production deployment; a PR/branch touching either folder gets its own Preview deployment.
Env vars: never put real Supabase keys in this repo. Each app folder should have a `.env.local.example` (committed, placeholder values only) documenting exactly which vars it needs — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The real values live only in each Vercel project's Settings → Environment Variables, set for Production, Preview, AND Development — I'll add those myself once you tell me exactly what to paste and where.
Database (Supabase — I run the SQL myself via their dashboard, non-technical)
Write/maintain `supabase/schema.sql` as the single source of truth. Schema:

* locations — id, name, address, phone. One seed row: Beenleigh.
* services — id, location_id, name, price_from, description, sort_order. Seed:
   * OzShine Wash — $40+
   * Platinum Wash — $65+ (most popular)
   * OzShine Full Detail — $330+
* customers — id, auth_user_id (nullable — null for guest bookings), name, phone (unique, this is THE matching key), email (nullable), created_at.
* vehicles — id, customer_id, rego, make/model (nullable text), notes.
* bookings — id, customer_id, vehicle_id, service_id, location_id, requested_date, requested_time, status (`pending`/`approved`/`declined`/`completed`), amount_charged, paid (boolean), paid_at, processed_by_staff_id (nullable — set when staff approves/completes/ invoices it), created_at.
* staff — id, auth_user_id, location_id, name, role (`admin`/`staff`).

Matching logic: every booking (guest or not) looks up `customers` by phone first. Existing phone → attach to that customer, history carries over. New phone → create a new customer row. This is how guest bookings still build loyalty history without forcing an account.
RLS:

* `customers`/`vehicles`/`bookings`: public (anon) can INSERT (this is what makes guest booking work at all). Authenticated customers SELECT/UPDATE only their own rows (via `customers. auth_user_id = auth.uid()`). Staff (checked against the `staff` table) can SELECT/UPDATE everything scoped to their `location_id`.
* `staff` table: only staff can read it, never public.
* Supabase Auth email confirmation: I'll disable this in the dashboard (Auth settings) so demo accounts work instantly — flag clearly in any PR touching auth that this must be turned back on before real customers sign up in production.

App 1: `customer-app/`
Single-page app — one main page component holds the whole UI (hero, services, booking form, account view). Small config/API route files are normal; "single page" means the UI itself, not that the whole project is literally one file.

1. Hero — match the real OzShine site's look (headline, tagline, brand red `#c61b1f`, dark/glossy photography style, clean modern sans-serif). Fetch the live site (ozshinecarwash.com.au) for reference if you need exact styling details.
2. Services — the 3 services above with pricing, "Book Now" scrolls to the form.
3. Booking form — name, phone (required — the matching key), email (optional), rego, service, preferred date/time. Guest submit is the default single button. No payment collection. Creates a `pending` booking, shows an on-screen confirmation. No real SMS/email sending for this build.
4. Optional account creation — small toggle near the form: "Save my details for next time" → email+password via Supabase Auth, no email verification.
5. Logged-in view — replaces the booking form section: booking history, visit count, and a placeholder loyalty message ("You've visited 4 times — 2 more for 50% off your next wash"). Cosmetic for now, no real automation behind it.

App 2: `admin-app/`
Staff login via Supabase Auth, matched against the `staff` table (reject if no staff row exists). Tablet-first layout — big touch targets, works well on a 10" screen, landscape.

1. Booking queue — live list of `pending` bookings via Supabase Realtime (instant appearance
   * short alert sound), Approve/Decline buttons. Approving/declining/completing sets `processed_by_staff_id` to the logged-in staff member.
2. Today dashboard (home screen) — KPI cards: cars processed today, revenue today. Live query against `bookings`, always reflects the current day — no manual "open/close shift" step needed.
3. Customer lookup — search by name/phone/rego → full history, total visits, outstanding balance.
4. Order history — searchable/filterable table of all past bookings/invoices (date range, name, rego), each row links to its invoice for reprinting.
5. Active/upcoming view — approved bookings for today, simple status.
6. Invoicing — from a completed booking: service, price, customer, rego, date, which staff member processed it, editable amount, "Mark Paid" toggle, printable invoice view (browser print stylesheet is fine, skip a PDF library unless trivial to add).

Explicitly out of scope — don't build these, don't suggest them unprompted

* Real payment processing / EFTPOS integration (EFTPOS stays a separate physical system — the app only ever records paid/unpaid).
* Real SMS/email sending (Twilio, Resend, etc.).
* Actually triggering loyalty promos — only the visible counter/message.
* Karalee and Browns Plains locations — Beenleigh only.
* Three-tier roles (Super Admin/Admin/Staff) — keep it to `admin`/`staff`.

Design direction
Needs to look and feel like a real, professional product — not a generic AI-template layout, not default shadcn-out-of-the-box styling with no customization. Match OzShine's actual brand (red `#c61b1f`, dark glossy photography, clean sans-serif) closely enough that someone glancing at `customer-app` would assume it's the real site. The admin app can look more utilitarian/ functional (it's a work tool, not a marketing page) but should still feel deliberately designed, not thrown together.
Build order / phases
Each phase needs a PR, and each phase is "done" when the stated test passes — not just when the code exists.

1. Schema + Supabase RLS — done when I can manually insert a test booking via the SQL editor and confirm RLS blocks an anon read of another customer's row.
2. Admin app: booking queue + customer creation — done when staff can log in and manually create a booking + customer from the admin UI (before the public site exists — this is what I'll demo internally first).
3. Customer app: booking flow — done when a guest booking submitted on the public site appears live in the admin queue without a page refresh.
4. Invoicing + order history — done when a completed booking can be marked paid and its invoice reprinted from the order history table.
5. Loyalty display (cosmetic) — done when a logged-in customer sees an accurate visit count.

Confirm you've read this file and actually inspected the current repo state (not just this brief) before writing any code. If repo state and this file disagree, tell me which you're trusting and why.
