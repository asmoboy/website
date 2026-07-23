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

// Central sender for ALL Worker emails (order confirmation, admin login code,
// affiliate + customer password reset). Any address @top-pep.com works as long
// as the top-pep.com domain is verified in Resend.
const FROM = 'TOP Pep <office@top-pep.com>';

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

// ---- server-authoritative price catalog ----
// The single source of truth for what an item costs. Prices are looked up
// HERE by slug + option, never trusted from the client payload — so a tampered
// basket that claims price:0.01 is charged the real catalog price instead.
// MUST stay in sync with the `products` list in data.js (like IN_STOCK/SOLD_OUT).
// Keys: slug → { optionLabel: [EUR, RON] }; '' is the label for products
// without size options.
const CATALOG = {
  'tirzepatide': { '5 mg': [60, 313.99], '10 mg': [74.99, 392.99], '15 mg': [119.99, 627.99], '20 mg': [140, 732.99], '30 mg': [155, 811.99], '60 mg': [240, 1256.99] },
  'semaglutide': { '5 mg': [49.5, 259.19], '10 mg': [67.5, 353.69], '15 mg': [85.5, 447.29], '20 mg': [103.5, 541.79] }, // on-sale (−10%)
  'retatrutide': { '5 mg': [54.99, 287.99], '10 mg': [79.99, 418.99], '15 mg': [119.99, 627.99], '20 mg': [129.99, 680.99] },
  'ghk-cu': { '50 mg': [40.49, 212.39], '100 mg': [67.49, 353.69] }, // on-sale (−10%)
  'hgh-somatropin': { '15 IU': [99.99, 523.99], '24 IU': [149.99, 784.99] },
  'bacteriostatic-water': { '3 ml': [4.99, 25.99], '10 ml': [14.99, 77.99] },
  'cagrilintide': { '': [119.99, 627.99] },
  'hcg': { '': [69.99, 365.99] },
  'cjc-1295-no-dac': { '': [64.99, 339.99] },
  'cjc-1295-with-dac': { '': [149.99, 784.99] },
  'cjc-1295-ipamorelin': { '': [67.49, 353.69] }, // on-sale (−10%)
  'ipamorelin': { '': [67.49, 353.69] }, // on-sale (−10%)
  'tesamorelin': { '': [76.5, 400.49] }, // on-sale (−10%)
  'sermorelin': { '': [129.99, 680.99] },
  'igf1-lr3': { '': [89.99, 470.99] },
  'bpc-157': { '': [40.49, 212.39] }, // on-sale (−10%)
  'tb-500': { '': [44.99, 235.99] },
  'bpc-157-tb-500': { '': [79.99, 418.99] },
  'glow-blend': { '': [89.1, 466.19] }, // on-sale (−10%)
  'ss-31': { '': [55.99, 292.99] },
  'mots-c': { '': [64.99, 339.99] },
  'thymosin-alpha-1': { '': [159.99, 837.99] },
  'epitalon': { '': [64.99, 339.99] },
  'semax': { '': [39.99, 208.99] },
  'selank': { '': [39.99, 208.99] },
  'dsip': { '': [59.99, 313.99] },
  'nad-plus': { '': [74.99, 392.99] },
  'pt-141': { '': [69.99, 365.99] },
  'kpv': { '': [49.99, 261.99] },
  'mt-2': { '': [31.49, 164.69] }, // on-sale (−10%)
  'ghk-cu-serum': { '': [49.99, 261.99] },
};

// authoritative unit price for one basket line, or null if slug/option unknown
function unitPrice(slug, option, currency) {
  const p = CATALOG[String(slug || '').trim()];
  if (!p) return null;
  const key = String(option || '').trim();
  const entry = p[key] !== undefined ? p[key] : p[''];
  if (!entry) return null;
  return String(currency || 'eur').toLowerCase() === 'ron' ? entry[1] : entry[0];
}

// reject a basket that references an item we can't price (unknown slug/option) —
// so a hand-crafted payload can't smuggle in a made-up product.
function validatePricing(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return 'no items';
  for (const i of items) {
    if (unitPrice(i.slug, i.option, payload.currency) === null) {
      return 'unknown item in basket';
    }
  }
  return null;
}

