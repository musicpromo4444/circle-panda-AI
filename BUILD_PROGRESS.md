# Circle Panda rebuild — persistent completion tracker

Last verified: 2026-10-20 (UTC)  
Repository: `musicpromo4444/circle-panda-AI`  
Active Supabase project: `chcyncvieekjousgzlrg` — **Circle Panda Rebuilt**  
Production URL: https://circle-panda-ai.vercel.app  
Last verified production commit: `6311062e096c99574a23c50308e5b7c516f452db`

## Scope guard

Only work on the new `circle-panda-AI` repository and the `Circle Panda Rebuilt` Supabase project above. Do not merge or deploy the old SekuPanda/old Circle Panda UI or connect the inactive `nwmbbhuepbycbkjirqeg` project unless explicitly asked.

## Implemented in this build sequence

- Dating: profile cards, discovery, requests, free-period settings, per-message BC billing after the free window, mutual photo-reveal confirmations, request-to-chat integration, and participant-specific confirmation state.
- Events: categories, cover upload, keyword/category/location filters, monthly free Event Blast, paid BC blast tiers, and admin editing for blast reach/duration/prices.
- Groups: group details editing according to saved permissions, settings enforcement for member messaging, three-member gate for normal groups, no three-member gate for VIP rooms, group image/video/audio sharing, and view-once media UI with a short claim window.
- VIP enforcement: active expiry is checked in the UI, VIP-room entry, group membership, message reads/sends, and group-media access. Admin role remains a separate backend permission.
- Wallet: six database-backed BC package tiers, admin editing of coin amounts and NGN prices, secure Paystack initialization/webhook code, signed webhook validation, idempotent wallet crediting, and purchase-status handling.
- Authentication: phone OTP password recovery, Google/Apple sign-in entry points controlled by admin settings, and rate limiting on public account creation.
- Performance: country and state datasets load separately; the large city dataset is deferred until a user opens the area selector.
- Security migrations are applied to the active Supabase project and committed under `supabase/migrations/`.

## External provider setup (not safely inferable from source code)

- **Paystack:** configure `PAYSTACK_SECRET_KEY` in Supabase Edge Function secrets, set NGN package prices in Admin, and register the webhook URL documented in `docs/PAYMENTS_SETUP.md`. Do not expose the secret in frontend code.
- **Google/Apple:** configure provider client credentials and redirect URLs in Supabase Auth, then enable the corresponding `google_auth_enabled` / `apple_auth_enabled` settings in Admin.
- **Rewarded ads:** the reward UI must remain gated until an actual ad provider and its server-verifiable completion callback are configured. Never award BC based only on a button click.
- **Live acceptance test:** real multi-user request/accept/decline/chat, purchase/webhook, and media flows still need a dedicated pair of test accounts and configured external providers. A successful build alone is not proof of those live flows.

## Next work order

1. Confirm the latest source commit is deployed and the production alias points to it.
2. Finish provider setup and verify a Paystack test purchase end-to-end, including webhook replay/idempotency.
3. Configure rewarded ads and verify server-side reward completion.
4. Run the full request-to-DM matrix across Dating, Events, Groups and WCW/MCM using two test accounts.
5. Finish the remaining visual consistency and production regression pass.

Update this tracker as each vertical feature is implemented and tested so completed work is not re-listed as unfinished in later sessions.
