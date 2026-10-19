import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizePhone(value: string) {
  const raw = value.replace(/[\s().-]/g, "");
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("00")) return "+" + raw.slice(2);
  if (/^0\d{10}$/.test(raw)) return "+234" + raw.slice(1);
  return raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Signup service is not configured." }, 500);

    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const identifier = String(body?.identifier ?? "").trim();
    const password = String(body?.password ?? "");
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (name.length < 2 || name.length > 60) return json({ error: "Panda name must be 2–60 characters." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    if (!identifier) return json({ error: "Enter your phone number or email." }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Public signup uses the service-role API so it can confirm phone/email immediately.
    // Apply an atomic per-IP fingerprint limit before creating any account.
    const clientIp = req.headers.get("cf-connecting-ip")
      || req.headers.get("x-real-ip")
      || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "unknown";
    const fingerprintBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientIp));
    const fingerprint = Array.from(new Uint8Array(fingerprintBytes))
      .map(byte => byte.toString(16).padStart(2, "0")).join("");
    const { data: signupAllowed, error: rateLimitError } = await admin.rpc("check_signup_rate_limit", {
      p_fingerprint: fingerprint,
    });
    if (rateLimitError) {
      console.error("signup rate limit check failed:", rateLimitError.message);
      return json({ error: "Account creation protection is temporarily unavailable. Please try again later." }, 503);
    }
    if (signupAllowed !== true) {
      return json({ error: "Too many account creation attempts from this connection. Please wait an hour and try again." }, 429);
    }

    const isEmail = identifier.includes("@");
    const userMetadata = { ...metadata, name, display_name: name, full_name: name };

    const result = isEmail
      ? await admin.auth.admin.createUser({
          email: identifier.toLowerCase(),
          password,
          email_confirm: true,
          user_metadata: userMetadata,
        })
      : await admin.auth.admin.createUser({
          phone: normalizePhone(identifier),
          password,
          phone_confirm: true,
          user_metadata: userMetadata,
        });

    if (result.error) {
      const msg = result.error.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return json({ error: "That phone number or email is already registered. Please log in instead." }, 409);
      }
      return json({ error: result.error.message }, 400);
    }

    if (!result.data.user) return json({ error: "Account creation did not return a user." }, 500);

    return json({
      ok: true,
      user_id: result.data.user.id,
      email: result.data.user.email ?? null,
      phone: result.data.user.phone ?? null,
    });
  } catch (error) {
    console.error("create-panda-account:", error);
    return json({ error: error instanceof Error ? error.message : "Could not create your Panda account." }, 500);
  }
});
