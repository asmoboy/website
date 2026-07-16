/**
 * Cloudflare Worker: Order API (v2 — angepasst an das echte Frontend-Order-Format)
 *
 * Routen:
 *   POST  /orders            -> Bestellung speichern, 2 Mails raus
 *   PATCH /orders/:ref/paid  -> Bestellung manuell als bezahlt markieren
 *
 * Erwartetes Body-Format (kommt so aus app.js / placeBankOrder):
 *   {
 *     ref, orderNo, status, createdAt, lang, currency,
 *     email, name, org, address, city, zip, country,
 *     items: [{ name, qty, price }],
 *     subtotal, shipping, insurance, total, totalText
 *   }
 */

const ALLOWED_ORIGIN = "https://www.top-pep.com";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function sendMail(env, { to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    console.error("Resend Fehler:", await res.text());
  }
}

function formatItems(items) {
  return items
    .map((i) => `<li>${i.qty}x ${i.name} — ${Number(i.price).toFixed(2)}</li>`)
    .join("");
}

async function handleCreateOrder(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Ungültiges JSON" }, 400);
  }

  const { ref, email, name, address, city, zip, country, items, total, totalText } = body;

  if (!ref || !email || !name || !Array.isArray(items) || items.length === 0 || total == null) {
    return json({ error: "Pflichtfelder fehlen (ref, email, name, items, total)" }, 400);
  }

  const totalCents = Math.round(Number(total) * 100);

  const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/orders`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      ref,
      customer_name: name,
      customer_email: email,
      items,
      total_cents: totalCents,
    }),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error("Supabase Insert Fehler:", errText);
    return json({ error: "Bestellung konnte nicht gespeichert werden" }, 500);
  }

  const [order] = await insertRes.json();

  const addressLine = [address, city, zip, country].filter(Boolean).join(", ");

  await sendMail(env, {
    to: email,
    subject: `Bestellbestätigung ${ref}`,
    html: `
      <p>Hallo ${name},</p>
      <p>danke für deine Bestellung! Deine Bestellnummer ist <strong>${ref}</strong>.</p>
      <ul>${formatItems(items)}</ul>
      <p><strong>Gesamt: ${totalText || Number(total).toFixed(2)}</strong></p>
      <p>Bitte überweise den Betrag mit dem Verwendungszweck <strong>${ref}</strong>
         an die dir bekannte IBAN. Sobald das Geld eingegangen ist, bearbeiten wir deine Bestellung.</p>
    `,
  });

  await sendMail(env, {
    to: env.OWNER_EMAIL,
    subject: `Neue Bestellung: ${ref}`,
    html: `
      <p>Neue Bestellung von ${name} (${email})</p>
      <p>Lieferadresse: ${addressLine}</p>
      <ul>${formatItems(items)}</ul>
      <p><strong>Gesamt: ${totalText || Number(total).toFixed(2)}</strong></p>
      <p>Status: received (noch nicht bezahlt / nicht geprüft)</p>
    `,
  });

  return json({ ref: order.ref, status: order.status }, 201);
}

async function handleMarkPaid(request, env, ref) {
  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${env.ADMIN_SECRET}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/orders?ref=eq.${encodeURIComponent(ref)}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "paid" }),
    }
  );

  if (!res.ok) {
    return json({ error: "Update fehlgeschlagen" }, 500);
  }

  const rows = await res.json();
  if (rows.length === 0) {
    return json({ error: "Bestellung nicht gefunden" }, 404);
  }

  return json({ ref, status: "paid" });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/orders") {
      return handleCreateOrder(request, env);
    }

    const paidMatch = url.pathname.match(/^\/orders\/([^/]+)\/paid$/);
    if (request.method === "PATCH" && paidMatch) {
      return handleMarkPaid(request, env, paidMatch[1]);
    }

    return json({ error: "Not found" }, 404);
  },
};
