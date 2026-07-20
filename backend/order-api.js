/**
 * TOP Pep — Order API (Phase 2, Cloudflare Worker)
 * ----------------------------------
 * A single Worker that owns the order lifecycle against Supabase (Postgres):
 *
 *   POST   /orders              → create a pending order (DB unique ref)
 *   PATCH  /orders/:ref/paid    → mark paid + send the thank-you email
 *   GET    /orders?status=...   → admin list (protected by an admin session — see below)
 *
 * Admin auth (replaces the old static ADMIN_TOKEN):
 *   POST /admin/login/request-code → body {}, header Authorization: Bearer
 *        <Supabase access token from signInWithPassword>. Only emails present
 *        in the `admins` table get a 6-digit code emailed to them.
 *   POST /admin/login/verify-code  → body { code }, same header. On success
 *        returns a short-lived (12h) admin session token — every admin-only
 *        route below checks THIS token against `admin_sessions`, not the
 *        Supabase JWT and not any static secret.
 *   POST /admin/logout             → revokes the given admin session token.
 *
 * The static site posts new orders here when data.js `ORDER_API_URL` is set.
 * All secrets are read from `env` (Worker secrets/vars) — never hardcoded.
 * Set them with `wrangler secret put <NAME>` (see backend/README.md).
 *
 * Card payments (Stripe embedded Payment Element — no redirect):
 *
 *   POST   /stripe/payment-intent → create a PaymentIntent, return client_secret
 *   POST   /stripe/webhook        → Stripe calls this on payment; marks paid + emails
 *
 * PRIVACY: Stripe only ever receives the amount + our order reference —
 * never the product names or basket contents (see computeAmountCents).
 *
 * Required env bindings:
 *   SUPABASE_URL          – e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY   – Supabase service_role key (server-side only!)
 *   RESEND_API_KEY         – Resend API key for the thank-you email + admin 2FA code
 *   STRIPE_SECRET_KEY      – Stripe secret key (sk_...) — CARD PAYMENTS, server-only!
 *   STRIPE_WEBHOOK_SECRET  – Stripe webhook signing secret (whsec_...) for /stripe/webhook
 *   SITE_URL               – (optional) public site origin for Stripe success/cancel URLs
 *   ALLOWED_ORIGIN          – (optional) CORS origin, defaults to https://top-pep.com
 */

import { createClient } from '@supabase/supabase-js';

const BANK = {
  accountName: 'Petru Birgauan',
  iban: 'BE37 9050 9304 4528',
  bic: 'TRWIBEB1XXX',
  bank: 'Wise (TransferWise)',
};
const FROM = 'TOP Pep <orders@top-pep.com>';

// =====================================================================
//  STRIPE — card payments via hosted Checkout
//  Talks to the Stripe REST API directly (form-encoded) so the Worker
//  needs no SDK. STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are secrets and
//  live only in the Worker env — never in the front-end.
// =====================================================================

// Flatten a nested object into Stripe's bracketed form-encoding, e.g.
//   { line_items: [ { quantity: 2, price_data: { currency: 'eur' } } ] }
//   → line_items[0][quantity]=2&line_items[0][price_data][currency]=eur
function stripeForm(obj, prefix, out) {
  out = out || [];
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined || val === null) continue;
    const k = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(val)) {
      val.forEach((v, i) => {
        if (v && typeof v === 'object') stripeForm(v, `${k}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${k}[${i}]`)}=${encodeURIComponent(v)}`);
      });
    } else if (typeof val === 'object') {
      stripeForm(val, k, out);
    } else {
      out.push(`${encodeURIComponent(k)}=${encodeURIComponent(val)}`);
    }
  }
  return out;
}

async function stripeApi(env, path, params) {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  const res = await fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: stripeForm(params).join('&'),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(data.error && data.error.message) || 'error'}`);
  return data;
}

// major currency units (e.g. euros) → minor units (cents) Stripe expects
function toMinorUnits(amount) { return Math.round(Number(amount) * 100); }

/* Total to charge, in minor units, summed server-side from the individual
   items (never a client-supplied total).
   PRIVACY: only this sum ever reaches Stripe — no product names, no basket
   contents. Stripe sees an amount + our order reference, nothing more. */
// promo codes are validated HERE, server-side — the front-end only requests a
// code; this is the authority on whether/how much it discounts.
const PROMO_CODES = { STIFI: 0.20, SANDY: 0.20 };
function promoRate(code) {
  const key = String(code || '').trim().toUpperCase();
  return PROMO_CODES[key] || 0;
}

