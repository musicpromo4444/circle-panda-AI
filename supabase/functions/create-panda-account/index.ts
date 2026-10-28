import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set(
  (Deno.env.get("APP_ALLOWED_ORIGINS") || "https://circle-panda-ai.vercel.app,http://localhost:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
);

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin && allowedOrigins.has(origin);
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const json = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function normalizePhone(value: string) {
  const raw = value.replace(/[\s().-]/g, "");
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("00")) return "+" + raw.slice(2);
  if (/^0\d{10}$/.test(raw)) return "+234" + raw.slice(1);
  return raw;
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origin not allowed." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 16_384) return json({ error: "Request is too large." }, 413, cors);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Signup service is not configured." }, 500);

    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const identifier = String(body?.identifier ?? "").trim();
    const password = String(body?.password ?? "");
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (name.length < 2 || name.length > 60) return json({ error: "Panda name must be 2–60 characters." }, 400, cors);
    if (password.length < 8 || password.length > 128) return json({ error: "Password must be 8–128 characters." }, 400, cors);
    if (!identifier || identifier.length > 254) return json({ error: "Enter a valid phone number or email." }, 400, cors);
    const isEmail = identifier.includes("@");
    if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      return json({ error: "Enter a valid email address." }, 400, cors);
    }
    if (!isEmail) {
      const normalized = normalizePhone(identifier);
      if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
        return json({ error: "Enter a phone number with a valid country code, for example +2348012345678." }, 400, cors);
      }
    }
    const safeMetadata = {
      country: typeof metadata.country === "string" ? metadata.country.slice(0, 100) : undefined,
      contact_email: typeof metadata.contact_email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(metadata.contact_email)
        ? metadata.contact_email.slice(0, 254).toLowerCase() : undefined,
    };

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
      return json({ error: "Too many account creation attempts from this connection. Please wait an hour and try again." }, 429, cors);
    }

    const userMetadata = { ...safeMetadata, name, display_name: name, full_name: name };

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
        return json({ error: "That phone number or email is already registered. Please log in instead." }, 409, cors);
      }
      return json({ error: "Could not create the account. Check the details and try again." }, 400, cors);
    }

    if (!result.data.user) return json({ error: "Account creation did not return a user." }, 500, cors);

    return json({
      ok: true,
      user_id: result.data.user.id,
      email: result.data.user.email ?? null,
      phone: result.data.user.phone ?? null,
    }, 200, cors);
  } catch (error) {
    console.error("create-panda-account:", error);
    return json({ error: "Could not create your Panda account. Please try again." }, 500, cors);
  }
});
