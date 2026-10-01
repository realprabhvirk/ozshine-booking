// Supabase-in-a-box for tests: PGlite + the bits of Supabase the SQL relies on
// (roles, auth schema + auth.uid(), extensions schema, default grants, the
// realtime publication). Impersonation works like PostgREST: SET ROLE plus a
// request.jwt.claim.sub setting that auth.uid() reads.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const here = dirname(fileURLToPath(import.meta.url));
export const read = (rel) => readFileSync(join(here, rel), "utf8");

const SUPABASE_STUBS = `
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
-- Supabase's default privileges: every new table/function/sequence in public
-- is fully granted to the API roles, so RLS + explicit revokes are the only
-- guard. Replicating this is what makes the RLS tests meaningful.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create publication supabase_realtime;
set timezone = 'UTC';
`;

export async function makeDb() {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
  await db.exec(SUPABASE_STUBS);
  return db;
}

// Run fn as a Supabase API role. uid = null → anon.
export async function as(db, role, uid, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

// Call an RPC and return its single value (or rows for set-returning ones).
export async function rpc(db, sql, params = []) {
  const res = await db.query(sql, params);
  if (res.rows.length === 1 && Object.keys(res.rows[0]).length === 1) {
    return Object.values(res.rows[0])[0];
  }
  return res.rows;
}

// Expect a call to fail with a given error code (our oz_raise message) or
// Postgres SQLSTATE. Returns the error for further checks.
export async function expectError(promise, match) {
  try {
    await promise;
  } catch (e) {
    const text = `${e.message} ${e.code ?? ""} ${e.detail ?? ""}`;
    if (match && !(match instanceof RegExp ? match.test(text) : text.includes(match))) {
      throw new Error(`Expected error matching ${match}, got: ${text}`);
    }
    return e;
  }
  throw new Error(`Expected an error matching ${match}, but the call succeeded`);
}

// A structural fingerprint of the public schema for drift comparison.
export async function fingerprint(db) {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => JSON.stringify(r)).sort();
  return {
    columns: await q(`
      select table_name, column_name, data_type, is_nullable,
             regexp_replace(coalesce(column_default, ''), 'nextval.*', 'seq') as dflt
      from information_schema.columns where table_schema = 'public'`),
    constraints: await q(`
      select conrelid::regclass::text as tbl, contype, pg_get_constraintdef(oid) as def
      from pg_constraint where connamespace = 'public'::regnamespace`),
    indexes: await q(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public'`),
    functions: await q(`
      select p.proname, pg_get_function_identity_arguments(p.oid) as args, md5(p.prosrc) as src,
             p.prosecdef, coalesce(p.proconfig::text, '') as cfg
      from pg_proc p where p.pronamespace = 'public'::regnamespace`),
    policies: await q(`
      select tablename, policyname, cmd, roles::text, coalesce(qual, '') as qual, coalesce(with_check, '') as wc
      from pg_policies where schemaname = 'public'`),
    triggers: await q(`
      select event_object_table, trigger_name, event_manipulation, action_timing, action_statement
      from information_schema.triggers where trigger_schema = 'public'`),
    rls: await q(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`),
    function_grants: await q(`
      select routine_name, grantee, privilege_type from information_schema.routine_privileges
      where routine_schema = 'public' and grantee in ('anon', 'authenticated')`),
    table_grants: await q(`
      select table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')`),
    publication: await q(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`),
  };
}
