# TOP Pep — payments backend (Phase 2)

The public site is fully static. Phase 1 already works without any backend:

- Checkout offers **bank transfer** always, and **card (Stripe)** once the
  Worker below is deployed with a Stripe key. Crypto stays hidden in the DOM.
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
| `order-api.js` | Cloudflare Worker: `POST /orders`, `PATCH /orders/:ref/paid`, `GET /orders`, wired to Supabase + Resend. |
| `wrangler.toml` | Worker config. Secrets are set separately, never committed. |
| `package.json` | Dependencies (`@supabase/supabase-js`) and `npm run deploy`. |

## Wiring it up (≈30 min)

1. Create a Supabase project → SQL editor → run `schema.sql`.
2. In this folder: `npm install`, then `wrangler login` (opens a browser to
   authorize your Cloudflare account).
3. Set the secrets (you'll be prompted to paste each value):
   ```
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_KEY
   wrangler secret put ADMIN_TOKEN
   wrangler secret put RESEND_API_KEY
   ```
   - `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`: Supabase project → Settings → API
     (use the **service_role** key — server-side only, never expose it client-side).
   - `ADMIN_TOKEN`: any long random string you choose; guards `GET /orders` and
     `PATCH /orders/:ref/paid`.
   - `RESEND_API_KEY`: from resend.com, used to send the thank-you email.
4. `npm run deploy` (or `wrangler deploy`). Note the `*.workers.dev` URL it prints.
5. In `data.js`, set `ORDER_API_URL` to that URL. The site then POSTs every
   new order to it automatically (it already tries this when the value is
   non-empty) — the DB becomes the source of truth for uniqueness.
6. Point `/admin/` at the API (`GET /orders`, with `Authorization: Bearer <ADMIN_TOKEN>`)
   instead of localStorage, so you can manage orders from anywhere. Marking
   paid there fires the automatic email.

Bank details live in **one place** — `PAYMENT_BANK_DETAILS` in `data.js` (and
mirrored in `order-api.js` for server-side emails). Change them once.

## Card payments (Stripe hosted Checkout)

The card option uses **Stripe Checkout**: the customer is redirected to a
Stripe-hosted payment page, so card data is entered on Stripe — never on our
site and never sent to our server (PCI-safe). No card fields live in the DOM.

Flow: front-end `POST {ORDER_API_URL}/stripe/checkout` → Worker creates a
Checkout Session with the **secret** key → returns `session.url` → browser
redirects there → on success Stripe returns to
`/checkout/?stripe=success&ref=…`; on cancel to `/checkout/?stripe=cancel`.
Stripe then calls `POST {ORDER_API_URL}/stripe/webhook`, which verifies the
signature and (if Supabase is wired) marks the order **paid** and emails the
customer automatically.

**The card option only appears at checkout when BOTH are set:**
`STRIPE_PUBLISHABLE_KEY` in `data.js` and `ORDER_API_URL` (the deployed Worker).

### Keys — where each one goes

| Key | Where | Notes |
|-----|-------|-------|
| Publishable `pk_…` | `data.js` (`STRIPE_PUBLISHABLE_KEY`) | Safe to expose in the browser. |
| Secret `sk_…` | Worker secret only | `wrangler secret put STRIPE_SECRET_KEY` — **never** in any committed file. |
| Webhook signing `whsec_…` | Worker secret only | `wrangler secret put STRIPE_WEBHOOK_SECRET`. |

Never put the **secret** or **restricted** key in `data.js`, the HTML, or git.

### Go live (Stripe test → live)

1. `cd backend && npm i`
2. `wrangler secret put STRIPE_SECRET_KEY`      (paste the `sk_…` key)
3. Create a webhook in the Stripe dashboard → endpoint
   `https://<your-worker>/stripe/webhook`, event `checkout.session.completed`
   → copy its signing secret → `wrangler secret put STRIPE_WEBHOOK_SECRET`
4. In `wrangler.toml` set `ALLOWED_ORIGIN` / `SITE_URL` to your real site
   origin (needed for CORS + the success/cancel redirects).
5. `npm run deploy`
6. Swap the `pk_test_…`/`sk_test_…` pair for the live `pk_live_…`/`sk_live_…`
   pair when you're ready to take real payments (update `data.js` + the Worker
   secret), and re-create the webhook in live mode.
