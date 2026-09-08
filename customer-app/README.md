# OzShine Beenleigh — Public Booking Site

The public-facing site: hero, services + pricing, and the guest booking
form. See the repo root `CLAUDE.md` for the full build brief.

This is an independent Next.js project — it has its own `package.json`
and deploys as its own Vercel project (Root Directory: `customer-app`).

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in your Supabase
project's URL and anon key (Supabase dashboard → Project Settings → API).
In Vercel these are set under Project Settings → Environment Variables
instead.

## Requires

`supabase/schema.sql` (repo root) must already be run against your
Supabase project — this site reads the `services` table directly, so
without it the services section renders empty.
