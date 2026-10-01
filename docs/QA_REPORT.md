# QA report: final sweep

Branch `fix/final-sweep`. Everything below ran in the Claude Code cloud sandbox. Nothing touched the live database or the live sites (no writes, no logins, no keys used).

**In short:** no blockers. The core loop (book → Floor → approve → bay → ready → checkout → History) holds up. The real problems were in long date ranges (the 1,000-row cap), checkout error handling, and live messaging, which only sent once a day and could send twice. All High and Medium findings are fixed, each with a regression test where one was possible.

## How it was checked

| Check | Result |
|---|---|
| **Contract check** (new, permanent: `supabase/tests/contract.mjs`, runs as Test 8). Parses both apps with the TypeScript compiler and checks every `.from()` table, selected column, embed (including ambiguous foreign keys and `!hints`), filter/order column, `.rpc()`/`callRpc` name, argument name and execute permission against the final schema (v1 + `upgrade_v2.sql` + hardening + every `patch_*.sql`) built in PGlite | 67 table queries + 71 RPC calls: **0 problems**. Mutation-tested: a renamed column or RPC argument is caught |
| **Hardening audit**: every `.insert/.update/.upsert/.delete` in both apps | **0 direct table writes**. Every write goes through a checked database function |
| **SQL suite** (`supabase/tests`) | 89 passed, 0 failed (was 87 after demo removal; +contract check, +live-sending lease test) |
| **Staff app** (`admin-app`): typecheck / lint / unit tests / build | 0 errors / 0 problems / 26 passed / build OK (35 routes) |
| **Booking site** (`customer-app`) | 0 errors / 0 problems / 7 passed / build OK |
| **npm audit --omit=dev** | Was 1 critical in each app (Next.js). After the bump: **0 vulnerabilities** in both |
| **Secrets scan** of tracked files and all git history (`AIza`, `eyJhbGci`, `service_role`, `sk_`, `re_`, `sb_publishable`, `sb_secret`, the project ref, `.env` files) | Clean. Only the two `.env.local.example` files are tracked. "service_role" appears only in docs ("never used") and test-harness role setup |
| **Visual sweep** (Playwright): 26 screens × 1280×800, 1024×768, 390×844 × dark and light = 156 renders. Staff screens use stubbed data, including empty states; the booking site runs with the database unreachable | No horizontal overflow anywhere. Console problems: see F-11, F-12, F-13, and the note under "couldn't test" |

## Findings

Severity: **Blocker** (core loop broken) · **High** (wrong money/data or customer-facing failure) · **Medium** (wrong in a realistic case) · **Low** (polish or edge case).

