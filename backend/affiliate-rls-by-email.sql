-- TOP Pep — fix: match affiliate RLS by email instead of user_id
-- Run this once in your Supabase SQL editor.
--
-- The dashboard showed "No affiliate profile linked to this login" because the
-- old policies matched affiliates.user_id = auth.uid(), and that user_id link
-- can be missing (e.g. when the login was created via the set-password email
-- flow). Matching by the logged-in user's verified JWT email is robust — the
-- admin already sets each affiliate's email, so it always lines up.

drop policy if exists "affiliate reads own profile" on affiliates;
create policy "affiliate reads own profile" on affiliates
  for select using (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "affiliate reads own clicks" on clicks;
create policy "affiliate reads own clicks" on clicks
  for select using (affiliate_id in (select id from affiliates where lower(email) = lower(auth.jwt() ->> 'email')));

drop policy if exists "affiliate reads own sales" on sales;
create policy "affiliate reads own sales" on sales
  for select using (affiliate_id in (select id from affiliates where lower(email) = lower(auth.jwt() ->> 'email')));
