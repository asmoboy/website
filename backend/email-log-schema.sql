-- TOP Pep — email log
-- Run this once in your Supabase SQL editor (a fresh, empty query is fine).
--
-- One row per customer email the Worker sends, so the orders dashboard can show
-- exactly which mails a customer has already received (confirmation, COD
-- confirmation, shipped/tracking, abandoned-cart reminder).

create table if not exists email_log (
  id         bigint generated always as identity primary key,
  email      text        not null,
  order_ref  text,                     -- null for cart reminders (matched by email)
  kind       text        not null,     -- confirmation | cod_confirmation | shipped | cart_reminder
  subject    text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_ref_idx   on email_log (order_ref);
create index if not exists email_log_email_idx on email_log (lower(email));

-- Only the Worker (service_role, which BYPASSES RLS) writes/reads this.
alter table email_log enable row level security;
