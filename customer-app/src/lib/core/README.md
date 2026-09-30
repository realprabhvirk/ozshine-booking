# lib/core

Framework-free helpers shared by both apps. **The files in this folder are
identical in `admin-app/src/lib/core` and `customer-app/src/lib/core`** — the
apps are independent projects, so the code is copied rather than shared, and
`supabase/tests` fails if the two copies drift apart. Edit one, copy it to the
other.

- `phone.ts`, `money.ts` mirror the SQL rules exactly (`normalize_au_phone`,
  `normalize_rego`, `is_valid_phone`, `gst_from_inclusive`); the SQL test
  suite runs the same inputs through both and checks they agree.
- `time.ts` — everything is Brisbane time (no daylight saving), never the
  server's or browser's local zone.
- `status.ts` mirrors `legal_next_statuses()`.
- `errors.ts` turns the database's error codes into friendly messages.

Imports between these files use explicit `.ts` extensions so Node can run the
unit tests directly (`npm test`).
