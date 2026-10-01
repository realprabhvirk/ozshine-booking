# Test plan

Two parts: **A** is a click-through you (or the shop owner) can do on the live or preview sites, and **B** is the automated tests that already run on every change.

Use two browser tabs side by side: the **booking site** and the **staff app** (logged in). A phone is handy for the customer side.

## A. Click-through

### 1. The core loop: book → live on the Floor → approve → complete → invoice → paid → history
1. **Booking site → Book a wash.** Pick Platinum Wash, Sedan, tomorrow, any time. Use a **new** name and mobile. Confirm.
   - ✅ You land on "Booking received!" with a reference like `OZ-7K3P`.
2. **Staff app → Floor.** Without refreshing, the booking appears under **Requests** with a chime.
3. Tap it → **Approve**. ✅ Within 30 seconds the customer's page says **Confirmed**.
4. On the Floor, move it along: **Arrived → In bay** (pick a bay) **→ Ready → Checkout**.
   - ✅ The customer page tracks each step.
5. **Checkout:** the invoice shows the right price and GST (total ÷ 11). Take **EFTPOS** for the full amount.
   - ✅ Marked paid. The job moves to Done.
6. **History:** the booking is there with who processed it. Open its invoice → **Print** (A4) and **Receipt** (thermal slip) both look right.
7. **Money → Invoices / End of day:** today's revenue and EFTPOS total include it.

### 2. Changing and cancelling (customer)
1. Make another booking on the booking site. On its page tap **Change time**, pick a new slot and move it. ✅ The staff Schedule shows the new time.
2. **Cancel booking** with a reason. ✅ It shows Cancelled on both sides.
3. Try booking a time that's already fully taken (e.g. fill all bays at one time from the staff side first). ✅ That time isn't offered.

### 3. Walk-ins and phone bookings (staff)
1. **New sale → Walk-in now:** customer by mobile (or "no details"), service, extras, **Start**. ✅ It goes straight into a bay.
2. **New sale → Book for later:** pick a date/time. ✅ It appears on the Schedule, already approved.

### 4. Money
1. On an unpaid invoice: add a custom line, add a discount, apply a promo code. ✅ Totals and GST update, and each change is in **Settings → Audit log**.
2. **Part pay** $20 cash, then pay the rest by EFTPOS. ✅ Status goes Part-paid → Paid.
3. **Refund** part of a payment (admin). ✅ Shows as a negative payment, and End of day expected cash drops.
4. **Money → Debtors** lists anything unpaid, with **Remind** (sends an SMS, demo in demo mode).
5. **Money → End of day:** enter counted cash, then **Close day**. ✅ Any difference is recorded.
6. **Money → GST:** quarter totals look right.

### 5. Customers
1. **Customers:** search by name, mobile and rego. Try the filters (VIP, owing, lapsed).
2. Open a customer: edit details, add a car, add a note, **Send a message**. ✅ Each shows on their timeline.
3. **Import** a small CSV (name, mobile, rego). ✅ The dry run shows what will happen before anything is saved.
4. **Merge** two test customers (admin). ✅ History moves across.

### 6. Loyalty
1. **Booking site → My account → Create account** with the mobile from test 1. ✅ Past visits appear, with visit count and progress.
2. Complete visits for that customer until the reward threshold (Settings → Promos & loyalty says how many). ✅ A reward appears in their account.
3. Book again while signed in and pick the reward. ✅ The discount is applied at checkout.
4. Copy the referral link, and book with a new mobile through it. ✅ After that booking is completed, the referrer gets their reward.

### 7. Messages
1. **Messages → Sent messages:** confirmations, reminders and receipts from the tests above are listed as "Sent (demo)".
2. **Wording:** edit a template and check the preview. **Automatic messages → Check now.**
3. **Campaigns → New campaign:** the audience count updates as filters change. Send one (demo).

### 8. Feedback, reviews, TV
1. Open a completed booking's customer page and rate it **2 stars** with a comment. ✅ It's under **Messages → Feedback & reviews → To follow up**. Mark it **Sorted**.
2. Rate another **5 stars**. ✅ The customer is offered the public review link (if one is set in Settings → Business).
3. Use **Put on website** on the 5-star one. ✅ The booking site home page now shows a Reviews section.
4. **Settings → Shop TV → Open.** ✅ Cars in bays and ready cars show with first names only, and messages rotate.

### 9. Settings
1. Change a price in **Services & prices**. ✅ The booking site shows it after a refresh, and new bookings use it.
2. Add a **Closure** for a day. ✅ The booking site shows that day as Closed.
3. Change **Hours & booking** (e.g. minimum notice). ✅ Booking times respect it.
4. **Reports:** switch date ranges, hover the charts, **Export CSV**.

### 10. Phone and tablet checks
- Booking site on a phone: nothing scrolls sideways, and the price bar stays at the bottom during booking.
- Staff app on a 10" tablet (landscape): all four Floor lanes are visible side by side. On a phone, the bottom bar has **More** for History, Reports, Messages and Settings.

## B. Automated tests (run on every change)

| What | Where | Count |
|---|---|---|
| Database: upgrade of a copy of the live V1 database (run twice), fresh-install parity, every server function, a permissions matrix (public / customer / staff / admin / deactivated staff), demo data add/remove, hardening + rollback | `supabase/tests` (`npm test`) | 94 |
| Staff app helpers: money/GST, phone/rego, dates, CSV import/export safety, ABN, QLD holidays, message length/encoding, templates | `admin-app` (`npm test`) | 18 |
| Booking site helpers | `customer-app` (`npm test`) | 7 |
| Typecheck, lint, production build | both apps | ✔ |

Also checked by hand during the build: every new query was run against the live database with the public key (queries valid, private data hidden), and every screen was screenshotted at phone, tablet and desktop sizes.
