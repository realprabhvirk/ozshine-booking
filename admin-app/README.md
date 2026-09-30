# OzShine Beenleigh — Staff app

The shop's day-to-day system: the live Floor, schedule, walk-ins and phone bookings, checkout and invoices, money (debtors, end of day, GST), customers, messages, reports, settings, and the waiting-room TV (`/display/<key>`).

- Build brief and rules: repo root `CLAUDE.md`
- Owner handover: `docs/HANDOVER.md`
- Env vars: `.env.local.example` (only the Supabase URL and anon key are required)
- Checks: `npm run typecheck && npm run lint && npm test && npm run build`
