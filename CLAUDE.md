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
A bespoke booking + business management system ("Shop OS", V2) for OzShine Hand Car Wash, Beenleigh location only (one of their 3 stores — this build is Beenleigh-scoped, not multi-location). It replaces their current setup: PickTime (appointment booking) + a separate Odoo-based CRM/POS. One unified system instead of two.
The core loop that must always work end to end: a customer books on the public site (guest, no account needed) → it appears live on the staff Floor (chime) → staff approve → arrived → in bay → ready → checkout (invoice + payment) → it shows in History with who processed it.

Current state (V2, all phases merged to `main`)
The original V1 brief (single-page site, 4 booking statuses, direct table writes) has been superseded by V2. Trust the repo over any older description. Full decision log: `docs/UPGRADE_NOTES.md`; owner handover + go-live checklist: `docs/HANDOVER.md`; click-through tests: `docs/TEST_PLAN.md`; SQL the owner runs: `docs/SUPABASE_STEPS.md`.

Repo structure (monorepo, two independent apps)

```
ozshine-booking/
  customer-app/     <- public booking site (Next.js 16): /, /book, /manage/[token], /r/[token], /account
  admin-app/        <- staff app (Next.js 16): Floor, Schedule, New sale, Money, Customers, History,
                       Messages, Reports, Settings, /display/[key] shop TV, /api/cron/messages
  supabase/
    upgrade_v2.sql  <- additive, idempotent upgrade the owner pasted into the LIVE project (source of truth)
    schema.sql      <- generated (supabase/tests: npm run build-schema) — brand-new empty project only
    post_merge_hardening.sql / rollback_hardening.sql, seed_demo.sql / remove_demo.sql
    tests/          <- PGlite test suite (91 tests): npm test
  docs/             <- UPGRADE_NOTES, HANDOVER, TEST_PLAN, SUPABASE_STEPS
  CLAUDE.md         <- this file
```

Each app is a fully independent Next.js project — don't share a `package.json` or assume a single root config between them. They only share the Supabase backend. `src/lib/core` (phone/rego, money in cents, GST, Brisbane time, statuses, error codes, schemas) is copied into both apps and must stay identical — a test in `supabase/tests` fails if they drift.
Deployment: two separate Vercel projects, both connected to this one GitHub repo, each with its Root Directory set to its own folder (`customer-app` / `admin-app`). A push to `main` rebuilds production; a PR gets Preview deployments.
Env vars: never put real Supabase keys in this repo (never the service-role key, anywhere). Required in both apps: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Optional (documented in each `.env.local.example`): customer-app `NEXT_PUBLIC_SITE_URL`; admin-app `CRON_SECRET`, `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM`, `RESEND_API_KEY`/`RESEND_FROM`. Any new env var must be optional and documented.

Database rules (Supabase — the owner runs SQL himself via the dashboard, non-technical)
* The live project holds real data: SQL for it must be additive and idempotent. Never ship `drop table` or anything destructive for the live project. Change `upgrade_v2.sql` (or add a new additive script), regenerate `schema.sql`, keep `supabase/tests` green.
* Every write goes through a `security definer` Postgres function (bookings, invoices, payments, customers, settings via `admin_save` with a column whitelist). Apps only SELECT tables directly; RLS decides visibility (anon: nothing private; customers: their own rows; staff: their location; admin-only functions check `is_admin()`).
* Errors: functions raise `oz_raise(CODE, message)`; `lib/core/errors.ts` maps codes to friendly text.
* Money in integer cents in the apps; GST = total ÷ 11 (prices include GST). Brisbane time everywhere.
* Customer matching: by phone (normalised `04xxxxxxxx`), done server-side in `create_public_booking`.
* Solo mode: the shop runs on ONE owner login (admin). While there's a single active staff login, everything is attributed to it and there is no PIN UI; PINs switch on automatically if more staff are added.
* Supabase Auth email confirmation is OFF for the demo — flag clearly in any PR touching auth that it must be turned back on before real customers sign up.

Explicitly out of scope — don't build these, don't suggest them unprompted
* Real payment processing / EFTPOS integration (EFTPOS stays a separate physical system — the app only records payments).
* Real SMS/email sending turned on without the owner's sign-off. The Twilio/Resend adapters exist but stay off (demo mode = "simulated_sent") until provider keys are added AND Messages → Setup is switched to Live.
* Fabricated social proof (fake reviews, fake counters). Reviews only come from real customers via the feedback inbox.
* Karalee and Browns Plains locations — Beenleigh only.
* Three-tier roles (Super Admin/Admin/Staff) — keep it to `admin`/`staff`.
* Google APIs (maps etc.). `next/font/google` for fonts is fine.

Design direction
Needs to look and feel like a real, professional product — not a generic AI-template layout, not default shadcn-out-of-the-box styling with no customization. The booking site matches OzShine's brand (red `#c61b1f`, dark glossy sections, clean sans-serif). The staff app is a dark/light "ops console", tablet-first (10" landscape, big touch targets). Each app has its own design system in `src/components/ui` (reference pages: staff `/ui`, public `/styleguide`) — use those building blocks and the token classes (`bg-panel`, `text-fg-muted`, `bg-accent`…) rather than raw colours.

Before a PR
Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` in every app folder you touched (build with placeholder env: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder`). If SQL changed, run `supabase/tests` (`npm test`). Keep `docs/UPGRADE_NOTES.md` updated with any assumption or decision.

Confirm you've read this file and actually inspected the current repo state (not just this brief) before writing any code. If repo state and this file disagree, tell me which you're trusting and why.
