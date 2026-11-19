// ═══════════════════════════════════════════════════════════════════
// Supabase Edge Function: bb-webhook
// Receives Real-Time Blackboard / Institutional Event Notifications
// (or instant Admin sync triggers) & verifies HMAC-SHA256 signature
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_SECRET = Deno.env.get("BB_WEBHOOK_SECRET")!;
const CRON_SECRET    = Deno.env.get("CRON_SECRET")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;

async function verifyHmacSha256(payload: string, signatureHex: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expectedHex = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  if (expectedHex.length !== signatureHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async req => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }

  const rawBody = await req.text();
  const sig = (req.headers.get("x-bb-signature") || "").replace(/^sha256=/, "");

  if (!WEBHOOK_SECRET || !sig || !(await verifyHmacSha256(rawBody, sig, WEBHOOK_SECRET))) {
    return new Response(JSON.stringify({ error: "Invalid webhook signature" }), { status: 401 });
  }

  // Trigger the bb-sync-worker immediately in the background
  const workerRes = await fetch(`${SUPABASE_URL}/functions/v1/bb-sync-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": CRON_SECRET
    },
    body: JSON.stringify({ trigger: "webhook", event: JSON.parse(rawBody || "{}") })
  });

  const data = await workerRes.json().catch(() => ({}));
  return new Response(JSON.stringify({ received: true, sync: data }), {
    status: workerRes.ok ? 200 : 502,
    headers: { "Content-Type": "application/json" }
  });
});