// A code the customer types at checkout can be either an affiliate's own
// referral_code (admin-managed in the affiliates table) OR one of the static
// PROMO_CODES above. The AFFILIATE row wins when it exists — so promoting a
// code to a managed affiliate (with its own commission + discount %) overrides
// any static fallback of the same name; an inactive affiliate gives 0. Only
// when no affiliate row exists at all do we fall back to the static list.
// This is the single source of truth for "how much does this code discount";
// createSale() below uses it too, so the commission base and the customer's
// discount always agree.
async function resolveDiscountRate(db, code) {
  const trimmed = String(code || '').trim();
  if (!trimmed) return 0;
  if (db) {
    const { data } = await db.from('affiliates').select('discount_pct, active')
      .ilike('referral_code', trimmed).maybeSingle();
    if (data) return data.active === false ? 0 : Number(data.discount_pct || 0) / 100;
  }
  return promoRate(trimmed); // no affiliate row → static promo code fallback
}

async function computeAmountCents(db, payload) {
  let items = (payload.items || []).reduce(function (n, i) {
    const qty = Math.max(1, parseInt(i.qty, 10) || 1);
    return n + toMinorUnits(i.price) * qty;
  }, 0);
  // percentage discount applies to the item subtotal only (not shipping)
  const rate = await resolveDiscountRate(db, payload.promo);
  if (rate > 0) items -= Math.round(items * rate);
  let total = items;
  if (Number(payload.shipping) > 0) total += toMinorUnits(payload.shipping);
  if (Number(payload.insurance) > 0) total += toMinorUnits(payload.insurance);
  return total;
}

// ---- POST /stripe/payment-intent — embedded Payment Element (no redirect) ----
// The card fields render on our own page via Stripe.js; this returns the
// client_secret the front-end needs to confirm the payment in place.
async function createPaymentIntent(env, db, payload) {
  const base = pickOrderFields(payload);
  if (!base.email || !base.name || base.total === undefined) {
    return { error: 'missing required fields', status: 400 };
  }
  const addrError = validateAddress(base);
  if (addrError) return { error: addrError, status: 400 };
  const currency = (payload.currency || 'eur').toLowerCase();
  const amount = await computeAmountCents(db, payload);
  if (amount < 1) return { error: 'no items', status: 400 };

  let ref;
  if (db) {
    const created = await createOrder(db, payload);
    if (created.error) return created;
    ref = created.order.ref;
  } else {
    ref = payload.ref || genRef();
  }

  const intent = await stripeApi(env, '/payment_intents', {
    amount,
    currency,
    // dashboard shows the bare order reference only (e.g. TOP-R28VXUQB)
    description: ref,
    receipt_email: base.email,
    // Automatic payment methods (MUST match the front-end Payment Element,
    // which no longer passes paymentMethodTypes — mixing the two is what
    // caused the "collected through automatic payment methods … cannot be
    // confirmed" error). allow_redirects:'always' so redirect-based methods
    // (Klarna, Revolut Pay) work — the front-end confirmPayment passes a
    // return_url and the checkout page verifies redirect_status on return.
    // Which methods actually appear (card, Apple Pay, Google Pay, Klarna,
    // Revolut Pay …) is controlled in the Stripe Dashboard → Payment methods.
    automatic_payment_methods: { enabled: true, allow_redirects: 'always' },
    metadata: { ref, order_no: base.order_no || '', lang: base.lang || 'en' },
  });

  return { ok: true, clientSecret: intent.client_secret, ref, amount };
}

