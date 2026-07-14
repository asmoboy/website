# TOP Pep — payments backend (Phase 2)

The public site is fully static. Phase 1 already works without any backend:

- Checkout offers **bank transfer only** (card + crypto are hidden in the DOM).
- Each order gets a unique payment reference `TOP-XXXXXXXX` (8 chars, no
  ambiguous 0/O/1/I).
- The order is stored in the browser (`localStorage → toppep_orders`) and a
  copy is emailed to `orders@top-pep.com` (via formsubmit.co) as the pending list.
- The **“Complete your bank transfer”** page shows amount, reference and the
  bank details (from `PAYMENT_BANK_DETAILS` in `data.js`) with copy buttons.
- `/admin/` lists orders on that device, lets you mark one **paid**, and opens
  a prefilled thank-you email to the customer in their language.

## Why a backend for Phase 2

Two things a static site cannot do on its own:

1. **A guaranteed-unique reference** across all customers and devices — needs a
   database `UNIQUE` constraint (`schema.sql`).
2. **One central order list** reachable from any device, plus **fully automatic**
   thank-you emails on “paid” (no click) — needs a server + email provider.

## Files

| File | What it is |
|------|------------|
| `schema.sql` | Postgres/Supabase table for orders, with `ref` UNIQUE. |
| `order-api.js` | Serverless endpoint stub: `POST /orders`, `PATCH /orders/:ref/paid`, plus the localised thank-you email. Fill in the DB + email TODOs. |

## Wiring it up (≈30 min)

1. Create a Supabase project → SQL editor → run `schema.sql`.
2. Deploy `order-api.js` as a Supabase Edge Function / Cloudflare Worker.
   Set env vars: DB URL/key, `ADMIN_TOKEN`, `RESEND_API_KEY`.
3. In `data.js`, set `ORDER_API_URL` to the deployed endpoint. The site then
   POSTs every new order to it automatically (it already tries this when the
   value is non-empty) — the DB becomes the source of truth for uniqueness.
4. Point `/admin/` at the API (`GET /orders`) instead of localStorage, guarded
   by `ADMIN_TOKEN`, so you can manage orders from anywhere. Marking paid there
   fires the automatic email.

Bank details live in **one place** — `PAYMENT_BANK_DETAILS` in `data.js` (and
mirrored in `order-api.js` for server-side emails). Change them once.