async function computeAmountCents(db, payload) {
  let items = (payload.items || []).reduce(function (n, i) {
    const qty = Math.max(1, parseInt(i.qty, 10) || 1);
    // price comes from the server catalog, NEVER from i.price (client-supplied)
    return n + toMinorUnits(unitPrice(i.slug, i.option, payload.currency) || 0) * qty;
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
  const priceError = validatePricing(payload);
  if (priceError) return { error: priceError, status: 400 };
  const currency = (payload.currency || 'eur').toLowerCase();
  const amount = await computeAmountCents(db, payload);
  if (amount < 1) return { error: 'no items', status: 400 };

  let ref, orderNo;
  if (db) {
    const created = await createOrder(db, payload, env);
    if (created.error) return created;
    ref = created.order.ref;
    orderNo = created.order.order_no; // server-generated, never the client's
  } else {
    ref = payload.ref || genRef();
    orderNo = genOrderNo();
  }
  const lang = ['en', 'de', 'ro'].includes(base.lang) ? base.lang : 'en';

  const intent = await stripeApi(env, '/payment_intents', {
    amount,
    currency,
    // dashboard shows the bare order reference only (e.g. TOP-R28VXUQB)
    description: ref,
    receipt_email: clampText(base.email, 200),
    // Automatic payment methods (MUST match the front-end Payment Element).
    automatic_payment_methods: { enabled: true, allow_redirects: 'always' },
    metadata: { ref, order_no: orderNo || '', lang },
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

// server-generated order number — NEVER trust a client-supplied order_no (it is
// shown in the admin dashboard / emails and must not carry attacker content).
function genOrderNo() {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return 'TP' + (String(r[0]) + String(r[1])).replace(/\D/g, '').padStart(8, '0').slice(-8);
}

// trim + hard length cap for stored/emailed free-text fields
function clampText(s, max = 200) { return String(s == null ? '' : s).slice(0, max); }

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
async function createOrder(db, payload, env) {
  const base = pickOrderFields(payload);
  // items carry slug/option for the COD stock check — keep them on the record
  if (payload.items !== undefined) base.items = payload.items;
  if (!base.email || !base.name || base.total === undefined) {
    return { error: 'missing required fields', status: 400 };
  }
  // SECURITY: never store a client-supplied order_no, and hard-cap free-text
  // fields so a hand-crafted request can't inject content or bloat the DB.
  base.order_no = genOrderNo();
  base.email = clampText(base.email, 200);
  base.name = clampText(base.name, 200);
  if (base.org !== undefined) base.org = clampText(base.org, 200);
  if (base.address !== undefined) base.address = clampText(base.address, 200);
  if (base.city !== undefined) base.city = clampText(base.city, 120);
  if (base.zip !== undefined) base.zip = clampText(base.zip, 32);
  if (base.country !== undefined) base.country = clampText(base.country, 80);
  if (base.total_text !== undefined) base.total_text = clampText(base.total_text, 40);
  if (!['en', 'de', 'ro'].includes(base.lang)) base.lang = 'en';
  const addrError = validateAddress(base);
  if (addrError) return { error: addrError, status: 400 };
  // cash-on-delivery guard — server is authoritative (frontend checks aren't enough)
  const codError = validateCod(payload);
  if (codError) return { error: codError, status: 400 };
  // reject baskets referencing an item we can't price (server catalog is authoritative)
  const priceError = validatePricing(payload);
  if (priceError) return { error: priceError, status: 400 };
  // the claimed total must not undercut the server-computed catalog total —
  // blocks a tampered basket lowering the amount due for COD / bank transfer
  const srvTotal = await serverTotal(db, payload);
  if (Number(base.total) + 0.01 < srvTotal) {
    return { error: 'order total does not match catalog pricing', status: 400 };
  }

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
      // this basket is now an order → stop any abandoned-cart reminder
      await markCartConverted(db, data.email);
      // COD has no payment step, so the order itself is the commitment: email
      // the customer their confirmation now, and notify the seller. Card orders
      // are still "pending" here (unpaid) — those emails fire in markPaid.
      if (env && isCod) {
        const codTpl = await sendCodConfirmation(data, env).catch(() => null);
        if (codTpl) await logEmail(db, { email: data.email, order_ref: data.ref, kind: 'cod_confirmation', subject: codTpl.s });
        await sendSellerNotification(data, env).catch(() => {});
      }
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
  await markCartConverted(db, order.email);

  // notify the seller once the card order is actually paid (not on the earlier
  // "pending" insert) — never let a notification failure affect the response
  await sendSellerNotification(order, env).catch(() => {});

  try {
    const tpl = await sendThankYouEmail(order, env);
    await logEmail(db, { email: order.email, order_ref: order.ref, kind: 'confirmation', subject: tpl && tpl.s });
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
    // server catalog price, not the client-supplied i.price (see unitPrice)
    return n + (unitPrice(i.slug, i.option, payload.currency) || 0) * Math.max(1, parseInt(i.qty, 10) || 1);
  }, 0);
}

// server-authoritative order total: catalog item prices − server discount, plus
// the (additive-only) shipping/insurance. Used to reject a basket whose claimed
// total undercuts real pricing (protects COD / bank-transfer amounts, where no
// Stripe recompute happens).
async function serverTotal(db, payload) {
  let sub = itemsSubtotal(payload);
  const rate = await resolveDiscountRate(db, payload.promo);
  if (rate > 0) sub = sub * (1 - rate);
  let total = sub;
  if (Number(payload.shipping) > 0) total += Number(payload.shipping);
  if (Number(payload.insurance) > 0) total += Number(payload.insurance);
  return round2(total);
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

// ---- POST /affiliate/auth/reset — send a "set / reset password" email ----
// PUBLIC but gated: only emails that belong to a real, active affiliate ever
// get an email — everyone else gets the same generic {ok:true} so the endpoint
// can't be used to probe which emails exist. Handles BOTH first-time setup
// (affiliate created by the admin with no password yet → we create the Auth
// user, then send a set-password link) and normal "forgot password".
async function sendAffiliatePasswordSetup(env, db, email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return { ok: true };
  const { data: aff } = await db.from('affiliates')
    .select('id, user_id, active, name').ilike('email', clean).maybeSingle();
  if (!aff || aff.active === false) return { ok: true }; // never leak non-affiliates

  // ensure a Supabase Auth user exists for this email (recovery links need one)
  let userId = aff.user_id;
  if (!userId) {
    const cr = await db.auth.admin.createUser({
      email: clean, email_confirm: true, password: randomToken(16),
    }).catch(() => ({ error: true }));
    if (cr && cr.data && cr.data.user) {
      userId = cr.data.user.id;
      // Supabase query builder has no `.catch()` — wrap in try/catch instead.
      try { await db.from('affiliates').update({ user_id: userId }).eq('id', aff.id); } catch (e) { /* best-effort */ }
    }
    // if createUser failed because the user already exists, generateLink below
    // still works — it resolves the Auth user by email, not by our user_id.
  }

  const site = env.SITE_URL || 'https://www.top-pep.com';
  const { data: linkData, error: lErr } = await db.auth.admin.generateLink({
    type: 'recovery', email: clean, options: { redirectTo: site + '/affiliate/' },
  });
  if (lErr || !linkData || !linkData.properties) return { ok: true }; // stay generic on failure
  const actionLink = linkData.properties.action_link;
  await sendEmail(env, {
    to: clean,
    subject: 'Set your TOP Pep affiliate password',
    text: 'Hi' + (aff.name ? ' ' + aff.name : '') + ',\n\n' +
      'Use the link below to set (or reset) the password for your TOP Pep affiliate dashboard:\n\n' +
      actionLink + '\n\n' +
      'The link opens your dashboard and lets you choose a new password. If you didn\'t request this, just ignore this email.\n\n— The TOP Pep team',
  }).catch(() => {});
  return { ok: true };
}

// ---- POST /account/auth/reset — customer "forgot password" email ----
// Same idea as the affiliate reset, but for normal shop customers: we mint a
// Supabase recovery link (generateLink sends NO Supabase email of its own) and
// deliver it ourselves via Resend, so the mail comes from TOP Pep, not from
// Supabase's default sender. Always returns {ok:true} — never leaks whether an
// account exists (a non-existent user just makes generateLink error → generic ok).
async function sendCustomerPasswordReset(env, db, email, lang) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return { ok: true };
  const site = env.SITE_URL || 'https://www.top-pep.com';
  const { data, error } = await db.auth.admin.generateLink({
    type: 'recovery', email: clean, options: { redirectTo: site + '/account/' },
  }).catch(() => ({ error: true }));
  if (error || !data || !data.properties) return { ok: true };
  const link = data.properties.action_link;
  const T = {
    en: { s: 'Reset your TOP Pep password', b: 'Hi,\n\nUse the link below to reset the password for your TOP Pep account:\n\n' + link + '\n\nIf you didn\'t request this, just ignore this email.\n\n— The TOP Pep team' },
    de: { s: 'Passwort für dein TOP-Pep-Konto zurücksetzen', b: 'Hallo,\n\nüber den folgenden Link kannst du das Passwort für dein TOP-Pep-Konto neu setzen:\n\n' + link + '\n\nFalls du das nicht angefordert hast, ignoriere diese E-Mail einfach.\n\n— Dein TOP-Pep-Team' },
    ro: { s: 'Resetează parola contului TOP Pep', b: 'Bună,\n\nFolosește linkul de mai jos pentru a reseta parola contului tău TOP Pep:\n\n' + link + '\n\nDacă nu ai cerut acest lucru, ignoră acest e-mail.\n\n— Echipa TOP Pep' },
  };
  const tpl = T[lang] || T.en;
  await sendEmail(env, { to: clean, subject: tpl.s, text: tpl.b }).catch(() => {});
  return { ok: true };
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

// ───────────────────────────────────────────────────────────────
// Order-confirmation email (localised, branded HTML).
//   • Language is whatever the customer used at checkout (o.lang).
//   • A plain-text `b` version is always sent alongside the HTML so
//     clients that don't render HTML still show a readable message.
//   • To restyle the email, edit `orderEmailHtml()` below — it is the
//     single source of the design (colours, logo, layout).
// ───────────────────────────────────────────────────────────────
const BRAND = {
  accent: '#5E17EB',
  ink: '#111114',
  muted: '#6b6b76',
  line: '#ececef',
  bg: '#f4f4f6',
  site: 'https://www.top-pep.com',
  logo: 'https://www.top-pep.com/logo.png',
};

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function money(n, currency) {
  const v = Number(n || 0);
  return (String(currency || '').toUpperCase() === 'RON')
    ? v.toFixed(2).replace('.', ',') + ' lei'
    : v.toFixed(2) + ' €';
}

// build an absolute, URL-encoded product image URL for emails (items carry a
// site-relative path like "/Produktbilder/BPC-157 10mg.png")
function imageUrl(img) {
  if (!img) return '';
  if (/^https?:\/\//i.test(img)) return img;
  let p = String(img).startsWith('/') ? img : '/' + img;
  // swap the full-size product image for its small email-optimised JPEG
  // thumbnail (~12 KB vs ~900 KB) so emails load fast on mobile.
  const m = p.match(/^\/Produktbilder\/(.+)\.[^./]+$/i);
  if (m) p = '/Produktbilder/email/' + m[1] + '.jpg';
  return BRAND.site + p.split('/').map(encodeURIComponent).join('/');
}

// one item row: large product image on the left, name + line total on the right
function itemRowHtml(i, currency) {
  const line = (i.price != null) ? money(Number(i.price) * Number(i.qty || 1), currency) : '';
  const u = imageUrl(i.img);
  const imgCell = u
    ? `<td width="112" style="width:112px;vertical-align:middle;"><img src="${u}" alt="" width="112" height="112" style="width:112px;height:112px;border-radius:12px;border:1px solid ${BRAND.line};object-fit:cover;background:#fff;display:block;"></td>`
    : '';
  const pad = u ? 'padding-left:16px;' : '';
  return `<tr>
    <td style="padding:14px 0;border-bottom:1px solid ${BRAND.line};">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
        ${imgCell}
        <td style="vertical-align:middle;${pad}font-size:15px;color:${BRAND.ink};line-height:1.4;">
          <span style="color:${BRAND.muted};font-variant-numeric:tabular-nums;">${escHtml(i.qty)}×</span> ${escHtml(i.name)}
        </td>
      </tr></table>
    </td>
    <td style="padding:14px 0;border-bottom:1px solid ${BRAND.line};font-size:15px;color:${BRAND.ink};text-align:right;white-space:nowrap;vertical-align:middle;font-variant-numeric:tabular-nums;">${line}</td>
  </tr>`;
}

// per-language copy for the confirmation email
const ORDER_EMAIL_COPY = {
  en: {
    s: (o) => `Payment received — order ${o.ref}`,
    preheader: 'Payment received — your order is confirmed.',
    hi: (o) => `Hi ${o.name},`,
    intro: 'Thank you — your payment has been received and your order is confirmed.',
    order: 'Order', reference: 'Reference',
    item: 'Item', qty: 'Qty', amount: 'Amount',
    total: 'Total paid',
    ship: "We're preparing your parcel now — it ships within 1 business day and you'll get a tracking link by email.",
    help: 'Questions? Just reply to this email.',
    team: 'The TOP Pep team',
    legal: 'TOP Pep · Research use only — not for human or veterinary use.',
  },
  de: {
    s: (o) => `Zahlung erhalten — Bestellung ${o.ref}`,
    preheader: 'Zahlung erhalten — deine Bestellung ist bestätigt.',
    hi: (o) => `Hallo ${o.name},`,
    intro: 'Vielen Dank — deine Zahlung ist eingegangen und deine Bestellung ist bestätigt.',
    order: 'Bestellung', reference: 'Referenz',
    item: 'Artikel', qty: 'Menge', amount: 'Betrag',
    total: 'Bezahlt',
    ship: 'Wir bereiten dein Paket vor — Versand innerhalb von 1 Werktag, den Tracking-Link bekommst du per E-Mail.',
    help: 'Fragen? Antworte einfach auf diese E-Mail.',
    team: 'Dein TOP-Pep-Team',
    legal: 'TOP Pep · Nur zu Forschungszwecken — nicht zur Anwendung an Mensch oder Tier.',
  },
  ro: {
    s: (o) => `Plată primită — comanda ${o.ref}`,
    preheader: 'Plată primită — comanda ta este confirmată.',
    hi: (o) => `Bună ${o.name},`,
    intro: 'Mulțumim — plata a fost primită și comanda ta este confirmată.',
    order: 'Comanda', reference: 'Referință',
    item: 'Produs', qty: 'Cant.', amount: 'Sumă',
    total: 'Total plătit',
    ship: 'Pregătim coletul — se expediază în 1 zi lucrătoare și vei primi linkul de urmărire pe e-mail.',
    help: 'Întrebări? Răspunde direct la acest e-mail.',
    team: 'Echipa TOP Pep',
    legal: 'TOP Pep · Doar pentru cercetare — nu pentru uz uman sau veterinar.',
  },
};

function orderEmailHtml(o, L) {
  // i.name already carries the size/option (e.g. "BPC-157 · 10 mg") from the storefront.
  const rows = (o.items || []).map((i) => itemRowHtml(i, o.currency)).join('');

  return `<!DOCTYPE html>
<html lang="${escHtml(o.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escHtml(L.s(o))}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escHtml(L.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(17,17,20,.06);">
    <tr><td style="padding:28px 36px 8px;text-align:center;border-bottom:1px solid ${BRAND.line};">
      <a href="${BRAND.site}" style="text-decoration:none;"><img src="${BRAND.logo}" alt="TOP Pep" width="132" style="width:132px;height:auto;border:0;display:inline-block;"></a>
    </td></tr>
    <tr><td style="height:4px;background:${BRAND.accent};line-height:4px;font-size:0;">&nbsp;</td></tr>
    <tr><td style="padding:32px 36px 8px;">
      <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:${BRAND.ink};">${escHtml(L.hi(o))}</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:${BRAND.muted};">${escHtml(L.intro)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:12px;margin:0 0 24px;">
        <tr>
          <td style="padding:14px 18px;font-size:13px;color:${BRAND.muted};">${escHtml(L.order)}<br><span style="font-size:16px;color:${BRAND.ink};font-weight:600;">${escHtml(o.order_no)}</span></td>
          <td style="padding:14px 18px;font-size:13px;color:${BRAND.muted};text-align:right;">${escHtml(L.reference)}<br><span style="font-size:16px;color:${BRAND.ink};font-weight:600;">${escHtml(o.ref)}</span></td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.muted};">${escHtml(L.item)}</td>
          <td style="padding:0 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${BRAND.muted};text-align:right;">${escHtml(L.amount)}</td>
        </tr>
        ${rows}
        <tr>
          <td style="padding:16px 0 0;font-size:16px;font-weight:700;color:${BRAND.ink};">${escHtml(L.total)}</td>
          <td style="padding:16px 0 0;font-size:16px;font-weight:700;color:${BRAND.accent};text-align:right;white-space:nowrap;">${escHtml(o.total_text)}</td>
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:8px 36px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
        <tr><td style="padding:16px 18px;background:#f6f2ff;border-radius:12px;font-size:14px;line-height:1.55;color:${BRAND.ink};">${escHtml(L.ship)}</td></tr>
      </table>
      <p style="margin:22px 0 0;font-size:14px;line-height:1.55;color:${BRAND.muted};">${escHtml(L.help)}</p>
      <p style="margin:20px 0 0;font-size:15px;color:${BRAND.ink};">— ${escHtml(L.team)}</p>
    </td></tr>
    <tr><td style="padding:20px 36px;border-top:1px solid ${BRAND.line};text-align:center;">
      <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${escHtml(L.legal)}<br><a href="${BRAND.site}" style="color:${BRAND.muted};">top-pep.com</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

// per-language copy for a cash-on-delivery (Nachnahme) order — NOT paid yet,
// so the wording says "order received / pay on delivery", never "paid".
const ORDER_EMAIL_COPY_COD = {
  en: {
    s: (o) => `Order received — order ${o.ref}`,
    preheader: 'Order received — you pay the courier on delivery.',
    hi: (o) => `Hi ${o.name},`,
    intro: 'Thank you — we\'ve received your order. You\'ll pay in cash when the parcel is delivered.',
    order: 'Order', reference: 'Reference',
    item: 'Item', qty: 'Qty', amount: 'Amount',
    total: 'To pay on delivery',
    ship: "We're preparing your parcel now — it ships within 1 business day and you'll pay the courier on delivery. You'll get a tracking link by email.",
    help: 'Questions? Just reply to this email.',
    team: 'The TOP Pep team',
    legal: 'TOP Pep · Research use only — not for human or veterinary use.',
  },
  de: {
    s: (o) => `Bestellung erhalten — Bestellung ${o.ref}`,
    preheader: 'Bestellung erhalten — Zahlung bei Lieferung (Nachnahme).',
    hi: (o) => `Hallo ${o.name},`,
    intro: 'Vielen Dank — wir haben deine Bestellung erhalten. Bezahlt wird bar bei der Lieferung (Nachnahme).',
    order: 'Bestellung', reference: 'Referenz',
    item: 'Artikel', qty: 'Menge', amount: 'Betrag',
    total: 'Bei Lieferung zu zahlen',
    ship: 'Wir bereiten dein Paket vor — Versand innerhalb von 1 Werktag, bezahlt wird bei der Zustellung. Den Tracking-Link bekommst du per E-Mail.',
    help: 'Fragen? Antworte einfach auf diese E-Mail.',
    team: 'Dein TOP-Pep-Team',
    legal: 'TOP Pep · Nur zu Forschungszwecken — nicht zur Anwendung an Mensch oder Tier.',
  },
  ro: {
    s: (o) => `Comandă primită — comanda ${o.ref}`,
    preheader: 'Comandă primită — plătești la livrare (ramburs).',
    hi: (o) => `Bună ${o.name},`,
    intro: 'Mulțumim — am primit comanda ta. Plata se face în numerar la livrare (ramburs).',
    order: 'Comanda', reference: 'Referință',
    item: 'Produs', qty: 'Cant.', amount: 'Sumă',
    total: 'De plată la livrare',
    ship: 'Pregătim coletul — se expediază în 1 zi lucrătoare și plătești curierului la livrare. Vei primi linkul de urmărire pe e-mail.',
    help: 'Întrebări? Răspunde direct la acest e-mail.',
    team: 'Echipa TOP Pep',
    legal: 'TOP Pep · Doar pentru cercetare — nu pentru uz uman sau veterinar.',
  },
};

function buildOrderEmail(o, copy) {
  const L = copy[o.lang] || copy.en;
  const itemsText = (o.items || []).map((i) => `  ${i.qty}× ${i.name}`).join('\n');
  const b = `${L.hi(o)}\n\n${L.intro}\n\n${L.order}: ${o.order_no}   ${L.reference}: ${o.ref}\n\n${itemsText}\n${L.total}: ${o.total_text}\n\n${L.ship}\n\n— ${L.team}`;
  return { s: L.s(o), b, html: orderEmailHtml(o, L) };
}

function thankYouTemplate(o) { return buildOrderEmail(o, ORDER_EMAIL_COPY); }
function codTemplate(o) { return buildOrderEmail(o, ORDER_EMAIL_COPY_COD); }

// ---- seller notification (internal, German — one per real order) ----
function sellerNotifyTemplate(o) {
  const pm = o.payment_method === 'cod' ? 'Nachnahme (COD)'
    : o.payment_method === 'card' ? 'Karte (Stripe)'
    : (o.payment_method || '—');
  const items = (o.items || []).map((i) => `  ${i.qty}× ${i.name}`).join('\n');
  const addr = [o.name, o.org, o.address, [o.zip, o.city].filter(Boolean).join(' '), o.country]
    .filter(Boolean).join('\n');
  const s = `Neue Bestellung ${o.order_no} — ${pm}`;
  const b = `Neue Bestellung eingegangen.\n\nBestellung: ${o.order_no}\nReferenz: ${o.ref}\nZahlung: ${pm}\nStatus: ${o.status}\nSprache: ${o.lang || '—'}\n\nKunde:\n${addr}\nE-Mail: ${o.email}\n\nArtikel:\n${items}\nGesamt: ${o.total_text}`;
  return { s, b };
}

async function sendCodConfirmation(order, env) {
  const tpl = codTemplate(order);
  await sendEmail(env, { to: order.email, subject: tpl.s, text: tpl.b, html: tpl.html });
  return tpl;
}

async function sendSellerNotification(order, env) {
  const to = env.SELLER_NOTIFY_EMAIL || 'office@top-pep.com';
  const tpl = sellerNotifyTemplate(order);
  await sendEmail(env, { to, subject: tpl.s, text: tpl.b });
}

// ───────────────────────────────────────────────────────────────
// Action emails (abandoned cart, payment failed, shipped/tracking).
// Same branded shell as the order confirmation, but built around a single
// call-to-action button. Copy lives in the *_COPY dicts below, so restyling
// is one place. Language is always the customer's checkout language (o.lang).
// ───────────────────────────────────────────────────────────────
function ctaEmailHtml(o, L) {
  const rows = (L.showItems && (o.items || []).length)
    ? (o.items || []).map((i) => itemRowHtml(i, o.currency)).join('')
    : '';
  const itemsBlock = rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${rows}
        <tr><td style="padding:14px 0 0;font-size:16px;font-weight:700;color:${BRAND.ink};">${escHtml(L.totalLabel || '')}</td>
        <td style="padding:14px 0 0;font-size:16px;font-weight:700;color:${BRAND.accent};text-align:right;white-space:nowrap;">${escHtml(o.total_text || '')}</td></tr></table>` : '';
  const ctaUrl = typeof L.ctaUrl === 'function' ? L.ctaUrl(o) : L.ctaUrl;
  const noteBlock = L.note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
        <tr><td style="padding:16px 18px;background:#f6f2ff;border-radius:12px;font-size:14px;line-height:1.55;color:${BRAND.ink};">${escHtml(L.note)}</td></tr></table>` : '';

  return `<!DOCTYPE html>
<html lang="${escHtml(o.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escHtml(L.s(o))}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escHtml(L.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(17,17,20,.06);">
    <tr><td style="padding:28px 36px 8px;text-align:center;border-bottom:1px solid ${BRAND.line};">
      <a href="${BRAND.site}" style="text-decoration:none;"><img src="${BRAND.logo}" alt="TOP Pep" width="132" style="width:132px;height:auto;border:0;display:inline-block;"></a>
    </td></tr>
    <tr><td style="height:4px;background:${BRAND.accent};line-height:4px;font-size:0;">&nbsp;</td></tr>
    <tr><td style="padding:32px 36px 8px;">
      <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:${BRAND.ink};">${escHtml(L.hi(o))}</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:${BRAND.muted};">${escHtml(L.intro)}</p>
      ${itemsBlock}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;"><tr><td style="border-radius:12px;background:${BRAND.accent};">
        <a href="${ctaUrl}" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escHtml(L.cta)}</a>
      </td></tr></table>
      ${noteBlock}
    </td></tr>
    <tr><td style="padding:8px 36px 32px;">
      <p style="margin:14px 0 0;font-size:14px;line-height:1.55;color:${BRAND.muted};">${escHtml(L.help)}</p>
      <p style="margin:20px 0 0;font-size:15px;color:${BRAND.ink};">— ${escHtml(L.team)}</p>
    </td></tr>
    <tr><td style="padding:20px 36px;border-top:1px solid ${BRAND.line};text-align:center;">
      <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${escHtml(L.legal)}<br><a href="${BRAND.site}" style="color:${BRAND.muted};">top-pep.com</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

const LEGAL = {
  en: 'TOP Pep · Research use only — not for human or veterinary use.',
  de: 'TOP Pep · Nur zu Forschungszwecken — nicht zur Anwendung an Mensch oder Tier.',
  ro: 'TOP Pep · Doar pentru cercetare — nu pentru uz uman sau veterinar.',
};
const TEAM = { en: 'The TOP Pep team', de: 'Dein TOP-Pep-Team', ro: 'Echipa TOP Pep' };

// ---- abandoned cart ----
const CART_COPY = {
  en: { s: () => 'Your TOP Pep cart is waiting', preheader: 'You left items in your basket — finish your order.',
    hi: (o) => `Hi${o.name ? ' ' + o.name : ''},`, intro: 'You left these items in your basket. We saved them for you — pick up right where you left off.',
    showItems: true, totalLabel: 'Total', cta: 'Complete your order', ctaUrl: (o) => BRAND.site + '/checkout/' + (o && o.token ? '?restore=' + encodeURIComponent(o.token) : ''),
    note: 'Stock moves quickly — complete your order to make sure your items are reserved.', help: 'Questions? Just reply to this email.' },
  de: { s: () => 'Dein TOP-Pep-Warenkorb wartet', preheader: 'Du hast Artikel im Warenkorb — schließe deine Bestellung ab.',
    hi: (o) => `Hallo${o.name ? ' ' + o.name : ''},`, intro: 'Du hast diese Artikel in deinem Warenkorb gelassen. Wir haben sie für dich gespeichert — mach einfach dort weiter, wo du aufgehört hast.',
    showItems: true, totalLabel: 'Gesamt', cta: 'Bestellung abschließen', ctaUrl: (o) => BRAND.site + '/checkout/' + (o && o.token ? '?restore=' + encodeURIComponent(o.token) : ''),
    note: 'Der Bestand ist begrenzt — schließe deine Bestellung ab, damit deine Artikel reserviert bleiben.', help: 'Fragen? Antworte einfach auf diese E-Mail.' },
  ro: { s: () => 'Coșul tău TOP Pep te așteaptă', preheader: 'Ai produse în coș — finalizează comanda.',
    hi: (o) => `Bună${o.name ? ' ' + o.name : ''},`, intro: 'Ai lăsat aceste produse în coș. Le-am păstrat pentru tine — continuă de unde ai rămas.',
    showItems: true, totalLabel: 'Total', cta: 'Finalizează comanda', ctaUrl: (o) => BRAND.site + '/checkout/' + (o && o.token ? '?restore=' + encodeURIComponent(o.token) : ''),
    note: 'Stocul se mișcă repede — finalizează comanda ca produsele tale să rămână rezervate.', help: 'Întrebări? Răspunde direct la acest e-mail.' },
};

// ---- shipped / tracking ----
const SHIPPED_COPY = {
  en: { s: (o) => `Your order has shipped — ${o.order_no}`, preheader: 'Good news — your order is on its way.',
    hi: (o) => `Hi ${o.name},`, intro: (o) => `Good news — your order ${o.order_no} has shipped and is on its way to you.`,
    showItems: true, totalLabel: 'Total', cta: 'Track your parcel', ctaUrl: (o) => o.tracking_url || (BRAND.site),
    help: 'Questions about your delivery? Just reply to this email.' },
  de: { s: (o) => `Deine Bestellung ist unterwegs — ${o.order_no}`, preheader: 'Gute Nachrichten — deine Bestellung ist unterwegs.',
    hi: (o) => `Hallo ${o.name},`, intro: (o) => `Gute Nachrichten — deine Bestellung ${o.order_no} wurde versendet und ist auf dem Weg zu dir.`,
    showItems: true, totalLabel: 'Gesamt', cta: 'Sendung verfolgen', ctaUrl: (o) => o.tracking_url || (BRAND.site),
    help: 'Fragen zur Lieferung? Antworte einfach auf diese E-Mail.' },
  ro: { s: (o) => `Comanda ta a fost expediată — ${o.order_no}`, preheader: 'Vești bune — comanda ta este pe drum.',
    hi: (o) => `Bună ${o.name},`, intro: (o) => `Vești bune — comanda ta ${o.order_no} a fost expediată și este pe drum către tine.`,
    showItems: true, totalLabel: 'Total', cta: 'Urmărește coletul', ctaUrl: (o) => o.tracking_url || (BRAND.site),
    help: 'Întrebări despre livrare? Răspunde direct la acest e-mail.' },
};

function ctaTemplate(o, copy) {
  const base = copy[o.lang] || copy.en;
  // resolve function-or-string intro, and inject shared team/legal
  const L = Object.assign({}, base, {
    intro: typeof base.intro === 'function' ? base.intro(o) : base.intro,
    team: TEAM[o.lang] || TEAM.en,
    legal: LEGAL[o.lang] || LEGAL.en,
  });
  const itemsText = (L.showItems && (o.items || []).length)
    ? '\n' + (o.items || []).map((i) => `  ${i.qty}× ${i.name}`).join('\n') + (o.total_text ? `\n${L.totalLabel}: ${o.total_text}` : '') + '\n'
    : '';
  const ctaUrl = typeof L.ctaUrl === 'function' ? L.ctaUrl(o) : L.ctaUrl;
  const b = `${L.hi(o)}\n\n${L.intro}\n${itemsText}\n${L.cta}: ${ctaUrl}\n\n— ${L.team}`;
  return { s: L.s(o), b, html: ctaEmailHtml(o, L) };
}

async function sendCartReminder(cart, env) {
  const tpl = ctaTemplate(cart, CART_COPY);
  await sendEmail(env, { to: cart.email, subject: tpl.s, text: tpl.b, html: tpl.html });
  return tpl;
}

// ---- full orders dashboard: every order + which emails it received ----
async function listOrdersFull(db) {
  const { data: orders, error } = await db.from('orders').select('*')
    .order('created_at', { ascending: false }).limit(500);
  if (error) return { error: error.message, status: 500 };
  const { data: logs } = await db.from('email_log').select('*').order('created_at', { ascending: true });
  const byRef = {}, byEmail = {};
  (logs || []).forEach((l) => {
    const rec = { kind: l.kind, subject: l.subject, at: l.created_at };
    if (l.order_ref) (byRef[l.order_ref] = byRef[l.order_ref] || []).push(rec);
    else { const k = (l.email || '').toLowerCase(); (byEmail[k] = byEmail[k] || []).push(rec); }
  });
  const out = (orders || []).map((o) => Object.assign({}, o, {
    emails: (byRef[o.ref] || []).concat(byEmail[(o.email || '').toLowerCase()] || []),
  }));
  const { data: carts } = await db.from('carts').select('email,name,items,total_text,currency,lang,updated_at,reminded_at,converted')
    .eq('converted', false).order('updated_at', { ascending: false }).limit(200);
  return { ok: true, orders: out, carts: carts || [] };
}
async function sendShipped(order, env) {
  const tpl = ctaTemplate(order, SHIPPED_COPY);
  await sendEmail(env, { to: order.email, subject: tpl.s, text: tpl.b, html: tpl.html });
  return tpl;
}

// record one customer email so the orders dashboard can show what was sent
async function logEmail(db, { email, order_ref, kind, subject }) {
  if (!db || !email) return;
  // Supabase query builder has no `.catch()` — wrap in try/catch so a logging
  // failure never breaks the order flow (this runs between the two emails).
  try {
    await db.from('email_log').insert({
      email: String(email).toLowerCase(), order_ref: order_ref || null, kind, subject: subject || null,
    });
  } catch (e) { /* best-effort logging */ }
}

// ---- carts: upsert on checkout email, mark converted on order ----
async function saveCart(db, body) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) return { error: 'valid email required', status: 400 };
  if (!Array.isArray(body.items) || !body.items.length) return { error: 'no items', status: 400 };
  const first = body.first || '';
  const last = body.last || '';
  const row = {
    email,
    name: (first + ' ' + last).trim() || body.name || null,
    first: first || null, last: last || null,
    org: body.org || null, phone: body.phone || null,
    address: body.address || null, house: body.house || null,
    city: body.city || null, zip: body.zip || null, country: body.country || null,
    lang: body.lang || 'en',
    currency: body.currency || 'eur',
    items: body.items,
    total: body.total != null ? Number(body.total) : null,
    total_text: body.total_text || null,
    token: randomToken(16),   // fresh restore token → the reminder link uses it
    updated_at: new Date().toISOString(),
    reminded_at: null,     // a fresh basket → eligible for a new reminder
    converted: false,
  };
  const { error } = await db.from('carts').upsert(row, { onConflict: 'email' });
  if (error) return { error: error.message, status: 500 };
  return { ok: true };
}

// ---- GET /cart/restore?token= — return a saved basket + entered details ----
async function restoreCart(db, token) {
  if (!token) return { error: 'token required', status: 400 };
  const { data, error } = await db.from('carts').select('*').eq('token', token).maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { ok: false, status: 404 };
  return {
    ok: true,
    cart: {
      email: data.email, first: data.first, last: data.last, org: data.org, phone: data.phone,
      address: data.address, house: data.house, city: data.city, zip: data.zip, country: data.country,
      lang: data.lang, items: data.items || [],
    },
  };
}
async function markCartConverted(db, email) {
  if (!email) return;
  // NB: a Supabase query builder is a thenable but has no `.catch()` — calling
  // it throws "catch is not a function". Use a real try/catch so this stays
  // best-effort and never breaks the order (this runs before the emails).
  try {
    await db.from('carts').update({ converted: true }).eq('email', String(email).toLowerCase());
  } catch (e) { /* ignore — cart conversion is best-effort */ }
}

// ---- PATCH /orders/:ref/shipped — set tracking + email the customer ----
async function markShipped(db, ref, body, env) {
  const patch = { status: 'shipped', shipped_at: new Date().toISOString() };
  if (body && body.tracking_url) patch.tracking_url = String(body.tracking_url);
  if (body && body.carrier) patch.carrier = String(body.carrier);
  const { data: order, error } = await db.from('orders').update(patch).eq('ref', ref).select().single();
  if (error) return { error: error.message, status: error.code === 'PGRST116' ? 404 : 500 };
  try {
    const tpl = await sendShipped(order, env);
    await logEmail(db, { email: order.email, order_ref: order.ref, kind: 'shipped', subject: tpl && tpl.s });
  } catch (e) { return { ok: true, order, emailError: e.message }; }
  return { ok: true, order };
}

// ---- cron: send one reminder for baskets abandoned a few hours ago ----
async function processAbandonedCarts(env, db) {
  const HOURS = Number(env.CART_REMINDER_HOURS || 4);
  const cutoff = new Date(Date.now() - HOURS * 3600 * 1000).toISOString();
  const { data: carts, error } = await db.from('carts').select('*')
    .lt('updated_at', cutoff).is('reminded_at', null).eq('converted', false).limit(100);
  if (error || !carts) return;
  for (const c of carts) {
    if (!c.email || !(c.items || []).length) continue;
    try {
      const tpl = await sendCartReminder(c, env);
      await db.from('carts').update({ reminded_at: new Date().toISOString() }).eq('id', c.id);
      await logEmail(db, { email: c.email, order_ref: null, kind: 'cart_reminder', subject: tpl && tpl.s });
    } catch (e) { /* leave un-reminded so the next run retries */ }
  }
}

// ---- send every customer-facing template (sample data) to one address ----
async function sendTestEmails(env, to, lang) {
  const L = (lang && ['en', 'de', 'ro'].includes(lang)) ? lang : 'de';
  const order = {
    name: 'Test Customer', email: to, order_no: 'TP-TEST01', ref: 'TEST-1234', lang: L,
    currency: 'EUR', total_text: '94,98 €', payment_method: 'card', status: 'paid',
    org: '', address: 'Musterstr. 5', city: 'Berlin', zip: '10115', country: 'Germany',
    tracking_url: 'https://www.dhl.de/tracking?piececode=TEST123456',
    items: [
      { name: 'BPC-157 · 10 mg', qty: 2, price: 42, img: '/Produktbilder/BPC-157 10mg.png' },
      { name: 'Bacteriostatic Water · 10 ml', qty: 1, price: 4.99, img: '/Produktbilder/Bacteriostatic Water 10mg.png' },
    ],
  };
  const cart = { email: to, name: 'Test Customer', lang: L, currency: 'EUR', total_text: '94,98 €', items: order.items };
  const results = {};
  try { await sendThankYouEmail(order, env); results.confirmation = 'sent'; } catch (e) { results.confirmation = 'error: ' + e.message; }
  try { await sendCodConfirmation(Object.assign({}, order, { payment_method: 'cod', status: 'cod' }), env); results.cod_confirmation = 'sent'; } catch (e) { results.cod_confirmation = 'error: ' + e.message; }
  try { await sendShipped(order, env); results.shipped = 'sent'; } catch (e) { results.shipped = 'error: ' + e.message; }
  try { await sendCartReminder(cart, env); results.cart_reminder = 'sent'; } catch (e) { results.cart_reminder = 'error: ' + e.message; }
  return { ok: true, to, lang: L, results };
}

// generic sender (Resend) — used for the thank-you email and the admin 2FA code
async function sendEmail(env, { to, subject, text, html }) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const payload = { from: FROM, to, subject, text };
  if (html) payload.html = html;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

async function sendThankYouEmail(order, env) {
  const tpl = thankYouTemplate(order);
  await sendEmail(env, { to: order.email, subject: tpl.s, text: tpl.b, html: tpl.html });
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
// brute-force hardening for the emailed 2FA code (all server-side, no JS globals)
const MFA_MAX_ATTEMPTS = 5;        // wrong tries before a code is locked
const MFA_COOLDOWN_MS = 60 * 1000; // min gap between code requests per admin

async function requestAdminCode(env, db, accessToken) {
  const email = await resolveSupabaseUser(db, accessToken);
  if (!email || !(await isAdminEmail(db, email))) return { error: 'forbidden', status: 403 };
  const lc = email.toLowerCase();

  // cooldown — refuse if a code was already issued within MFA_COOLDOWN_MS
  // (checked against created_at in the DB, not an in-memory counter)
  const since = new Date(Date.now() - MFA_COOLDOWN_MS).toISOString();
  const { data: recent } = await db.from('admin_mfa_codes').select('id')
    .eq('email', lc).gt('created_at', since).limit(1).maybeSingle();
  if (recent) return { error: 'a code was just sent — please wait a moment', status: 429 };

  // exactly one active code per admin: invalidate any older unused ones
  await db.from('admin_mfa_codes').update({ used: true }).eq('email', lc).eq('used', false);

  const code = randomCode();
  const codeHash = await sha256Hex(code);
  await db.from('admin_mfa_codes').insert({
    email: lc, code_hash: codeHash, attempts: 0, locked: false,
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
  const lc = email.toLowerCase();
  // there is at most one active (unused, unlocked, unexpired) code per admin
  const { data: active } = await db.from('admin_mfa_codes')
    .select('id, code_hash, attempts')
    .eq('email', lc).eq('used', false).eq('locked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!active) return { error: 'invalid or expired code', status: 401 };

  const codeHash = await sha256Hex(String(code || '').trim());
  if (codeHash !== active.code_hash) {
    // wrong try → count it, and burn the code after MFA_MAX_ATTEMPTS
    const attempts = Number(active.attempts || 0) + 1;
    const patch = { attempts };
    if (attempts >= MFA_MAX_ATTEMPTS) patch.locked = true;
    await db.from('admin_mfa_codes').update(patch).eq('id', active.id);
    return { error: 'invalid or expired code', status: 401 };
  }
  await db.from('admin_mfa_codes').update({ used: true }).eq('id', active.id);

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

// ---- per-IP rate limiting (Cloudflare native binding) ----
// Returns true when the caller is OVER the limit. Fails OPEN (never blocks a
// real request) if the binding is missing or errors — the binding is defined
// in wrangler.toml ([[ratelimits]]).
async function overLimit(limiter, key) {
  if (!limiter || !key) return false;
  try { const { success } = await limiter.limit({ key }); return !success; }
  catch (e) { return false; }
}

// ---- Turnstile (Cloudflare bot protection) ----
// Fails OPEN: if TURNSTILE_SECRET is not configured the check is skipped, so the
// checkout keeps working until the user pastes their sitekey into data.js and
// sets the secret. Once the secret is set, a missing/invalid token is rejected.
async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // not configured → don't block
  // Fail OPEN on a missing token: never block a real customer whose widget
  // didn't hand back a token. Only a token that is PRESENT and fails
  // verification is treated as a bot. (Turnstile is effectively paused while
  // the frontend widget is disabled — re-enable by rendering it again.)
  if (!token) return true;
  try {
    const body = new URLSearchParams();
    body.append('secret', env.TURNSTILE_SECRET);
    body.append('response', String(token));
    if (ip) body.append('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await r.json();
    return !!(data && data.success);
  } catch (e) {
    return true; // verification unreachable → fail open, don't lock out real buyers
  }
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
  // Cloudflare Cron Trigger → send abandoned-cart reminders on a schedule.
  async scheduled(event, env, ctx) {
    const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    const db = (env.SUPABASE_URL && SUPABASE_SERVICE_KEY)
      ? createClient(env.SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
      : null;
    if (db) ctx.waitUntil(processAbandonedCarts(env, db));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateLimited = () => jsonResponse({ error: 'too many requests — please slow down' }, { status: 429 }, env);

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
        if (await overLimit(env.RL_ORDERS, clientIp)) return rateLimited();
        const body = await request.json();
        if (!(await verifyTurnstile(env, body && body.turnstile_token, clientIp)))
          return jsonResponse({ error: 'bot check failed — please reload and try again' }, { status: 403 }, env);
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
      if (request.method === 'POST' && url.pathname === '/cart/save') {
        if (await overLimit(env.RL_CART, clientIp)) return rateLimited();
        if (!db) return jsonResponse({ ok: true }, {}, env); // no DB → nothing to save, don't error the checkout
        const body = await request.json().catch(() => ({}));
        const res = await saveCart(db, body);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }

      if (request.method === 'GET' && url.pathname === '/cart/restore') {
        if (!db) return jsonResponse({ ok: false }, {}, env);
        const res = await restoreCart(db, url.searchParams.get('token'));
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, { status: res.ok ? 200 : 404 }, env);
      }

      if (request.method === 'POST' && url.pathname === '/promo/check') {
        const body = await request.json().catch(() => ({}));
        const rate = await resolveDiscountRate(db, body.code);
        return jsonResponse({ ok: true, valid: rate > 0, pct: Math.round(rate * 10000) / 100 }, {}, env);
      }

      // ---- affiliate: send a set/reset-password email (public, gated) ----
      if (request.method === 'POST' && url.pathname === '/affiliate/auth/reset') {
        if (await overLimit(env.RL_MAIL, clientIp)) return rateLimited();
        if (db) {
          const body = await request.json().catch(() => ({}));
          await sendAffiliatePasswordSetup(env, db, body.email).catch(() => {});
        }
        return jsonResponse({ ok: true }, {}, env); // always 200 — never leak which emails exist
      }

      // ---- customer: send a password-reset email (public, from TOP Pep via Resend) ----
      if (request.method === 'POST' && url.pathname === '/account/auth/reset') {
        if (await overLimit(env.RL_MAIL, clientIp)) return rateLimited();
        if (db) {
          const body = await request.json().catch(() => ({}));
          await sendCustomerPasswordReset(env, db, body.email, body.lang).catch(() => {});
        }
        return jsonResponse({ ok: true }, {}, env); // always 200 — never leak which emails exist
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
        if (await overLimit(env.RL_ORDERS, clientIp)) return rateLimited();
        const body = await request.json();
        if (!(await verifyTurnstile(env, body && body.turnstile_token, clientIp)))
          return jsonResponse({ error: 'bot check failed — please reload and try again' }, { status: 403 }, env);
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
        const res = await createOrder(db, body, env);
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

      const shippedMatch = url.pathname.match(/^\/orders\/([^/]+)\/shipped$/);
      if (request.method === 'PATCH' && shippedMatch) {
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const body = await request.json().catch(() => ({}));
        const res = await markShipped(db, shippedMatch[1], body, env);
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

      // NB: must live under /orders/* — the guard above 404s anything else.
      if (request.method === 'GET' && url.pathname === '/orders/full') {
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const res = await listOrdersFull(db);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }

      // admin-only: send every customer email template (sample data) to one address
      if (request.method === 'POST' && url.pathname === '/orders/test-email') {
        if (!(await requireAdminSession(db, request))) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const body = await request.json().catch(() => ({}));
        if (!body.to || !/.+@.+\..+/.test(body.to)) return jsonResponse({ error: 'valid "to" email required' }, { status: 400 }, env);
        const res = await sendTestEmails(env, body.to, body.lang);
        return jsonResponse(res, {}, env);
      }

      return jsonResponse({ error: 'not found' }, { status: 404 }, env);
    } catch (e) {
      return jsonResponse({ error: e.message }, { status: 500 }, env);
    }
  },
};