// ---- POST /stripe/webhook — Stripe's server-to-server payment confirmation ----
// Verifies the signature (HMAC-SHA256 over `${t}.${payload}`) so we only ever
// fulfil orders Stripe genuinely confirmed as paid.
async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  sigHeader.split(',').forEach((kv) => { const [k, v] = kv.split('='); if (k) parts[k.trim()] = v; });
  if (!parts.t || !parts.v1) return false;
  // reject signatures older than 5 minutes (replay protection)
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${parts.t}.${rawBody}`));
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time-ish compare
  if (expected.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

async function handleStripeWebhook(env, db, request) {
  const raw = await request.text();
  const ok = await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return { error: 'invalid signature', status: 400 };

  const event = JSON.parse(raw);
  // hosted Checkout → checkout.session.completed; embedded Element → payment_intent.succeeded
  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const obj = event.data.object;
    const ref = obj.client_reference_id || (obj.metadata && obj.metadata.ref);
    if (ref && db) {
      // idempotent: markPaid just sets status=paid and emails once
      await markPaid(db, ref, env).catch(() => {});
    }
  }
  return { ok: true, received: true };
}

// ---- reference generator (matches the front-end) ----
function genRef() {
  const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  const r = crypto.getRandomValues(new Uint32Array(8));
  for (let i = 0; i < 8; i++) s += a[r[i] % a.length];
  return 'TOP-' + s;
}

function isUniqueViolation(e) {
  return e && (e.code === '23505' || /unique/i.test(String(e.message || '')));
}

// ---- allow-listed columns we accept from the client payload ----
const ORDER_FIELDS = [
  'order_no', 'currency', 'total', 'total_text', 'email', 'name', 'org',
  'address', 'city', 'zip', 'country', 'lang', 'items', 'payment_method',
];

function pickOrderFields(payload) {
  const out = {};
  for (const k of ORDER_FIELDS) if (payload[k] !== undefined) out[k] = payload[k];
  return out;
}

// ---- server-side address sanity (mirrors the front-end checks) ----
// The browser already validates, but a hand-crafted request must not get
// through with an obviously broken address. Format only — the zip↔city
// cross-check stays client-side (it is advisory and depends on a 3rd party).
const POSTAL_SERVER = {
  Austria: /^\d{4}$/, Belgium: /^\d{4}$/, Bulgaria: /^\d{4}$/, Croatia: /^\d{5}$/,
  Cyprus: /^\d{4}$/, Czechia: /^\d{3} ?\d{2}$/, Denmark: /^\d{4}$/, Estonia: /^\d{5}$/,
  Finland: /^\d{5}$/, France: /^\d{5}$/, Germany: /^\d{5}$/, Greece: /^\d{3} ?\d{2}$/,
  Hungary: /^\d{4}$/, Ireland: /^[A-Za-z]\d{2} ?[A-Za-z0-9]{4}$/, Italy: /^\d{5}$/,
  Latvia: /^(LV-)?\d{4}$/i, Lithuania: /^(LT-)?\d{5}$/i, Luxembourg: /^(L-)?\d{4}$/i,
  Malta: /^[A-Za-z]{3} ?\d{4}$/, Netherlands: /^\d{4} ?[A-Za-z]{2}$/, Poland: /^\d{2}-?\d{3}$/,
  Portugal: /^\d{4}-?\d{3}$/, Romania: /^\d{6}$/, Slovakia: /^\d{3} ?\d{2}$/,
  Slovenia: /^(SI-)?\d{4}$/i, Spain: /^\d{5}$/, Sweden: /^\d{3} ?\d{2}$/, Switzerland: /^\d{4}$/,
  'United Kingdom': /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/,
};

function validateAddress(payload) {
  const address = String(payload.address || '').trim();
  const zip = String(payload.zip || '').trim();
  const country = String(payload.country || '').trim();
  if (!address) return 'address is required';
  // the front-end sends "Street 12" (street + house no. joined)
  if (!/\d/.test(address)) return 'address is missing a house number';
  if (!zip) return 'postal code is required';
  const re = POSTAL_SERVER[country];
  if (re && !re.test(zip)) return `postal code does not match the format for ${country}`;
  return null;
}

// ---- stock (mirror of IN_STOCK / SOLD_OUT in data.js) ----
// The server is authoritative for the cash-on-delivery rule and must NOT trust
// a client-supplied `inStock` flag. Keep these two maps in sync with data.js.
const IN_STOCK = {
  'retatrutide': ['10 mg'],
  'ghk-cu': ['50 mg'],
  'ghk-cu-serum': true,
  'tirzepatide': ['20 mg'],
  'bacteriostatic-water': ['10 ml'],
};
const SOLD_OUT = { 'bacteriostatic-water': ['3 ml'] };
function serverInStock(slug, option) {
  const so = SOLD_OUT[slug];
  if (so === true || (Array.isArray(so) && so.indexOf(option) > -1)) return false;
  const e = IN_STOCK[slug];
  if (e === true) return true;
  if (!e) return false;
  return e.indexOf(option) > -1;
}

// ---- cash-on-delivery rule (Romania only, whole basket ships in 24h) ----
// Returns an error string when the order must be rejected, else null.
function validateCod(payload) {
  if (String(payload.payment_method || '') !== 'cod') return null;
  if (String(payload.country || '').trim() !== 'Romania') {
    return 'cash on delivery is only available for delivery to Romania';
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return 'no items';
  for (const i of items) {
    if (!serverInStock(i.slug, i.option || '')) {
      return 'cash on delivery is only available when every item ships within 24 hours';
    }
  }
  return null;
}

// ---- POST /orders ----
async function createOrder(db, payload) {
  const base = pickOrderFields(payload);
  // items carry slug/option for the COD stock check — keep them on the record
  if (payload.items !== undefined) base.items = payload.items;
  if (!base.email || !base.name || !base.order_no || base.total === undefined) {
    return { error: 'missing required fields', status: 400 };
  }
  const addrError = validateAddress(base);
  if (addrError) return { error: addrError, status: 400 };
  // cash-on-delivery guard — server is authoritative (frontend checks aren't enough)
  const codError = validateCod(payload);
  if (codError) return { error: codError, status: 400 };

  const isCod = String(payload.payment_method || '') === 'cod';
  const startStatus = isCod ? 'cod' : 'pending';
  // Retry on the (astronomically unlikely) unique-constraint clash.
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = genRef();
    const { data, error } = await db
      .from('orders')
      .insert({ ...base, ref, status: startStatus })
      .select()
      .single();

    if (!error) {
      // attribute the sale to an affiliate if the order carried a ref code —
      // never let a tracking failure break the order itself
      await createSale(db, data, payload).catch(() => {});
      return { ok: true, order: data };
    }
    if (isUniqueViolation(error)) continue; // clash on ref → retry with a new one
    return { error: error.message, status: 500 };
  }
  return { error: 'could not allocate a unique reference', status: 500 };
}

// ---- PATCH /orders/:ref/paid ----
async function markPaid(db, ref, env) {
  const { data: order, error } = await db
    .from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('ref', ref)
    .select()
    .single();

  if (error) return { error: error.message, status: error.code === 'PGRST116' ? 404 : 500 };

  // card/prepaid is final once paid (no returns) → release the commission
  await confirmSale(db, ref).catch(() => {});

  try {
    await sendThankYouEmail(order, env);
  } catch (e) {
    // Order is already marked paid in the DB; surface the email failure
    // separately so it can be retried without re-triggering payment logic.
    return { ok: true, order, emailError: e.message };
  }
  return { ok: true, order };
}

// ---- GET /orders (admin list) ----
async function listOrders(db, status) {
  let q = db.from('orders').select('*').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return { error: error.message, status: 500 };
  return { ok: true, orders: data };
}

// ═══════════════════════════════════════════════════════════════
// AFFILIATE TRACKING
//   Commission is always computed HERE (server-side) from the item subtotal
//   after any promo discount — the front-end only sends the referral code, so a
//   tampered client can never inflate a payout. Card/prepaid sales confirm on
//   payment; COD sales stay 'pending' until the parcel is marked delivered.
// ═══════════════════════════════════════════════════════════════
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function itemsSubtotal(payload) {
  return (payload.items || []).reduce(function (n, i) {
    return n + (Number(i.price) || 0) * Math.max(1, parseInt(i.qty, 10) || 1);
  }, 0);
}

// record a referred click (only for codes that belong to a real affiliate)
async function recordClick(db, payload, ip) {
  const code = String(payload.ref || '').trim();
  if (!code) return;
  const { data: aff } = await db.from('affiliates').select('id, active').ilike('referral_code', code).maybeSingle();
  if (!aff || aff.active === false) return;
  await db.from('clicks').insert({
    referral_code: code,
    affiliate_id: aff.id,
    referrer: (payload.referrer || '').slice(0, 500) || null,
    ip: ip || null,
    user_agent: (payload.user_agent || '').slice(0, 500) || null,
  });
}

// create the sale row for a freshly-inserted order. Attribution prefers the
// ?ref= cookie (payload.ref_code); if that's empty, a manually-typed promo
// code that happens to be an affiliate's own referral_code counts too — a
// customer typing "ANNA10" at checkout is exactly as much a referral as
// clicking her link.
async function createSale(db, order, payload) {
  const code = String(payload.ref_code || payload.promo || '').trim();
  if (!code) return;
  const { data: aff } = await db.from('affiliates')
    .select('id, email, commission_pct, active').ilike('referral_code', code).maybeSingle();
  if (!aff || aff.active === false) return;           // unknown/inactive code → no attribution
  const base = round2(itemsSubtotal(payload) * (1 - await resolveDiscountRate(db, payload.promo)));
  const pct = Number(aff.commission_pct);
  const commission = round2(base * pct / 100);
  const selfRef = String(order.email || '').trim().toLowerCase() === String(aff.email || '').trim().toLowerCase();
  await db.from('sales').insert({
    order_ref: order.ref, order_no: order.order_no, referral_code: code,
    affiliate_id: aff.id, order_total: base, commission_pct: pct, commission,
    self_referral: selfRef,
    // self-referrals are recorded for transparency but excluded (never payable)
    status: selfRef ? 'cancelled' : 'pending',
  });
}

// confirm a pending sale (card paid, or COD delivered) → becomes payable
async function confirmSale(db, ref) {
  await db.from('sales')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('order_ref', ref).eq('status', 'pending');
}
// exclude a pending sale (order cancelled / COD refused)
async function cancelSale(db, ref) {
  await db.from('sales').update({ status: 'cancelled' }).eq('order_ref', ref).eq('status', 'pending');
}

// ---- PATCH /orders/:ref/delivered — COD confirmation trigger ----
async function markDelivered(db, ref) {
  const { data: order, error } = await db.from('orders')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('ref', ref).select().single();
  if (error) return { error: error.message, status: error.code === 'PGRST116' ? 404 : 500 };
  await confirmSale(db, ref).catch(() => {});          // release the COD commission
  return { ok: true, order };
}

// ---- GET /affiliate/payouts — confirmed, unpaid, non-self commissions ----
async function listPayouts(db) {
  const { data, error } = await db.from('sales')
    .select('id, order_ref, order_no, referral_code, commission, created_at, affiliate_id, affiliates(name,email,payout_method,payout_details)')
    .eq('status', 'confirmed').eq('payout_status', 'unpaid').eq('self_referral', false)
    .order('created_at', { ascending: true });
  if (error) return { error: error.message, status: 500 };
  return { ok: true, sales: data };
}
// ---- PATCH /affiliate/sales/:id/payout — mark a confirmed sale paid out ----
async function markPayout(db, id) {
  const { data, error } = await db.from('sales')
    .update({ payout_status: 'paid', paid_out_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'confirmed').select().single();
  if (error) return { error: error.message, status: error.code === 'PGRST116' ? 404 : 500 };
  return { ok: true, sale: data };
}

// ---- POST /affiliate/create — create an affiliate (+ optional login) ----
// This is the single control point for onboarding an influencer: it can create
// the Supabase Auth login (service_role admin API) AND the affiliates row that
// ties their name/email to a referral code + commission rate, in one step.
async function createAffiliate(db, body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.referral_code || '').trim();
  const pct = Number(body.commission_pct);
  // customer-facing discount this same code gives when typed at checkout —
  // independent of commission_pct (what the affiliate earns); 0 = no discount,
  // the code still works purely for tracking.
  const discountPct = body.discount_pct === undefined || body.discount_pct === '' ? 0 : Number(body.discount_pct);
  const password = String(body.password || '');
  if (!name || !email || !code || !(pct >= 0 && pct <= 100)) {
    return { error: 'name, email, referral_code and a commission_pct (0–100) are required', status: 400 };
  }
  if (!(discountPct >= 0 && discountPct <= 100)) {
    return { error: 'discount_pct must be between 0 and 100', status: 400 };
  }
  let userId = null;
  if (password) {
    // create the dashboard login; email_confirm so they can sign in immediately
    const { data: created, error: uerr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (uerr) return { error: 'login: ' + uerr.message, status: 400 };
    userId = created.user.id;
  }
  const { data, error } = await db.from('affiliates').insert({
    user_id: userId, name, email, referral_code: code, commission_pct: pct, discount_pct: discountPct,
    payout_method: body.payout_method || null, payout_details: body.payout_details || null,
  }).select().single();
  if (error) return { error: error.message, status: isUniqueViolation(error) ? 409 : 500 };
  return { ok: true, affiliate: data };
}

// ---- PATCH /affiliate/:id — edit an existing affiliate ----
// Only touches fields actually present in the body, so the admin panel can
// send just the changed ones. Does NOT touch the Supabase Auth login/password
// — that stays a separate concern (reset it directly in Supabase if needed).
async function updateAffiliate(db, id, body) {
  const fields = {};
  if (body.name !== undefined) fields.name = String(body.name).trim();
  if (body.email !== undefined) fields.email = String(body.email).trim().toLowerCase();
  if (body.referral_code !== undefined) fields.referral_code = String(body.referral_code).trim();
  if (body.commission_pct !== undefined) fields.commission_pct = Number(body.commission_pct);
  if (body.discount_pct !== undefined) fields.discount_pct = Number(body.discount_pct);
  if (body.payout_method !== undefined) fields.payout_method = body.payout_method || null;
  if (body.payout_details !== undefined) fields.payout_details = body.payout_details || null;
  if (body.active !== undefined) fields.active = !!body.active;

  if (!Object.keys(fields).length) return { error: 'nothing to update', status: 400 };
  if (fields.name !== undefined && !fields.name) return { error: 'name cannot be empty', status: 400 };
  if (fields.email !== undefined && !fields.email) return { error: 'email cannot be empty', status: 400 };
  if (fields.referral_code !== undefined && !fields.referral_code) return { error: 'referral_code cannot be empty', status: 400 };
  if (fields.commission_pct !== undefined && !(fields.commission_pct >= 0 && fields.commission_pct <= 100)) {
    return { error: 'commission_pct must be between 0 and 100', status: 400 };
  }
  if (fields.discount_pct !== undefined && !(fields.discount_pct >= 0 && fields.discount_pct <= 100)) {
    return { error: 'discount_pct must be between 0 and 100', status: 400 };
  }

  const { data, error } = await db.from('affiliates').update(fields).eq('id', id).select().single();
  if (error) return { error: error.message, status: isUniqueViolation(error) ? 409 : (error.code === 'PGRST116' ? 404 : 500) };
  return { ok: true, affiliate: data };
}

// ---- GET /affiliate/list — all affiliates + their aggregate stats ----
async function listAffiliates(db) {
  const { data: affs, error } = await db.from('affiliates').select('*').order('created_at', { ascending: true });
  if (error) return { error: error.message, status: 500 };
  const { data: clicks } = await db.from('clicks').select('affiliate_id');
  const { data: sales } = await db.from('sales').select('affiliate_id, status, commission, self_referral');
  const clickCount = {};
  (clicks || []).forEach(function (c) { if (c.affiliate_id) clickCount[c.affiliate_id] = (clickCount[c.affiliate_id] || 0) + 1; });
  const stat = {};
  (sales || []).forEach(function (s) {
    if (s.self_referral || !s.affiliate_id) return;
    const g = (stat[s.affiliate_id] = stat[s.affiliate_id] || { confirmed: 0, confirmed_sum: 0, pending_sum: 0 });
    if (s.status === 'confirmed') { g.confirmed++; g.confirmed_sum += Number(s.commission || 0); }
    else if (s.status === 'pending') { g.pending_sum += Number(s.commission || 0); }
  });
  const out = (affs || []).map(function (a) {
    const g = stat[a.id] || { confirmed: 0, confirmed_sum: 0, pending_sum: 0 };
    return Object.assign({}, a, {
      clicks: clickCount[a.id] || 0,
      confirmed_sales: g.confirmed,
      confirmed_commission: round2(g.confirmed_sum),
      pending_commission: round2(g.pending_sum),
    });
  });
  return { ok: true, affiliates: out };
}

// ---- thank-you email (localised) ----
function thankYouTemplate(o) {
  const items = (o.items || []).map((i) => `  ${i.qty}× ${i.name}`).join('\n');
  const T = {
    en: { s: `Payment received — order ${o.ref}`, b: `Hi ${o.name},\n\nThank you — we've received your payment for order ${o.order_no} (reference ${o.ref}).\n\n${items}\nTotal paid: ${o.total_text}\n\nWe're preparing your parcel now; it ships within 1 business day and you'll get a tracking link by email.\n\n— The TOP Pep team` },
    de: { s: `Zahlung erhalten — Bestellung ${o.ref}`, b: `Hallo ${o.name},\n\nvielen Dank — wir haben deine Zahlung für Bestellung ${o.order_no} (Referenz ${o.ref}) erhalten.\n\n${items}\nBezahlt: ${o.total_text}\n\nWir bereiten dein Paket vor; Versand innerhalb von 1 Werktag, den Tracking-Link bekommst du per E-Mail.\n\n— Dein TOP-Pep-Team` },
    ro: { s: `Plată primită — comanda ${o.ref}`, b: `Bună ${o.name},\n\nMulțumim — am primit plata pentru comanda ${o.order_no} (referință ${o.ref}).\n\n${items}\nTotal plătit: ${o.total_text}\n\nPregătim coletul; se expediază în 1 zi lucrătoare și vei primi linkul de urmărire pe e-mail.\n\n— Echipa TOP Pep` },
  };
  return T[o.lang] || T.en;
}

