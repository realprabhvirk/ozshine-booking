# SQL tests

These run the real SQL files against an in-memory Postgres (PGlite, Postgres
compiled to WebAssembly) with Supabase's auth roles, `auth.uid()`, default
grants and the realtime publication stubbed in, so row-level security and
function permissions behave the way they do on Supabase.

```
cd supabase/tests
npm install
npm test               # runs everything
npm run build-schema   # regenerates ../schema.sql after editing upgrade_v2.sql
```

What's covered:

1. **Upgrade the real v1 database.** Replays exactly what production has
   (`fixtures/v1_phase5_schema.sql` plus the two snippets pasted into the SQL
   editor), adds v1-style data with messy phone numbers and regos, then runs
   `upgrade_v2.sql` **twice**. Checks no v1 row or value changed, phones and
   regos were normalised, and seeds weren't duplicated.
2. **Fresh install parity.** Builds a database from `schema.sql` and checks it
   is structurally identical to the upgraded one (columns, constraints,
   indexes, function bodies, policies, triggers, grants, realtime). Also
   fails if `schema.sql` is out of date.
3. **RPCs.** Slot availability (peak concurrency, closures, lead time),
   public booking (server-side pricing, throttles, honeypot), the booking
   state machine, invoices (numbering, GST, edits), payments, refunds, voids,
   loyalty, referrals, promos, vouchers, walk-ins, PIN sessions, CSV import,
   merge, messaging and automations, reports, the shop TV board, and the v1
   compatibility paths.
4. **RLS matrix.** What anon, a signed-in customer, staff, an admin and a
   deactivated staffer can and can't see or write.
5. **Demo data and hardening.** `seed_demo.sql` → `remove_demo.sql` leaves
   real data identical; `post_merge_hardening.sql` blocks direct writes while
   the RPCs keep working; `rollback_hardening.sql` undoes it.

PGlite runs Postgres 18; Supabase runs 15/17. Nothing in the SQL depends on
18-only features.