| ID | Sev | Area | What's wrong | Proof | Status |
|---|---|---|---|---|---|
| F-01 | High | History / Money | Supabase returns at most 1,000 rows. History's "1 year" view sorted oldest-first, so past 1,000 bookings the **newest** jobs silently vanished. Money → Invoices totals undercounted past 1,000 invoices | `fetchRange` used `.order(asc).limit(1000)` | **Fixed**: reads every page (`lib/paginate.ts`), test `paginate.test.ts` |
| F-02 | High | Messaging (Live) | In Live mode, messages were only handed to Resend/Twilio by the 7am daily job, so booking confirmations and "car's ready" texts arrived up to a day late | The cron route was the only sender | **Fixed**: `/api/messages/flush` sends within seconds after staff actions and customer bookings |
| F-03 | High | Messaging (Live) | Two sends running at once (e.g. the daily job plus an instant send) could both claim and send the same message: no lock or lease | SQL test "live sending: a claimed message is leased…" fails on the old function | **Fixed**: `patch_messaging_live.sql` (10-min lease + `skip locked`) and a Resend idempotency key |
| F-04 | High | Checkout | If saving "cash handed over" (or completing the job) failed **after** the payment saved, staff saw "Payment not recorded". The retry key had already changed, so pressing Pay again would charge twice | Code review of `checkout-dialog.tsx` | **Fixed**: follow-up steps have their own message ("Payment saved, but…"). The payment stands |
| F-05 | High | Security | Next.js 16.3.4 has a critical advisory (GHSA-vcvr-r3jv-pc5j, RCE in `next/og`). Neither app uses `next/og`, so exposure was low | `npm audit` | **Fixed**: 16.3.8 in both apps |
| F-06 | Medium | Messaging (Live) | Live with only email set up: every text would fail ("Twilio missing") and pile up as failed | Adapter returned an error | **Fixed**: marked "Sent (demo)" instead (`simulate_outbox_message_with_key`), unit-tested |
| F-07 | Medium | Messaging setup | Live could be switched on without the sending key (`CRON_SECRET`), leaving every message stuck in the queue forever | `setup-client.tsx` only checked providers | **Fixed**: Live needs the key; the screen says why |
| F-08 | Medium | Messaging (Resend) | `RESEND_FROM` was required with no default. There was no rate pacing (Resend allows ~2/s, so bursts got 429s and were marked failed) and no idempotency | Code review | **Fixed**: default sender `OzShine Beenleigh <beenleigh@ozshinecarwash.com.au>`, ~0.5 s pacing, 429/5xx left queued for retry; `outbox-sender.test.ts` |
| F-09 | Medium | Customers | Customer list and CSV export paged without a tie-breaker. Imported customers share one `created_at`, so an export could skip or repeat people. Same for Sent messages (campaigns) and Audit log paging | Code review | **Fixed**: `id` tie-breaker on every paged query |
| F-10 | Medium | Staff app | Sibling dialogs shared React keys (`"none"`/`"closed"`) on the invoice, customer profile and Settings → Extras. React may then drop one of them (a dialog that won't open) | Playwright console: "two children with the same key" | **Fixed**: unique keys. Re-run shows 0 warnings |
| F-11 | Medium | Booking site | If the database can't be reached, `/book` said "Online booking is paused", which is wrong and puts customers off | Screenshot with DB unreachable | **Fixed**: "We couldn't load bookings just now". No services also counts as paused |
| F-12 | Low | Booking site | A wrong or old booking/receipt link landed on the bare Next.js 404 with no way back | Screenshot | **Fixed**: branded 404 with Book / Home |
| F-13 | Low | Customers | Tag filter list read at most 1,000 customers | Code review | **Fixed**: pages through all |
| F-14 | Low | Customers | Export file name used the UTC date (shows yesterday before 10am) | Code review | **Fixed**: Brisbane date |
| F-15 | Low | Docs | Test counts (94) stale after demo removal. HANDOVER said PINs "switch on automatically" (they never do now) and live sending was "daily" | Grep | **Fixed** |
| F-16 | Low | Booking site | If the connection drops after the server saved a booking and the customer tries again, a second request can be created (the server caps it at 5 a day per phone) | Code reading of `create_public_booking` | Open: judgement call. Staff can decline the duplicate; a proper fix means rewriting the booking function |
| F-17 | Low | Messaging | `/api/messages/flush` is public by design: it takes no input and only sends what's already queued and due. Spamming it just triggers empty checks (throttled per server instance) | Design | Accepted, documented in the route and UPGRADE_NOTES |
| F-18 | Low | SQL | `upgrade_v2.sql`/`schema.sql` still mention `seed_demo.sql` in one comment (the harmless `oz.seeding` guard) | Grep | Open: SQL deliberately not edited for comments |
| F-19 | Low | Staff app | Staff app 404 is the default Next.js page | Visual | Open: staff-only, cosmetic |

**Totals:** 0 Blocker · 5 High (5 fixed) · 6 Medium (6 fixed) · 8 Low (4 fixed, 1 accepted by design, 3 left open).

Owner decisions, deliberately not treated as bugs: equal staff logins with no PIN screen, logins only via Supabase, Beenleigh only, no Google APIs, no real payments, demo-mode messaging, revenue counted on completion, prices GST-inclusive.

## What changed in the database

One new patch, `supabase/patch_messaging_live.sql`. It's additive and idempotent: no table or data changes, two functions. It's mirrored into `upgrade_v2.sql` / `schema.sql` and listed as ⏳ in `instructions/README.md`. No already-run patch was edited.

## What I could and couldn't test

**Could:**
- every SQL function and permission in a real Postgres (PGlite), including the new lease and double-claim behaviour;
- every query shape the apps send, against that schema;
- every screen rendered at three sizes in both themes, with stubbed data and with the database unreachable;
- the email sender against a fake Resend (sender, idempotency key, rate-limit handling).

**Couldn't:**
- **The live database / real data.** No keys by design. The contract check covers query shapes, not live row contents or live RLS edge cases beyond what the tests model.
- **Real email delivery.** Resend domain verification (`ozshinecarwash.com.au` DNS) and actual inbox delivery can only be checked after the owner's setup steps. TEST_PLAN §7 step 4 covers it.
- **Vercel behaviour:** the cron firing at 7am, the flush route's real cold-start timing, and `keepalive` pings from the booking site's domain.
- **Realtime (the Floor chime)** and the Epson receipt printer: need the real Supabase project and hardware.
- **Customer sign-in flows** (`/account`): need Supabase Auth.
- **Postgres version:** tests run on Postgres 18 (PGlite); Supabase runs 15/17. The SQL avoids version-specific features (`for update skip locked` is standard since 9.5).
- **Note on the visual sweep:** stubbed staff screens logged a React hydration warning. It traces to the throwaway fake data (its id counters run differently on server and browser, e.g. `inv9`), not the app. The real pages pass server time to the client.
