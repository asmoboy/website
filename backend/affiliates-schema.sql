-- TOP Pep — Affiliate tracking schema
-- Run this once in your Supabase project (SQL editor), AFTER schema.sql.
--
-- Model: no returns/cancellations of *paid* goods, so a confirmed commission is
-- final. Card/prepaid sales confirm on payment; cash-on-delivery (COD) sales
-- stay "pending" (shown but not payable) until the parcel is actually delivered
-- — a wrong address or a refused COD parcel must never pay out a commission.

-- ─────────────────────────────────────────────────────────────
-- affiliates
-- ─────────────────────────────────────────────────────────────
create table if not exists affiliates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users (id) on delete set null,  -- login link (Supabase Auth) for the dashboard
  name           text        not null,
  email          text        not null,
  referral_code  text        not null unique,          -- the ?ref=CODE token
  commission_pct numeric(5,2) not null default 20 check (commission_pct >= 0 and commission_pct <= 100),
  payout_method  text        check (payout_method in ('paypal','bank')),
  payout_details text,                                  -- PayPal email or IBAN
  active         boolean     not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists affiliates_code_idx on affiliates (referral_code);
create index if not exists affiliates_user_idx on affiliates (user_id);

-- ─────────────────────────────────────────────────────────────
-- clicks  (one row per referred visit)
-- ─────────────────────────────────────────────────────────────
create table if not exists clicks (
  id            bigint generated always as identity primary key,
  referral_code text        not null,
  affiliate_id  uuid        references affiliates (id) on delete cascade,
  referrer      text,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists clicks_affiliate_idx on clicks (affiliate_id);
create index if not exists clicks_created_idx   on clicks (created_at);

-- ─────────────────────────────────────────────────────────────
-- sales  (one row per referred order — unique on order_ref)
-- ─────────────────────────────────────────────────────────────
create table if not exists sales (
  id             bigint generated always as identity primary key,
  order_ref      text        not null unique,          -- links to orders.ref
  order_no       text,
  referral_code  text        not null,
  affiliate_id   uuid        references affiliates (id) on delete set null,
  order_total    numeric(10,2) not null,               -- commission base (item subtotal after discount)
  commission_pct numeric(5,2)  not null,
  commission     numeric(10,2) not null,
  -- pending  = recorded, shown to the affiliate, NOT payable yet
  -- confirmed = payable (card paid, or COD delivered)
  -- cancelled = excluded (self-referral, or COD refused / undeliverable)
  status         text        not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  self_referral  boolean     not null default false,
  payout_status  text        not null default 'unpaid' check (payout_status in ('unpaid','paid')),
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  paid_out_at    timestamptz
);
create index if not exists sales_affiliate_idx on sales (affiliate_id);
create index if not exists sales_status_idx    on sales (status);

-- Add a "delivered" state to orders so COD sales can be confirmed on delivery.
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending','paid','cod','shipped','delivered','cancelled'));
alter table orders add column if not exists delivered_at timestamptz;

-- ═════════════════════════════════════════════════════════════
-- Row-Level Security
--   • The Worker uses the service_role key, which BYPASSES RLS — it does all
--     writes (clicks, sales, confirmations, payouts).
--   • The affiliate dashboard uses the anon key + a logged-in session; these
--     policies let each affiliate read ONLY their own rows.
-- ═════════════════════════════════════════════════════════════
alter table affiliates enable row level security;
alter table clicks     enable row level security;
alter table sales      enable row level security;

drop policy if exists "affiliate reads own profile" on affiliates;
create policy "affiliate reads own profile" on affiliates
  for select using (user_id = auth.uid());

drop policy if exists "affiliate reads own clicks" on clicks;
create policy "affiliate reads own clicks" on clicks
  for select using (affiliate_id in (select id from affiliates where user_id = auth.uid()));

drop policy if exists "affiliate reads own sales" on sales;
create policy "affiliate reads own sales" on sales
  for select using (affiliate_id in (select id from affiliates where user_id = auth.uid()));
-- No INSERT/UPDATE/DELETE policies for anon/authenticated → the dashboard is
-- read-only; every write goes through the Worker (service_role).
