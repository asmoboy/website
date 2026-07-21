-- TOP Pep — email-automation schema
-- Run this once in your Supabase SQL editor (a fresh, empty query is fine).
--
-- Adds:
--   • carts            — one saved basket per email, for the abandoned-cart
--                        reminder the Worker sends on a schedule (Cron Trigger).
--   • orders.tracking* — so "your order shipped" emails can carry a tracking link.

-- ─────────────────────────────────────────────────────────────
-- carts  (abandoned-cart reminders)
--   The customer's basket is upserted here the moment they enter their email
--   at checkout. A Cloudflare Cron Trigger later finds carts that are older
--   than a few hours, still un-reminded and not yet converted to an order,
--   and emails a single reminder.
-- ─────────────────────────────────────────────────────────────
create table if not exists carts (
  id           uuid primary key default gen_random_uuid(),
  email        text        not null unique,      -- one active cart per email (upsert)
  name         text,
  lang         text,
  currency     text,
  items        jsonb       not null default '[]',
  total        numeric(10,2),
  total_text   text,
  updated_at   timestamptz not null default now(),
  reminded_at  timestamptz,                       -- set once the reminder is sent
  converted    boolean     not null default false -- true once an order is placed
);
create index if not exists carts_updated_idx on carts (updated_at);

-- Only the Worker (service_role, which BYPASSES RLS) ever touches this table.
alter table carts enable row level security;

-- ─────────────────────────────────────────────────────────────
-- orders — tracking columns for the "shipped" email
-- ('shipped' is already an allowed status from affiliates-schema.sql)
-- ─────────────────────────────────────────────────────────────
alter table orders add column if not exists tracking_url text;
alter table orders add column if not exists carrier      text;
alter table orders add column if not exists shipped_at   timestamptz;
