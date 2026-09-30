# OzShine V2 "Shop OS" — Upgrade Notes

Living document for the `feature/v2-shop-os` branch. Updated as each phase lands.

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
- **Staff PINs** live in their own locked-down table (never readable by the apps, not even by admins). Five wrong PINs lock that person out for 5 minutes. The shared tablet stays logged in as the shop account; the PIN only switches who's "acting".
- **Capacity uses the real peak.** A new booking fits if, at every moment it overlaps, fewer than the max cars are already in. It doesn't just count "anything overlapping", which would wrongly block back-to-back bookings.
- **Messages:** every SMS and email is written to an outbox. In demo mode (the default) nothing is sent and each one is marked "simulated". Demo customers can never be sent a real message, even when a live provider is switched on.
- **Deactivated staff lose access immediately.** V1's staff permissions only checked "has a staff row"; the upgrade re-creates them to also require the account to be active (same policy names, so V1 keeps working).
- **Linking an online account to past bookings by phone** only happens when the existing record has no email or the same email. Phone numbers aren't verified (there's no SMS), so a number alone must not hand over a stranger's history. Otherwise a fresh profile is created and staff can merge the two.
- **Demo data is fully removable.** Every demo row is flagged; demo invoices are numbered `DEMO-…` so they don't use up real invoice numbers.

## Env vars (all optional)

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required (already set in Vercel). Anything added later for real SMS/email sending will be optional and off by default. This section gets filled in with Phase 7.

## Known limitations

- Phone numbers can't be verified without real SMS, so phone-only guest records are "first come, first served" when someone signs up (see Decisions).
- Tests run on Postgres 18 (PGlite); Supabase runs 15/17. The SQL avoids anything version-specific.
- **Bug found in the live V1 site (confirmed by test):** the public booking form fails for any brand-new guest with "Couldn't save your details". It creates the customer and then reads the row back, but the public role isn't allowed to read customers. Returning guests fail differently: the public can't look up their phone, so the app tries to create a duplicate. V2's `create_public_booking` function does all of this server-side and fixes both. I haven't patched `main` directly (this branch never touches `main`).

## What I'd do next

- SMS one-time-code verification of phone numbers (would close the account-linking gap properly).
- Real SMS/email provider accounts (Twilio / Resend) once the owner signs off.
