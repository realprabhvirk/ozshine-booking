# Supabase steps (for the owner)

> **The short version lives in `instructions/README.md`**: what to run, in order, and how to add a staff login. This file has the background on each step.

Everything here is done in the Supabase dashboard: **SQL Editor** (paste a file, press **Run**) or **Authentication** settings. Nothing needs a terminal.

How to copy a SQL file: open it on GitHub → click **Copy raw file** (the two-squares icon at the top right of the file) → paste into a new SQL Editor tab → **Run**. Always copy the whole file. A half-pasted file gives "syntax error" or "unterminated dollar-quoted string".

## Status right now

| Step | File | Status |
|---|---|---|
| 1. Upgrade the database to V2 | `supabase/upgrade_v2.sql` | ✅ Done (you ran it after Phase 1) |
| 2. Lock down old direct-write permissions | `supabase/post_merge_hardening.sql` | ✅ Done |
| 2b. Pick existing customers on New sale | `supabase/patch_customer_pick.sql` | ✅ Done |
| 2c. Cash handed over + change on receipts | `supabase/patch_cash_change.sql` | ✅ Done |
| 2d. Equal logins + "Clear all data" | `supabase/patch_logins_and_reset.sql` | ✅ Done |
| 2e. Staff never need email verification | `supabase/patch_staff_no_email_check.sql` | ✅ Done |
| 2f. Instant, never-twice live sending | `supabase/patch_messaging_live.sql` | ✅ Done |
| 2g. "Car's ready" email + "SMS off" label | `supabase/patch_messaging_live_2.sql` | ✅ Done |
| 2h. Working message links + Google review | `supabase/patch_message_links.sql` | ⏳ **Run this now** |
| 2i. Fix "Clear all data" | `supabase/patch_logins_and_reset_2.sql` | ⏳ **Run this now** |
| 3. Turn email confirmation back on | Authentication settings | ⏳ Before real customers sign up |
| 4. Allow the password-reset link | Authentication → URL Configuration | ⏳ Recommended |

## 2. Hardening (run once, now)

`supabase/post_merge_hardening.sql` removes the "anyone can write straight into the tables" permissions the old V1 site needed. V2 does every write through checked server functions (prices recalculated, times re-checked, spam throttled, every change recorded), so those old permissions are now only a way around the checks.

- It doesn't touch any data and is safe to run twice.
- The last thing it prints is a small table. It should show **no** `INSERT` or `UPDATE` rows for customers, vehicles or bookings.
- To undo (only if you ever went back to the V1 apps): run `supabase/rollback_hardening.sql`.

## 2b. Customer-pick patch (run once)

`supabase/patch_customer_pick.sql` lets a walk-in or phone booking go to the exact customer staff picked from search on **New sale**. Before this, bookings only matched by mobile or rego, so a customer typed in by name (or with no mobile on file) got duplicated. If a picked customer has no mobile or email yet, the one typed in is saved to their record, unless it already belongs to someone else.

Additive, no data changes, safe to run twice. The last line prints `staff_resolve_customer`, which means it worked.

## 2c. Cash-change patch (run once)

`supabase/patch_cash_change.sql` stores the cash a customer handed over and the change given, so receipts (printed and online) show them. It adds two columns to payments and one small function. It's additive and safe to run twice. The last query lists `tendered` and `change_given`.

Until it's run, checkout still shows the change on screen, but receipts only show the payment amount.

## 2d. Logins + clear-all patch (run once)

`supabase/patch_logins_and_reset.sql`:
- makes every staff login a full admin with the same access, and keeps per-person PINs switched off however many logins there are;
- adds the two Supabase-only functions for managing logins (below);
- adds the function behind **Settings → Clear all data** in the staff app.

Running it doesn't delete anything; the wipe only happens when someone presses the button and types the confirmation. The last query lists everyone who can log in.

### Adding a staff login (Supabase only)
1. **Authentication → Users → Add user → Create new user.** Enter their email and password. No email verification is needed: step 2 confirms them.
2. **SQL Editor:** `select grant_staff_access('their@email.com', 'Their Name');` then **Run**.

To take access away: `select remove_staff_access('their@email.com');`. It won't remove the last login. Neither app can give access to anyone; the staff app only shows who has access (Settings → Logins), with these lines ready to copy.

## 2f. Live-sending patch (run once)

`supabase/patch_messaging_live.sql` gets the database ready for real emails:
- a message being sent is "leased" for 10 minutes, so the instant send and the daily job can never both send it;
- with Live switched on but only email set up, texts are marked "Sent (demo)" instead of failing.

No table or data changes; safe to run twice. Run it before switching Messages → Setup to Live (full steps: `instructions/README.md` → "Turning on real emails").

## 2g. Email-updates patch (run once, after 2f)

`supabase/patch_messaging_live_2.sql` adds a "ready for pickup" email (it was text-only) and makes texts that can't be sent in Live mode (no SMS account) show as "Not sent · SMS off" instead of "Sent (demo)". It never overwrites a template you've edited and changes no data.

## 2h. Message-links patch (run once)

`supabase/patch_message_links.sql`: links in texts and emails used to start with "/manage/…" because Settings → Business → "Booking website address" was empty. They now fall back to https://ozshine-booking.vercel.app. The after-visit message now asks for a Google review using Settings → Business → "Review link". Wording you've edited yourself is left alone.

## 2i. Clear-all-data fix (run once)

`supabase/patch_logins_and_reset_2.sql`: "Delete all data now" failed because Supabase refuses an update with no WHERE clause when it comes from the app. Same data is cleared and kept as before. Running the patch deletes nothing.

## 3. Email confirmation — turn it back on before going public

For the demo, email confirmation is **off** so test accounts work instantly. Before real customers create accounts:

Supabase → **Authentication** → **Sign In / Providers** → **Email** → turn **Confirm email** on → Save.

With it on, new sign-ups see "Check your email to confirm your account" and sign in after clicking the link.

## 4. Password-reset link

Supabase → **Authentication** → **URL Configuration**:
- **Site URL:** the booking site's address (e.g. `https://ozshine-booking.vercel.app`, or the custom domain later).
- **Redirect URLs:** add `https://<booking site address>/account`.

Without this, "Forgot your password?" emails may point to the wrong place.

## Other files (you don't need to run these)

- `supabase/schema.sql`: builds a **brand-new, empty** project from scratch. Never run it on the live project (it starts by wiping tables). It's generated from the V1 schema plus the upgrade, and a test checks the two match.
- `supabase/tests/`: automated tests that run all the SQL in a throwaway database (see its README).