// generic sender (Resend) — used for the thank-you email and the admin 2FA code
async function sendEmail(env, { to, subject, text }) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

async function sendThankYouEmail(order, env) {
  const tpl = thankYouTemplate(order);
  await sendEmail(env, { to: order.email, subject: tpl.s, text: tpl.b });
  return tpl;
}

// ═══════════════════════════════════════════════════════════════
// ADMIN AUTH — Supabase email+password login, then a 6-digit code emailed
// to the admin as a second factor. Only emails listed in the `admins` table
// may ever pass. On success the client receives a short-lived, revocable
// "admin session" token (NOT the Supabase JWT) that every admin endpoint
// checks against the `admin_sessions` table — this replaces the old static
// ADMIN_TOKEN entirely.
// ═══════════════════════════════════════════════════════════════
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomCode() {
  // 6 digits, zero-padded — crypto.getRandomValues so it isn't Math.random-guessable
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1000000).padStart(6, '0');
}

// resolve the Supabase user behind a client-held access token (from
// signInWithPassword) — this only tells us WHO they are, not that they're an
// admin; isAdminEmail() below is the actual gate.
async function resolveSupabaseUser(db, accessToken) {
  if (!accessToken) return null;
  const { data, error } = await db.auth.getUser(accessToken);
  if (error || !data || !data.user) return null;
  return data.user.email;
}
async function isAdminEmail(db, email) {
  if (!email) return false;
  const { data } = await db.from('admins').select('email').eq('email', email.toLowerCase()).maybeSingle();
  return !!data;
}

