-- TOP Pep — admin 2FA brute-force hardening
-- ⚠️ Run this ONCE in your Supabase SQL editor BEFORE deploying the matching
-- Worker build (the Worker now reads admin_mfa_codes.attempts / .locked, so the
-- columns must exist first — otherwise admin login errors).
--
-- Adds:
--   • attempts — number of wrong tries against a code
--   • locked   — set true once a code is burned (too many wrong tries)
-- Together with the Worker changes this enforces:
--   • at most ONE active code per admin (older unused codes invalidated on
--     each new request — done in the Worker),
--   • at most 5 wrong attempts per code, then the code is locked,
--   • a short server-side cooldown between code requests (checked against
--     created_at in the Worker — not an in-memory counter).

alter table admin_mfa_codes add column if not exists attempts integer not null default 0;
alter table admin_mfa_codes add column if not exists locked   boolean not null default false;

create index if not exists admin_mfa_codes_active_idx
  on admin_mfa_codes (email, used, locked, expires_at);
