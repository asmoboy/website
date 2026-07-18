/**
 * TOP Pep — Order API (Phase 2, Cloudflare Worker)
 * ----------------------------------
 * A single Worker that owns the order lifecycle against Supabase (Postgres):
 *
 *   POST   /orders              → create a pending order (DB unique ref)
 *   PATCH  /orders/:ref/paid    → mark paid + send the thank-you email
 *   GET    /orders?status=...   → admin list (protected by ADMIN_TOKEN)
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
 *   ADMIN_TOKEN            – bearer token that guards GET /orders + PATCH .../paid
 *   RESEND_API_KEY         – Resend API key for the thank-you email
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
const PROMO_CODES = { STIFI: 0.20 };
function promoRate(code) {
  const key = String(code || '').trim().toUpperCase();
  return PROMO_CODES[key] || 0;
}

function computeAmountCents(payload) {
  let items = (payload.items || []).reduce(function (n, i) {
    const qty = Math.max(1, parseInt(i.qty, 10) || 1);
    return n + toMinorUnits(i.price) * qty;
  }, 0);
  // percentage discount applies to the item subtotal only (not shipping)
  const rate = promoRate(payload.promo);
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
  const amount = computeAmountCents(payload);
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
  const { data: aff } = await db.from('affiliates').select('id, active').eq('referral_code', code).maybeSingle();
  if (!aff || aff.active === false) return;
  await db.from('clicks').insert({
    referral_code: code,
    affiliate_id: aff.id,
    referrer: (payload.referrer || '').slice(0, 500) || null,
    ip: ip || null,
    user_agent: (payload.user_agent || '').slice(0, 500) || null,
  });
}

// create the sale row for a freshly-inserted order (if it carried a ref code)
async function createSale(db, order, payload) {
  const code = String(payload.ref_code || '').trim();
  if (!code) return;
  const { data: aff } = await db.from('affiliates')
    .select('id, email, commission_pct, active').eq('referral_code', code).maybeSingle();
  if (!aff || aff.active === false) return;           // unknown/inactive code → no attribution
  const base = round2(itemsSubtotal(payload) * (1 - promoRate(payload.promo)));
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

async function sendThankYouEmail(order, env) {
  const tpl = thankYouTemplate(order);
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: order.email, subject: tpl.s, text: tpl.b }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
  return tpl;
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

    // Supabase is optional for the Stripe routes (card payments can run without
    // it, at the cost of DB-guaranteed unique refs + automatic paid/email).
    const db = (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY)
      ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
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

      // ---- affiliate: admin payout views (ADMIN_TOKEN) ----
      if (request.method === 'GET' && url.pathname === '/affiliate/payouts') {
        if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        if (!db) return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
        const res = await listPayouts(db);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }
      const payoutMatch = url.pathname.match(/^\/affiliate\/sales\/(\d+)\/payout$/);
      if (request.method === 'PATCH' && payoutMatch) {
        if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        if (!db) return jsonResponse({ error: 'server misconfigured: missing Supabase credentials' }, { status: 500 }, env);
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
        if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const res = await markPaid(db, paidMatch[1], env);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }

      const deliveredMatch = url.pathname.match(/^\/orders\/([^/]+)\/delivered$/);
      if (request.method === 'PATCH' && deliveredMatch) {
        if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
          return jsonResponse({ error: 'forbidden' }, { status: 403 }, env);
        }
        const res = await markDelivered(db, deliveredMatch[1]);
        if (res.error) return jsonResponse({ error: res.error }, { status: res.status || 500 }, env);
        return jsonResponse(res, {}, env);
      }

      if (request.method === 'GET' && url.pathname === '/orders') {
        if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
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
