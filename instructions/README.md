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
| 7 | `supabase/patch_messaging_live.sql` | Real emails go out instantly, never twice; texts stay demo until SMS is set up | ✅ Done |
| 8 | `supabase/patch_messaging_live_2.sql` | "Car's ready" by email too; unsent texts say "SMS off" instead of "Sent (demo)" | ✅ Done |
| 9 | `supabase/patch_message_links.sql` | Links in texts/emails work; the after-visit message asks for a Google review | ⏳ Run this |
| 10 | `supabase/patch_logins_and_reset_2.sql` | Fixes Settings → Clear all data ("Something went wrong") | ⏳ Run this |

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

## 4. Turning on real emails (from beenleigh@ozshinecarwash.com.au)

Texts stay "Sent (demo)" until an SMS account is added later; only emails go out for real.

1. **Resend → Domains → Add domain** → `ozshinecarwash.com.au`. Resend shows a few DNS records: add them where the domain is managed (whoever hosts ozshinecarwash.com.au). Wait until Resend shows the domain as **Verified**.
2. **Vercel → ozshine-admin (staff app) → Settings → Environment Variables**: `RESEND_API_KEY` is already there. Nothing else needed for email (the sender defaults to `OzShine Beenleigh <beenleigh@ozshinecarwash.com.au>`).
3. **Staff app → Messages → Setup → Daily job → Make a key** → Copy. In Vercel (staff app project) add `CRON_SECRET` with that key (Production) → **Deployments → ⋯ → Redeploy**.
4. Run patches **#7** and **#8** above in Supabase.
5. **Staff app → Messages → Setup → Switch to live sending.**
6. Test: make a booking on the booking site with your own email. The confirmation should land within a few seconds and show as "Sent" (not demo) in Messages.

To stop real sending at any time: Messages → Setup → **Back to demo mode**.

**Google review link:** staff app → **Settings → Business → Review link**: paste your Google review link (Google Business Profile → "Ask for reviews" → copy link). The after-visit email and text use it. Until it's filled in they link to the booking's own rating page.

## 5. Vercel (already set up, for reference)

| Project | Root Directory | Framework | Environment variables |
|---|---|---|---|
| ozshine-booking (booking site) | `customer-app` | Next.js | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| ozshine-admin (staff app) | `admin-app` | Next.js | same two |

Staff app extras for real messages: `RESEND_API_KEY` and `CRON_SECRET` (step 4). Real SMS later needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. Full list: `docs/UPGRADE_NOTES.md` → "Env vars".

## 6. Links

- Booking site: https://ozshine-booking.vercel.app
- Staff app: https://ozshine-admin.vercel.app

More detail if you ever need it: `docs/HANDOVER.md` (how everything works), `docs/TEST_PLAN.md` (click-through checks), `docs/SUPABASE_STEPS.md` (the background on each SQL file).
