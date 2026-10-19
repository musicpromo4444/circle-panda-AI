import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function toHex(bytes: Uint8Array) {
  return Array.from(bytes).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

async function verifyPaystackSignature(rawBody: string, secret: string, signature: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return constantTimeEqual(toHex(new Uint8Array(digest)), signature.trim().toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!url || !serviceKey || !paystackKey) return json({ error: "Webhook is not configured" }, 503);

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    if (!signature || !(await verifyPaystackSignature(rawBody, paystackKey, signature))) {
      return json({ error: "Invalid webhook signature" }, 401);
    }

    const event = JSON.parse(rawBody);
    const data = event?.data || {};
    const reference = String(data?.reference || "");
    if (!reference) return json({ received: true, ignored: "missing_reference" });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (event?.event === "charge.failed") {
      await admin.from("coin_purchase_orders")
        .update({ status: "failed" })
        .eq("paystack_reference", reference)
        .eq("status", "pending");
      return json({ received: true, status: "failed" });
    }

    if (event?.event !== "charge.success" || String(data?.status || "").toLowerCase() !== "success") {
      return json({ received: true, ignored: String(event?.event || "unknown") });
    }

    const amountMinor = Number(data?.amount);
    const currency = String(data?.currency || "");
    const transactionId = data?.id == null ? null : String(data.id);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || currency !== "NGN") {
      return json({ error: "Invalid payment amount or currency" }, 400);
    }

    const { data: credited, error } = await admin.rpc("complete_coin_purchase_secure", {
      p_reference: reference,
      p_amount_minor: amountMinor,
      p_currency: currency,
      p_gateway_transaction_id: transactionId,
    });
    if (error) {
      console.error("Paystack purchase completion failed", { reference, message: error.message });
      return json({ error: "Payment could not be reconciled yet" }, 500);
    }

    return json({ received: true, status: "processed", purchase: credited });
  } catch (error) {
    console.error("paystack-webhook:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Webhook processing failed" }, 500);
  }
});
