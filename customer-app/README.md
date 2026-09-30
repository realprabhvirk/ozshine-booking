# OzShine Beenleigh — Booking site

The public site: services and prices, online booking (`/book`), each customer's booking link (`/manage/<token>`), receipts (`/r/<token>`) and the optional rewards account (`/account`).

- Build brief and rules: repo root `CLAUDE.md`
- Owner handover: `docs/HANDOVER.md`
- Env vars: `.env.local.example` (only the Supabase URL and anon key are required)
- Checks: `npm run typecheck && npm run lint && npm test && npm run build`
