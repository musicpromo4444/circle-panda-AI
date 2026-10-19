# Circle Panda payments setup

The BC purchase flow is implemented with server-side Paystack initialization and a signed webhook. Real payments remain disabled until the account owner configures provider credentials and package prices.

## Supabase Edge Function secrets

In Supabase Dashboard → Edge Functions → Secrets, configure:

- `PAYSTACK_SECRET_KEY`: start with the Paystack **test** secret key.
- `APP_SITE_URL`: `https://circle-panda-ai.vercel.app` (optional; the function uses this as its fallback).

Never put the Paystack secret in Vite environment variables, frontend code, GitHub, or a chat message.

## Paystack webhook

Set the webhook URL in Paystack to:

`https://chcyncvieekjousgzlrg.supabase.co/functions/v1/paystack-webhook`

Enable the `charge.success` and `charge.failed` events. The webhook verifies the `x-paystack-signature`, checks the amount and NGN currency against the saved order, and credits BC through an idempotent database function. A browser redirect alone never credits coins.

## Package pricing

The six coin bundles are stored in Supabase. Sign in with the Circle Panda admin account, open **Admin → BC coin packages**, and set each package's NGN price and enabled state. Packages with no price are intentionally unavailable for purchase.

## Safe test sequence

1. Configure a Paystack test secret and the webhook URL.
2. Set test package prices in the admin dashboard.
3. Purchase a small bundle with Paystack's test payment details.
4. Confirm the order is marked paid, one positive BC wallet transaction exists, and the balance increased once.
5. Replay the same webhook payload and confirm no second credit occurs.
6. Only after the test sequence passes, replace the test secret with the live secret and complete Paystack's live-account checks.
