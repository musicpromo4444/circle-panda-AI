import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://circle-panda-ai.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Payment service is not configured." }, 503);
    if (!paystackKey) return json({ error: "Paystack is not configured yet. Add PAYSTACK_SECRET_KEY in Supabase Edge Function secrets before buying coins." }, 503);

    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Sign in before buying coins." }, 401);
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    const user = userResult.user;
    if (userError || !user) return json({ error: "Your session is invalid. Sign in again." }, 401);

    const body = await req.json();
    const packageId = String(body?.package_id ?? "").trim();
    if (!packageId) return json({ error: "Choose a coin package." }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: pack, error: packageError } = await admin
      .from("coin_packages")
      .select("id,name,coins,price_ngn,enabled")
      .eq("id", packageId)
      .eq("enabled", true)
      .maybeSingle();
    if (packageError) return json({ error: "Could not load this coin package." }, 500);
    if (!pack) return json({ error: "This coin package is not available." }, 404);
    const price = Number(pack.price_ngn);
    const coins = Number(pack.coins);
    if (!Number.isFinite(price) || price <= 0) return json({ error: "This package has no valid NGN price yet. Ask an administrator to configure it." }, 409);
    if (!Number.isSafeInteger(coins) || coins < 1) return json({ error: "This coin package is not configured correctly." }, 500);

    const customerEmail = user.email || (typeof user.user_metadata?.contact_email === "string" ? user.user_metadata.contact_email : "");
    if (!customerEmail || !customerEmail.includes("@")) return json({ error: "Add a contact email to your account before paying with Paystack." }, 422);

    const amountMinor = Math.round(price * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) return json({ error: "Package price must be at least ₦1.00." }, 400);
    const reference = "CP_" + crypto.randomUUID().replaceAll("-", "");
    const { error: orderError } = await admin.from("coin_purchase_orders").insert({
      user_id: user.id,
      package_id: pack.id,
      coins,
      amount_ngn: price,
      amount_minor: amountMinor,
      currency: "NGN",
      paystack_reference: reference,
      status: "pending",
    });
    if (orderError) return json({ error: "Could not create the secure purchase order." }, 500);

    const appUrl = (Deno.env.get("APP_SITE_URL") || "https://circle-panda-ai.vercel.app").replace(/\/$/, "");
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: customerEmail,
        amount: amountMinor,
        currency: "NGN",
        reference,
        callback_url: `${appUrl}/?payment=coin-purchase`,
        metadata: {
          user_id: user.id,
          package_id: pack.id,
          package_name: pack.name,
          coins,
        },
      }),
    });
    const payment = await paystackResponse.json().catch(() => null);
    if (!paystackResponse.ok || payment?.status !== true || !payment?.data?.authorization_url) {
      await admin.from("coin_purchase_orders").update({ status: "failed" }).eq("paystack_reference", reference).eq("status", "pending");
      console.error("Paystack initialization failed", { status: paystackResponse.status, reference });
      return json({ error: "Paystack could not start checkout. No coins have been added." }, 502);
    }

    return json({
      authorization_url: payment.data.authorization_url,
      reference,
      coins,
      amount_ngn: price,
      package_name: pack.name,
    });
  } catch (error) {
    console.error("initialize-coin-purchase:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Could not start coin checkout. Please try again." }, 500);
  }
});
