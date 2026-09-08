# OzShine Beenleigh — Staff Admin App

The staff-facing dashboard: booking queue, today's KPIs, customer lookup,
and manual booking creation. See the repo root `CLAUDE.md` for the full
build brief.

This is an independent Next.js project — it has its own `package.json`
and deploys as its own Vercel project (Root Directory: `admin-app`).

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in your Supabase
project's URL and anon key (Supabase dashboard → Project Settings → API).
In Vercel these are set under Project Settings → Environment Variables
instead.

## Requires

`supabase/schema.sql` (repo root) must already be run against your
Supabase project, and you need at least one row in the `staff` table
whose `auth_user_id` matches a real Supabase Auth user — that's the
account you log in with here. Create the Auth user first (Supabase
dashboard → Authentication → Users → Add user, with email confirmation
disabled per the brief), then insert a matching `staff` row via the SQL
editor.
