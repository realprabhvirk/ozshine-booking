# Instructions for the owner

Everything you need to run or set up yourself, in plain steps. Nothing here needs a terminal.

## 1. Supabase SQL: what to run

**How to run a file:** open it on GitHub → click **Copy raw file** (two-squares icon, top right) → Supabase → **SQL Editor** → **New query** → paste → **Run**. Always copy the whole file. Every file below is safe to run twice and never deletes data.

| # | File | What it does | Status |
|---|---|---|---|
| 1 | `supabase/upgrade_v2.sql` | The V2 database upgrade | ✅ Done |
| 2 | `supabase/post_merge_hardening.sql` | Locks the database so all changes go through the app | ✅ Done |
| 3 | `supabase/patch_customer_pick.sql` | Pick an existing customer on New sale (no duplicates) | ✅ Done |
| 4 | `supabase/patch_cash_change.sql` | Cash handed over + change printed on receipts | ✅ Done |
| 5 | `supabase/patch_logins_and_reset.sql` | Equal logins + Settings → Clear all data | ✅ Done |
| 6 | `supabase/patch_staff_no_email_check.sql` | Staff logins never need email verification | ✅ Done |

New patches will be added to this table with ⏳ when there's something to run.

**Never run** `supabase/schema.sql` on the live project: it's only for building a brand-new empty database.

## 2. Adding a staff login (two steps, no email verification)

1. Supabase → **Authentication → Users → Add user → Create new user**. Type their email and a password and click Create. (No need to tick "Auto Confirm User"; step 2 takes care of it.)
2. Supabase → **SQL Editor** → paste and **Run**, with their details:
   ```sql
   select grant_staff_access('their@email.com', 'Their Name');
   ```
   It answers "Done: … can now log in to the staff app."

They can log in straight away with that email and password, with the same full access as everyone else. They never get a verification email.

**Taking access away:**
```sql
select remove_staff_access('their@email.com');
```
Their past work stays on record. It won't let you remove the last login.

**Changing a password:** Supabase → Authentication → Users → click the person → **Send password recovery**, or delete the user and add them again.

Why two steps: customers who make an account on the booking site land in the same Users list. Step 2 is what marks someone as staff, so a customer (or a stranger) can never get into the staff app.

## 3. Before real customers use the booking site

- [ ] Supabase → **Authentication → Sign In / Providers → Email** → turn **Confirm email** on. This only affects customers signing up on the booking site; staff logins are unaffected (see step 2).
- [ ] Supabase → **Authentication → URL Configuration**: set **Site URL** to `https://ozshine-booking.vercel.app` (or your own domain later) and add `https://ozshine-booking.vercel.app/account` under **Redirect URLs**.
- [ ] Staff app → **Settings → Business**: enter the ABN and email, then switch **off** the "demo" banner.
- [ ] Check **Settings → Hours & booking**, **Services & prices** and **Extras** match the real shop.
- [ ] To start completely fresh (e.g. remove test bookings), use **Settings → Clear all data**.

## 4. Vercel (already set up, for reference)

| Project | Root Directory | Framework | Environment variables |
|---|---|---|---|
| ozshine-booking (booking site) | `customer-app` | Next.js | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| ozshine-admin (staff app) | `admin-app` | Next.js | same two |

Optional extras (not needed now): see `docs/UPGRADE_NOTES.md` → "Env vars" for the daily reminder job and real SMS/email.

## 5. Links

- Booking site: https://ozshine-booking.vercel.app
- Staff app: https://ozshine-admin.vercel.app

More detail if you ever need it: `docs/HANDOVER.md` (how everything works), `docs/TEST_PLAN.md` (click-through checks), `docs/SUPABASE_STEPS.md` (the background on each SQL file).
