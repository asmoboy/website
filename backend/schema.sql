-- TOP Pep — orders schema (Phase 2)
-- Run this once in your Postgres / Supabase project.

create table if not exists orders (
  id            bigint generated always as identity primary key,
  ref           text        not null unique,          -- payment reference TOP-XXXXXXXX (never repeats)
  order_no      text        not null,
  status        text        not null default 'pending' check (status in ('pending','paid','shipped','cancelled')),
  currency      text        not null default 'eur',
  total         numeric(10,2) not null,
  total_text    text        not null,
  email         text        not null,
  name          text        not null,
  org           text,
  address       text,
  city          text,
  zip           text,
  country       text,
  lang          text        not null default 'en',
  items         jsonb       not null default '[]',
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  shipped_at    timestamptz
);

-- fast lookups by reference and status
create index if not exists orders_ref_idx    on orders (ref);
create index if not exists orders_status_idx on orders (status);

-- The UNIQUE constraint on ref is the real guarantee that a payment
-- reference can never repeat: a duplicate INSERT fails at the database
-- level, so the API can retry with a fresh reference.
