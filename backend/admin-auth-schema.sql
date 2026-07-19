-- TOP Pep — admin authentication schema
-- Run this once in your Supabase project (SQL editor), after schema.sql and
-- affiliates-schema.sql.
--
-- Replaces the old static ADMIN_TOKEN with a real login: Supabase email +
-- password, then a 6-digit code emailed as a second factor. Only emails
-- listed in `admins` can ever pass; everything else (admin_mfa_codes,
-- admin_sessions) is bookkeeping the Worker owns via its service_role key.

-- ─────────────────────────────────────────────────────────────
-- admins — the allow-list of who may become an admin at all
-- ─────────────────────────────────────────────────────────────
create table if not exists admins (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

-- Your admin account. Create the matching Supabase Auth user yourself in
-- Authentication → Users → Add user (set a password there — the Worker
-- never sees or stores it), then run this once:
insert into admins (email) values ('affiliateadmin@top-pep.com')
  on conflict (email) do nothing;

-- ─────────────────────────────────────────────────────────────
-- admin_mfa_codes — one-time 6-digit codes emailed as the 2nd factor
-- ─────────────────────────────────────────────────────────────
create table if not exists admin_mfa_codes (
  id         bigint generated always as identity primary key,
  email      text        not null,
  code_hash  text        not null,     -- sha256 of the 6-digit code, never the code itself
  used       boolean     not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_mfa_codes_email_idx on admin_mfa_codes (email, expires_at);

-- ─────────────────────────────────────────────────────────────
-- admin_sessions — the token issued after a successful 2FA login
-- ─────────────────────────────────────────────────────────────
create table if not exists admin_sessions (
  id         bigint generated always as identity primary key,
  email      text        not null,
  token_hash text        not null unique,   -- sha256 of the session token, never the token itself
  revoked    boolean     not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_sessions_token_idx on admin_sessions (token_hash);

-- ═════════════════════════════════════════════════════════════
-- Row-Level Security — enabled with NO policies for anon/authenticated on
-- any of these three tables. Only the Worker's service_role key (which
-- bypasses RLS) may ever read or write them; the browser never touches
-- them directly.
-- ═════════════════════════════════════════════════════════════
alter table admins           enable row level security;
alter table admin_mfa_codes  enable row level security;
alter table admin_sessions   enable row level security;
