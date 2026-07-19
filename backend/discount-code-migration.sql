-- TOP Pep — unify referral codes with checkout discount codes
-- Run this once in your Supabase project (SQL editor) — your `affiliates`
-- table already exists, this just adds the new column.
--
-- After this, an affiliate's own referral_code can ALSO be typed by a
-- customer into the "Promo code" field at checkout: it gives them
-- discount_pct% off AND still attributes the sale to that affiliate for
-- commission, exactly like their tracking link does.

alter table affiliates add column if not exists discount_pct
  numeric(5,2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100);
