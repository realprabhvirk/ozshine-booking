# Supabase steps (for the owner)

Everything here is done in the Supabase dashboard: **SQL Editor** (paste a file, press **Run**) or **Authentication** settings. Nothing needs a terminal.

How to copy a SQL file: open it on GitHub → click **Copy raw file** (the two-squares icon at the top right of the file) → paste into a new SQL Editor tab → **Run**. Always copy the whole file. A half-pasted file gives "syntax error" or "unterminated dollar-quoted string".

## Status right now

| Step | File | Status |
|---|---|---|
| 1. Upgrade the database to V2 | `supabase/upgrade_v2.sql` | ✅ Done (you ran it after Phase 1) |
| 2. Lock down old direct-write permissions | `supabase/post_merge_hardening.sql` | ✅ Done |
| 2b. Pick existing customers on New sale | `supabase/patch_customer_pick.sql` | ⏳ **Run this now** |
| 3. Turn email confirmation back on | Authentication settings | ⏳ Before real customers sign up |
| 4. Allow the password-reset link | Authentication → URL Configuration | ⏳ Recommended |
| Demo data (optional) | `seed_demo.sql` / `remove_demo.sql` | Your call |

## 2. Hardening (run once, now)

`supabase/post_merge_hardening.sql` removes the "anyone can write straight into the tables" permissions the old V1 site needed. V2 does every write through checked server functions (prices recalculated, times re-checked, spam throttled, every change recorded), so those old permissions are now only a way around the checks.

- It doesn't touch any data and is safe to run twice.
- The last thing it prints is a small table. It should show **no** `INSERT` or `UPDATE` rows for customers, vehicles or bookings.
- To undo (only if you ever went back to the V1 apps): run `supabase/rollback_hardening.sql`.

## 2b. Customer-pick patch (run once)

`supabase/patch_customer_pick.sql` lets a walk-in or phone booking go to the exact customer staff picked from search on **New sale**. Before this, bookings only matched by mobile or rego, so a customer typed in by name (or with no mobile on file) got duplicated. If a picked customer has no mobile or email yet, the one typed in is saved to their record, unless it already belongs to someone else.

Additive, no data changes, safe to run twice. The last line prints `staff_resolve_customer`, which means it worked.

## 3. Email confirmation — turn it back on before going public

For the demo, email confirmation is **off** so test accounts work instantly. Before real customers create accounts:

Supabase → **Authentication** → **Sign In / Providers** → **Email** → turn **Confirm email** on → Save.

With it on, new sign-ups see "Check your email to confirm your account" and sign in after clicking the link.

## 4. Password-reset link

Supabase → **Authentication** → **URL Configuration**:
- **Site URL:** the booking site's address (e.g. `https://ozshine-booking.vercel.app`, or the custom domain later).
- **Redirect URLs:** add `https://<booking site address>/account`.

Without this, "Forgot your password?" emails may point to the wrong place.

## Demo data (optional)

- `supabase/seed_demo.sql` adds about 60 made-up customers, 3 months of bookings, invoices, payments, reviews and rewards, plus a busy "today" on the Floor. It makes the dashboards and reports look real for a sales demo.
  - Every demo row is flagged. Phone numbers are in the range reserved for fiction, emails are `@example.com`, invoices are numbered `DEMO-…`, and demo customers can never be sent a real message.
- `supabase/remove_demo.sql` deletes exactly the demo rows and nothing else. Run it before going live.

## Other files (you don't need to run these)

- `supabase/schema.sql`: builds a **brand-new, empty** project from scratch. Never run it on the live project (it starts by wiping tables). It's generated from the V1 schema plus the upgrade, and a test checks the two match.
- `supabase/tests/`: automated tests that run all the SQL in a throwaway database (see its README).
