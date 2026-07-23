-- TOP Pep — RLS security check (READ-ONLY, changes nothing)
-- Paste this in the Supabase SQL editor and run it. It tells you whether every
-- sensitive table is protected by Row-Level Security, and lists any policy that
-- would let the PUBLIC anon key read/write it.
--
-- WHY THIS MATTERS: the anon key in data.js is public by design. It is only safe
-- if every table has RLS ENABLED and NO policy granting access to the "anon" or
-- "authenticated" role for the data tables. The Worker uses the service_role key
-- (which bypasses RLS) for all writes; the browser should reach almost nothing.

-- 1) RLS enabled? Every row below should read rls_enabled = true.
select
  c.relname                          as table_name,
  c.relrowsecurity                   as rls_enabled,
  c.relforcerowsecurity              as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'orders','carts','sales','affiliates','clicks','email_log',
    'admins','admin_mfa_codes','admin_sessions'
  )
order by c.relname;

-- 2) Any policies at all? For the DATA tables (orders, carts, sales, affiliates,
--    clicks, email_log, admin_*) there should ideally be NO policy that targets
--    role "anon". A SELECT policy scoped by the logged-in user's JWT is expected
--    ONLY on affiliates/clicks/sales (for the affiliate dashboard). Anything that
--    lets "anon" read orders/carts/admin_* is a problem to remove.
select
  schemaname,
  tablename,
  policyname,
  roles,          -- look for {anon} here on data tables → BAD
  cmd,            -- SELECT / INSERT / UPDATE / DELETE / ALL
  qual            -- the USING (...) condition
from pg_policies
where schemaname = 'public'
  and tablename in (
    'orders','carts','sales','affiliates','clicks','email_log',
    'admins','admin_mfa_codes','admin_sessions'
  )
order by tablename, policyname;

-- HOW TO READ THE RESULT:
--   • Query 1: any table with rls_enabled = false → run:
--       alter table <that_table> enable row level security;
--   • Query 2: any row with roles containing {anon} on orders / carts /
--     admin_mfa_codes / admin_sessions / email_log → that policy exposes data;
--     drop it:  drop policy "<policyname>" on <tablename>;
--   • The affiliate dashboard needs read-only policies on affiliates/clicks/sales
--     scoped by  lower(email) = lower(auth.jwt() ->> 'email')  — those are fine.