// ---- POST /admin/login/request-code ----
// body: {} ; header: Authorization: Bearer <supabase access token from signInWithPassword>
async function requestAdminCode(env, db, accessToken) {
  const email = await resolveSupabaseUser(db, accessToken);
  if (!email || !(await isAdminEmail(db, email))) return { error: 'forbidden', status: 403 };
  const code = randomCode();
  const codeHash = await sha256Hex(code);
  await db.from('admin_mfa_codes').insert({
    email: email.toLowerCase(), code_hash: codeHash,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  await sendEmail(env, {
    to: email, subject: 'Your TOP Pep admin login code',
    text: `Your admin login code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
  });
  return { ok: true };
}

// ---- POST /admin/login/verify-code ----
// body: { code } ; header: Authorization: Bearer <supabase access token>
async function verifyAdminCode(db, accessToken, code) {
  const email = await resolveSupabaseUser(db, accessToken);
  if (!email || !(await isAdminEmail(db, email))) return { error: 'forbidden', status: 403 };
  const codeHash = await sha256Hex(String(code || '').trim());
  const { data: match } = await db.from('admin_mfa_codes').select('id')
    .eq('email', email.toLowerCase()).eq('code_hash', codeHash).eq('used', false)
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!match) return { error: 'invalid or expired code', status: 401 };
  await db.from('admin_mfa_codes').update({ used: true }).eq('id', match.id);

  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h admin session
  await db.from('admin_sessions').insert({ email: email.toLowerCase(), token_hash: tokenHash, expires_at: expiresAt });
  return { ok: true, token, expires_at: expiresAt };
}

// ---- POST /admin/logout ----
async function adminLogout(db, sessionToken) {
  if (!sessionToken) return { ok: true };
  const tokenHash = await sha256Hex(sessionToken);
  await db.from('admin_sessions').update({ revoked: true }).eq('token_hash', tokenHash);
  return { ok: true };
}

// gate for every admin-only route: validates the ADMIN SESSION token (issued
// by verifyAdminCode above) against admin_sessions — NOT the Supabase JWT.
async function requireAdminSession(db, request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const { data } = await db.from('admin_sessions').select('email, expires_at, revoked')
    .eq('token_hash', tokenHash).maybeSingle();
  if (!data || data.revoked || new Date(data.expires_at) < new Date()) return null;
  return data.email;
}

// ---- CORS ----
function corsHeaders(env) {
  const origin = env.ALLOWED_ORIGIN || 'https://top-pep.com';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(body, init, env) {
  return Response.json(body, {
    ...init,
    headers: { ...(init && init.headers), ...corsHeaders(env) },
  });
}

// ---- request router ----
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // Accept either naming convention for this secret — Supabase's own
    // dashboard calls it "service_role", so both `wrangler secret put
    // SUPABASE_SERVICE_KEY` and `...SUPABASE_SERVICE_ROLE_KEY` work.
    const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

    // Supabase is optional for the Stripe routes (card payments can run without
    // it, at the cost of DB-guaranteed unique refs + automatic paid/email).
    const db = (env.SUPABASE_URL && SUPABASE_SERVICE_KEY)
      ? createClient(env.SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
      : null;

    try {
      // ---- Stripe: card checkout + webhook (no Supabase required) ----
      if (request.method === 'POST' && url.pathname === '/stripe/payment-intent') {
        const body = await request.json();
        const res = await createPaymentIntent(env, db, body);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, { status: 201 }, env);
      }

      if (request.method === 'POST' && url.pathname === '/stripe/webhook') {
        const res = await handleStripeWebhook(env, db, request);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 400 }, env);
        return jsonResponse(res, {}, env);
      }

      // ---- affiliate: record a referred click (public) ----
      if (request.method === 'POST' && url.pathname === '/affiliate/click') {
        if (db) {
          const body = await request.json().catch(() => ({}));
          const ip = request.headers.get('CF-Connecting-IP') || null;
          await recordClick(db, body, ip).catch(() => {});
        }
        return jsonResponse({ ok: true }, {}, env); // always 200 — never leak which codes exist
      }

      // ---- checkout: validate a typed code (public) — static promo code OR
      // an affiliate's own referral_code used as a discount code ----
      if (request.method === 'POST' && url.pathname === '/promo/check') {
        const body = await request.json().catch(() => ({}));
        const rate = await resolveDiscountRate(db, body.code);
        return jsonResponse({ ok: true, valid: rate > 0, pct: Math.round(rate * 10000) / 100 }, {}, env);
      }

      // ---- admin login: Supabase password session -> emailed 6-digit code ----
      // step 1: browser already did sb.auth.signInWithPassword(); it sends us
      // that Supabase access token so we can check the admins table + email a code.
      if (request.method === 'POST' && url.pathname === '/admin/login/request-code') {
        if (!db) return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
        const authz = request.headers.get('authorization') || '';
        const accessToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
        const res = await requestAdminCode(env, db, accessToken);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }
      // step 2: the code from that email is submitted -> issues the admin session token
      if (request.method === 'POST' && url.pathname === '/admin/login/verify-code') {
        if (!db) return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
        const authz = request.headers.get('authorization') || '';
        const accessToken = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
        const body = await request.json().catch(() => ({}));
        const res = await verifyAdminCode(db, accessToken, body.code);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }
      if (request.method === 'POST' && url.pathname === '/admin/logout') {
        if (!db) return jsonResponse({ ok: true }, {}, env);
        const authz = request.headers.get('authorization') || '';
        const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
        const res = await adminLogout(db, token);
        return jsonResponse(res, {}, env);
      }

      // ---- affiliate: admin management (admin session) ----
      if (request.method === 'POST' && url.pathname === '/affiliate/create') {
        if (!db) return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const body = await request.json().catch(() => ({}));
        const res = await createAffiliate(db, body);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, { status: 201 }, env);
      }
      if (request.method === 'GET' && url.pathname === '/affiliate/list') {
        if (!db) return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const res = await listAffiliates(db);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }
      const affUpdateMatch = url.pathname.match(/^\/affiliate\/([0-9a-fA-F-]{36})$/);
      if (request.method === 'PATCH' && affUpdateMatch) {
        if (!db) return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const body = await request.json().catch(() => ({}));
        const res = await updateAffiliate(db, affUpdateMatch[1], body);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }

      // ---- affiliate: admin payout views (admin session) ----
      if (request.method === 'GET' && url.pathname === '/affiliate/payouts') {
        if (!db) return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const res = await listPayouts(db);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }
      const payoutMatch = url.pathname.match(/^\/affiliate\/sales\/(\d+)\/payout$/);
      if (request.method === 'PATCH' && payoutMatch) {
        if (!db) return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const res = await markPayout(db, payoutMatch[1]);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }

      // ---- order records (these, and only these, require Supabase) ----
      if (!/^\/orders(\/|$)/.test(url.pathname)) {
        return jsonResponse({ error: 'not found' }, { status: 404 }, env);
      }

      if (request.method === 'POST' && url.pathname === '/orders') {
        const body = await request.json();
        // Validate the cash-on-delivery rule (and address) BEFORE touching the
        // DB, so a hand-crafted COD request is rejected with 400 even if the
        // DB is unavailable — the server veto never depends on Supabase.
        const codError = validateCod(body);
        if (codError) return jsonResponse({ error: codError }, { status: 400 }, env);
        const addrError = validateAddress(pickOrderFields(body));
        if (addrError) return jsonResponse({ error: addrError }, { status: 400 }, env);
        if (!db) {
          return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
        }
        const res = await createOrder(db, body);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, { status: 201 }, env);
      }

      if (!db) {
        return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
      }

      const paidMatch = url.pathname.match(/^\/orders\/([^/]+)\/paid$/);
      if (request.method === 'PATCH' && paidMatch) {
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const res = await markPaid(db, paidMatch[1], env);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }

      const deliveredMatch = url.pathname.match(/^\/orders\/([^/]+)\/delivered$/);
      if (request.method === 'PATCH' && deliveredMatch) {
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const res = await markDelivered(db, deliveredMatch[1]);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }

      if (request.method === 'GET' && url.pathname === '/orders') {
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const status = url.searchParams.get('status') || undefined;
        const res = await listOrders(db, status);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }

      return jsonResponse({ error: 'not found' }, { status: 404 }, env);
    } catch (e) {
      return jsonResponse({ error: e.message }, { status: 500 }, env);
    }
  },
};
