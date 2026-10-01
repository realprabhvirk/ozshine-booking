# OzShine V2 "Shop OS" — Upgrade Notes

Decision log for the V2 build (all 10 phases merged to `main`). Owner handover: `HANDOVER.md`. Tests: `TEST_PLAN.md`. Supabase steps: `SUPABASE_STEPS.md`.

## Assumptions I made

- **Opening hours** (not in the brief): Mon–Fri 8:00–5:00, Sat 8:00–4:00, Sun 9:00–3:00. Stored in Settings, so the owner can change them in the admin app.
- **Job lengths** for the capacity maths: Wash 45 min, Platinum 75, Polish 2h30, Interior Detail 3h, Full Detail 6h, Correction & Coating 8h. Also editable.
- **Capacity:** 3 bays, max 3 cars being worked on at once, 30-minute booking slots, 60 min minimum notice, bookable up to 60 days ahead, customers can cancel/reschedule online up to 2 hours before.
- **Add-ons:** six example add-ons (engine bay, pet hair, headlights, fabric protection, odour, wheels & arches) with placeholder prices. They're easy to edit or switch off. I couldn't find real add-on pricing on the live site.
- **Loyalty:** "50% off your next wash every 6 visits" (Wash or Platinum only, expires after 180 days), plus "$10 off for referring a mate". Tiers are Bronze (0), Silver (6+), Gold (12+) and Platinum (24+) visits. All editable.
- **Correction & Coating** is marked "price on inspection", since the real site quotes it.
- **Phone numbers** are stored in one standard format (`0412345678`); `+61`, spaces and dashes are all accepted and cleaned up. Regos are stored uppercase without spaces or dashes.
- **Booking reference codes** look like `OZ-7K3P` (no 0/O/1/I, so they're easy to read out over the phone).
- **Invoice numbers** are `OZ-000001`, `OZ-000002`… Numbers are never reused; voiding keeps the number.
- **Revenue is counted when a job is completed** (not when it's booked or paid). Unpaid completed jobs show up under Debtors.
- **All prices include GST** (10%); GST shown on invoices = total ÷ 11.
- **The "win-back" message** (customers who haven't been in for 60 days) is **switched off** by default, because it's marketing.
- **Demo phone numbers** use 0491 570 xxx (the range ACMA sets aside for fiction) and emails use @example.com.

## Decisions

- **Two SQL paths.** `upgrade_v2.sql` is what you paste into the live Supabase project: it only adds things and is safe to run twice. `schema.sql` is for a brand-new empty project only (it wipes everything) and is generated from v1 + the upgrade, so the two can't drift apart. A test proves they produce identical databases.
- **The live app keeps working during the upgrade.** V1 still writes straight into the tables, so the upgrade keeps those permissions and back-fills new columns with triggers. Once V2 is live, `post_merge_hardening.sql` removes the direct-write permissions (`rollback_hardening.sql` undoes it).
- **Every V2 write goes through a server function.** Prices are recalculated on the server (whatever the browser sends is ignored), slots are re-checked under a lock so the last space can't be double-booked, booking status can only move forward legally, and every change records which staff member made it.
- **Equal logins, managed in Supabase only (owner's call, replaces "one owner login" below).** Every staff login is a full admin with the same access, and PINs stay off. Logins are given or taken away only in Supabase (`grant_staff_access` / `remove_staff_access` in the SQL Editor). The staff app shows the list but can't change it. Each change is still recorded against the login that made it.
- **Clear all data (Settings).** Wipes bookings, customers, cars, invoices, payments, messages, reviews, vouchers, rewards, the waitlist and the audit log. It can also delete customers' online accounts. Business setup and staff logins are kept, and invoice numbers restart at 1. You must type DELETE EVERYTHING to confirm, and the reset is the first entry in the new audit log.
- **One owner login, no staff accounts (owner's call).** While the shop has a single active staff login, it's treated as the admin and every action is recorded against it. No PIN, no "who's working" screen. The upgrade makes the lone account an admin if it isn't already. If staff are ever added, PINs switch on automatically (tested both ways).
- **Staff PINs** live in their own locked-down table (never readable by the apps, not even by admins). Five wrong PINs lock that person out for 5 minutes. The shared tablet stays logged in as the shop account; the PIN only switches who's "acting".
- **Capacity uses the real peak.** A new booking fits if, at every moment it overlaps, fewer than the max cars are already in. It doesn't just count "anything overlapping", which would wrongly block back-to-back bookings.
- **Messages:** every SMS and email is written to an outbox. In demo mode (the default) nothing is sent and each one is marked "simulated". Demo customers can never be sent a real message, even when a live provider is switched on.
- **Deactivated staff lose access immediately.** V1's staff permissions only checked "has a staff row"; the upgrade re-creates them to also require the account to be active (same policy names, so V1 keeps working).
- **Linking an online account to past bookings by phone** only happens when the existing record has no email or the same email. Phone numbers aren't verified (there's no SMS), so a number alone must not hand over a stranger's history. Otherwise a fresh profile is created and staff can merge the two.
- **Shared helpers, copied not linked.** The two apps are separate projects, so `src/lib/core` (phone/rego cleaning, money in cents, GST, Brisbane dates, booking statuses, error messages, form validation) is copied into both. A test fails if the copies drift or disagree with the database.
- **Design system.** Each app has its own building blocks in `src/components/ui` (buttons, cards, badges, form fields, dialogs, side sheets, tabs, toasts, empty states, loading skeletons, tables). The staff app is a dark/light "ops console"; the public site is OzShine red with dark glossy sections. The old screens are untouched until they're rebuilt, and the staff app stays light by default until then. Reference pages: `/ui` (staff app, behind login) and `/styleguide` (public site, hidden from Google).
- **Staff app layout (Phase 3).** Dark by default with a light-mode toggle. On a 10" tablet the menu is a slim icon rail so all four Floor lanes fit side by side; on phones it's a bottom tab bar. Floor replaces the old Dashboard, Booking Queue and Active Today (those links redirect). The new-sale screen replaces New Booking.
- **No PIN screen.** Because of the one-owner-login setup, there's no "Who's working?" screen. Every action is recorded against the owner's login. The PIN screen would only matter if staff logins were added later.
- **Checkout lives on the Floor.** Phase 3 includes a simple checkout: invoice lines, GST, rewards/promo codes, EFTPOS/cash/bank transfer, change for cash, part payments, and "pay later". Editing invoice lines, receipts, refunds and end-of-day come in Phase 4.
- **Old screens kept until rebuilt.** Customers, Order History and the old invoice page keep their V1 look inside the new layout until Phases 4–5.
- **Live updates.** Every screen refreshes itself on booking/invoice/payment changes (Supabase Realtime), when the tablet changes something, when the tab comes back into view, and every 60 seconds as a backup. New online requests chime.
- **Money (Phase 4).**
  - Invoices, Debtors, End of day and GST live under Money.
  - Invoice lines can be edited, discounted or removed. Every change is logged, and the database won't let the total drop below what's already been paid.
  - Refunds and voids are admin-only. A void keeps its number.
  - Printouts are an A4 "Tax invoice" (it says just "Invoice" until an ABN is entered in settings, since an Australian tax invoice needs the seller's ABN) and an 80mm thermal receipt.
- **Unpaid jobs from the old system** appear in Debtors with "Create invoice", which makes an invoice at the amount charged back then.
- **GST figures** are completed-job totals (incl. GST) ÷ 11, by completion date, grouped into Australian financial-year BAS quarters. They're a guide for the accountant, not lodged figures.
- **End of day.** Counted vs expected cash (cash payments minus cash refunds for that Brisbane day), with the difference recorded. Closing a day doesn't lock anything else. An admin can reopen it.
- **Customers (Phase 5).**
  - The directory searches name, mobile, email and rego across the whole database (paged 50 at a time), with filters for VIP, owing, rewards, lapsed (60+ days), new and online-account customers.
  - Exports are neutralised against spreadsheet formula injection.
  - CSV import matches on mobile, runs a dry run first, imports in batches of 1,000 (up to 20,000 rows per file), and understands separate first/last-name columns and loose vehicle words ("SUV" → 4WD).
  - "Delete personal details" anonymises the customer rather than deleting them, so invoices and GST totals still add up.
  - Merge keeps the open record's name and moves everything else across. Both are admin-only.
- **Back office (Phase 6).**
  - **Reports:** revenue and cars over time, services, extras, busiest hours heatmap, payment methods, new vs returning customers, cancellations, loyalty and promo use, with a CSV export. Revenue follows the same rule as everywhere else (completed jobs, incl. GST).
  - **Settings** (admin only): business details and ABN, opening hours and booking rules, services and prices per vehicle size, extras and bays, closures (with Queensland public holiday suggestions and a warning when bookings already sit on a closed day), promo codes, loyalty rewards and member tiers, gift vouchers, and the audit log.
  - Every settings change goes through one server function that only accepts a fixed list of fields per table and records a before/after entry in the audit log.
  - Things used by past bookings (services, extras, promo codes) can't be deleted, only switched off, so old invoices stay intact.
  - **Gift vouchers** are issued here after the customer has paid for them (e.g. as a custom invoice line). They're redeemed at checkout as a payment method and the balance goes down.
  - **Alert sound** for new online requests: chime, bell or off, with a volume slider and a Test button (Settings → Business).
  - On phones, History, Reports and Settings sit under a "More" tab in the bottom bar (along with log out and theme).
- **Messages (Phase 7).**
  - One place for every text and email: **Sent messages** (search, filter, see exactly what went out, retry failures), **Campaigns** (pick a group, see the live head-count, send), **Automatic messages** (switch each one on or off, adjust timings), **Wording** (edit any template with a live preview and SMS-length counter) and **Setup**.
  - A one-off "Send a message" button sits on each customer's Messages tab.
  - Demo mode is the default and stays on until the owner signs off on a provider.
  - Campaigns only reach customers who've opted in to marketing and always carry an opt-out line. People who opted out show up as "skipped" rather than disappearing.
  - The daily job runs through a key the database checks (only its bcrypt hash is stored), so the Supabase service-role key is never used.
  - Messages are claimed in batches and handed to Twilio/Resend. Each result (sent or failed, with the provider's error) is written back.
  - Campaigns send immediately. Scheduling for later is not built yet.
- **Public booking site (Phase 8).**
  - Rebuilt as a proper site: home page (services and prices by vehicle size, extras, how it works, rewards, reviews, hours, FAQ), a 4-step booking wizard at `/book`, a booking tracker at `/manage/<link>`, receipts at `/r/<link>` and customer accounts at `/account`.
  - **Booking** shows only genuinely free times (checked again on submit). If a day is full, customers can leave their number for the waitlist.
  - The price is always recalculated by the database. Promo codes are checked before submitting. Signed-in customers get their details and cars filled in and can attach an unused reward.
  - A hidden honeypot field blocks form bots.
  - "Send me special offers" is **unticked by default**: marketing needs a clear yes.
  - **The tracker** shows each stage (booked → confirmed → dropped off → being washed → ready → done) and refreshes every 30 seconds. It lets customers add the booking to their calendar, change the time, cancel up to the cut-off, see their invoice, and leave a rating once the job is done.
  - Ratings of 3 stars or less go privately to the shop. 5-star ratings are offered the public review link if one is set.
  - **Accounts** use email + password. On first sign-in the account is linked to past visits by mobile/email (with the safety rule above). The dashboard shows visit count, tier, progress to the next reward, unused rewards, a referral link, upcoming bookings, history with receipts, saved cars and profile, plus a "delete my details" request.
  - **Reviews** only appear on the home page when the shop has published real ones. There's no made-up social proof.
  - **SEO:** page titles and descriptions, schema.org "AutoWash" data (hours, phone, address), a sitemap and robots.txt. Personal pages (booking links, receipts, accounts) are never indexed.
  - Maps use an OpenStreetMap link (no Google APIs).
  - The **demo banner** at the top is controlled by Settings → Business in the staff app.
- **Shop TV and feedback (Phase 9).**
  - **Shop TV:** a full-screen board for the waiting-area TV, showing cars being washed (with a progress bar and "ready around"), cars ready to collect, who's coming up, and rolling messages the owner writes.
    - It opens from a secret link (Settings → Shop TV) and needs no login. It only ever shows first names and the first 3 characters of a rego.
    - It refreshes every 15 seconds and reloads itself twice a day. A new link can be made at any time, which kills the old one.
  - **Feedback & reviews** (Messages tab): every rating customers leave. Ratings of 3 stars or less sit in "To follow up" until someone marks them sorted, with one-tap call and message buttons.
  - Good ratings with a comment can be put on the website (first name + last initial). The website's reviews section only shows what's switched on here.
- **Picking an existing customer on New sale (post-launch fix).** New sale has a "Find a customer" search (name, mobile, email or rego). Picking someone sends their id with the booking, and the database uses that exact customer.
  - Typing a name also suggests existing customers with that name.
  - "Book" buttons on a customer's profile open New sale with them already picked.
  - A missing mobile/email is filled in from what's typed, but a mobile that belongs to another customer is never moved.
  - This needs `supabase/patch_customer_pick.sql` (also folded into `upgrade_v2.sql`). Until it's run, bookings fall back to matching by mobile/rego as before.
- **Checkout & bays (post-launch fixes).**
  - **Start in a bay** always asks which bay (it only auto-picks if the shop has one bay). Cars already in a bay can be moved with **Change bay**.
  - **Adjust price** at checkout adds an extra charge or a discount with a note, which shows on the invoice and in the audit log. Adjustments can be removed until a payment is taken.
  - **Cash handed over** is saved with cash payments, so receipts show "Cash received" and "Change". This needs `supabase/patch_cash_change.sql`.
  - **Split payment** takes one bill across several methods (card, cash, bank transfer, other) in one go. Each part is recorded separately and safely: a retry never double-charges a part that already went through.
- **Demo data is fully removable.** Every demo row is flagged; demo invoices are numbered `DEMO-…` so they don't use up real invoice numbers.

## Env vars (all optional)

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required (already set in Vercel). Everything below is optional. The public site has one optional variable, `NEXT_PUBLIC_SITE_URL` (its public address, for search engines, set once a custom domain is live). The rest belong in the **staff app** Vercel project only and are documented in `admin-app/.env.local.example`. The Supabase service-role key is never needed.

| Variable | What it does | If it's missing |
|---|---|---|
| `CRON_SECRET` | Lets the daily 7am job run. Must match the key made in Messages → Setup. | Reminders and feedback requests are still checked hourly while the staff app is open. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Real SMS | SMS stays simulated. |
| `RESEND_API_KEY`, `RESEND_FROM` | Real email | Email stays simulated. |

Real sending also needs **Messages → Setup → Switch to live sending**. That button stays greyed out until a provider is configured.

## Known limitations

- Phone numbers can't be verified without real SMS, so phone-only guest records are "first come, first served" when someone signs up (see Decisions).
- Tests run on Postgres 18 (PGlite); Supabase runs 15/17. The SQL avoids anything version-specific.
- **Bug found in the live V1 site (fixed in Phase 8):** the old public booking form failed for any brand-new guest ("Couldn't save your details"), because the public role can't read customers back after creating one, and returning guests created duplicates. The new site books through `create_public_booking`, which does the customer lookup server-side, so both problems are gone.

- **Old invoice page only for old jobs.** Since Phase 4, `/invoices/<id>` shows the new invoice. Links to the old booking-based page go to the job's new invoice when it has one. Jobs finished before the upgrade (no new invoice) show the original page, which is now **read-only** (Phase 10). For an unpaid old job, "Create invoice to take payment" turns it into a proper invoice. This removed the last direct table write in the apps, so `post_merge_hardening.sql` is safe to run.
- **Hotfix shipped after the upgrade:** the old Order History and Invoice pages broke after `upgrade_v2.sql` because bookings gained a second link to staff (assigned staffer). Fixed in PR #11 by naming the link explicitly.

## What I'd do next

- SMS one-time-code verification of phone numbers (would close the account-linking gap properly).
- Real SMS/email provider accounts (Twilio / Resend) once the owner signs off.
