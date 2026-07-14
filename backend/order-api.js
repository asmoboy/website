/**
 * TOP Pep — Order API (Phase 2 stub)
 * ----------------------------------
 * A single serverless endpoint (Cloudflare Worker / Supabase Edge Function /
 * Vercel function) that owns the order lifecycle:
 *
 *   POST   /orders              → create a pending order (DB unique ref)
 *   PATCH  /orders/:ref/paid    → mark paid + send the thank-you email
 *   GET    /orders?status=...   → admin list (protect with a token)
 *
 * The static site posts new orders here when data.js `ORDER_API_URL` is set.
 * Replace the TODOs with your DB client (e.g. Supabase) and email provider
 * (e.g. Resend / Postmark). Keep all secrets in environment variables —
 * never in the front-end.
 */

const BANK = {
  accountName: 'Petru Birgauan',
  iban: 'BE37 9050 9304 4528',
  bic: 'TRWIBEB1XXX',
  bank: 'Wise (TransferWise)',
};
const ADMIN_TOKEN = /* env */ 'CHANGE_ME';          // guards GET /orders + PATCH
const RESEND_API_KEY = /* env */ 'CHANGE_ME';       // email provider key
const FROM = 'TOP Pep <orders@top-pep.com>';

// ---- reference generator (matches the front-end) ----
function genRef() {
  const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  const r = crypto.getRandomValues(new Uint32Array(8));
  for (let i = 0; i < 8; i++) s += a[r[i] % a.length];
  return 'TOP-' + s;
}

// ---- POST /orders ----
async function createOrder(db, payload) {
  // Retry on the (astronomically unlikely) unique-constraint clash.
  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = payload.ref || genRef();
    try {
      // TODO: const row = await db.from('orders').insert({ ...payload, ref, status: 'pending' }).select().single();
      // return row;
      return { ok: true, ref };
    } catch (e) {
      if (isUniqueViolation(e)) { payload.ref = null; continue; } // clash → new ref
      throw e;
    }
  }
  throw new Error('could not allocate a unique reference');
}

// ---- PATCH /orders/:ref/paid ----
async function markPaid(db, ref) {
  // TODO: const order = await db.from('orders').update({ status: 'paid', paid_at: new Date() }).eq('ref', ref).select().single();
  const order = { ref, /* ...loaded from db... */ };
  await sendThankYouEmail(order);
  return order;
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

async function sendThankYouEmail(order) {
  const tpl = thankYouTemplate(order);
  // TODO: send via Resend / Postmark
  // await fetch('https://api.resend.com/emails', {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ from: FROM, to: order.email, subject: tpl.s, text: tpl.b }),
  // });
  return tpl;
}

function isUniqueViolation(e) { return e && (e.code === '23505' || /unique/i.test(String(e.message))); }

// ---- request router (Cloudflare Worker signature shown) ----
export default {
  async fetch(request /*, env */) {
    const url = new URL(request.url);
    const db = null; // TODO: init your DB client from env
    try {
      if (request.method === 'POST' && url.pathname === '/orders') {
        const body = await request.json();
        const res = await createOrder(db, body);
        return Response.json(res, { status: 201 });
      }
      const m = url.pathname.match(/^\/orders\/([^/]+)\/paid$/);
      if (request.method === 'PATCH' && m) {
        if (request.headers.get('authorization') !== `Bearer ${ADMIN_TOKEN}`) return new Response('forbidden', { status: 403 });
        const res = await markPaid(db, m[1]);
        return Response.json(res);
      }
      return new Response('not found', { status: 404 });
    } catch (e) {
      return new Response('error: ' + e.message, { status: 500 });
    }
  },
};
