# Circle Panda rebuild — persistent completion tracker

Last verified: 2026-10-22 (UTC)
Repository: `musicpromo4444/circle-panda-AI`
Active Supabase project: `chcyncvieekjousgzlrg` — **Circle Panda Rebuilt**
Production URL: https://circle-panda-ai.vercel.app
Latest source change: `646a20bbecd22d921246fe3a64ad66d88409345f` (admin wallet/VIP group access fixes; Vercel deployment READY).

## Scope guard

Only work on the new `circle-panda-AI` repository and the `Circle Panda Rebuilt` Supabase project above. Do not merge or deploy the old SekuPanda/old Circle Panda UI or connect the inactive `nwmbbhuepbycbkjirqeg` project unless explicitly asked.

## Implemented in this build sequence

- Dating: profile cards, discovery, requests, free-period settings, per-message BC billing after the free window, mutual photo-reveal confirmations, request-to-chat integration, and participant-specific confirmation state.
- Events: categories, cover upload, keyword/category/location filters, monthly free Event Blast, paid BC blast tiers, and admin editing for blast reach/duration/prices.
- Groups: group details editing according to saved permissions, settings enforcement for member messaging, three-member gate for normal groups, no three-member gate for VIP rooms, group image/video/audio sharing, and view-once media UI with a short claim window.
- VIP enforcement: active expiry is checked in the UI, VIP-room entry, group membership, message reads/sends, and group-media access. Admin role remains a separate backend permission. Administrator account verified as admin and permanent VIP.
- Wallet: six database-backed BC package tiers, admin editing of coin amounts and NGN prices, secure Paystack initialization/webhook code, signed webhook validation, idempotent wallet crediting, and purchase-status handling.
- Authentication: phone OTP password recovery, Google/Apple sign-in entry points controlled by admin settings, and rate limiting on public account creation.
- Performance: country and state datasets load separately; the large city dataset is deferred until a user opens the area selector. Added an index for `coin_purchase_orders.package_id` to support package joins.
- Security migrations are applied to the active Supabase project and committed under `supabase/migrations/`.
- Added read-only RLS policies: storefront can read enabled coin packages with a valid positive NGN price; signed-in users can read only their own purchase orders. Signup rate-limit state remains inaccessible to client roles.

## External provider setup (not safely inferable from source code)

- **Paystack:** configure `PAYSTACK_SECRET_KEY` in Supabase Edge Function secrets, set NGN package prices in Admin, and register the webhook URL documented in `docs/PAYMENTS_SETUP.md`. Do not expose the secret in frontend code.
- **Google/Apple:** configure provider client credentials and redirect URLs in Supabase Auth, then enable the corresponding `google_auth_enabled` / `apple_auth_enabled` settings in Admin.
- **Rewarded ads:** the reward UI must remain gated until an actual ad provider and its server-verifiable completion callback are configured. Never award BC based only on a button click.
- **Live acceptance test:** real multi-user request/accept/decline/chat, purchase/webhook, and media flows still need a dedicated pair of test accounts and configured external providers. A successful build alone is not proof of those live flows.

## Latest code changes (2026-10-22)

- Admin wallet display now uses the requested `0 BC` unlimited sentinel in both the top header and Wallet view; the existing database message-charge trigger already bypasses BC deductions for accounts with the `admin` role, so this is not implemented as a fake huge balance.
- VIP group page now recognizes the authoritative `user_roles.role = 'admin'` permission as VIP access, even if the profile VIP flag is stale. The backend still validates room entry; verify admin can enter Worldwide and Country rooms in a signed-in browser session.
- GitHub commit `8c7c8ef8c1b803710d7ab784ae5abf85141ab12` had a Vercel type/build error; the follow-up cleanup commit `646a20bbecd22d921246fe3a64ad66d88409345f` is deployed as READY (`dpl_FpkpJWajLrwBudqNmQVBf3EJC7HS`). The earlier failed deployment is not the latest commit.
- Dedicated Profile page is now implemented: editable profile fields save to `profiles`; the header profile icon opens Profile; Buy Coin remains in Wallet only. The profile page shows account/VIP/admin status and the requested admin `0 BC` unlimited sentinel.
- Fixed the Profile section TypeScript route and verified production deployment `dpl_2f6eCZqmjqPZxvWwvow9K1x5ygAF` is **READY**, built from commit `238c4622cd8308046bb5490351cd6b90e97f3df2`, aliased to `https://circle-panda-ai.vercel.app`.
- The production build succeeds but reports a very large `city` chunk (~8 MB minified). Track bundle splitting as a performance task; it does not block this deployment.

## Current verified issues and next work order

- Supabase security advisor: one RLS-without-policy finding remains on `signup_rate_limits` (intentionally server-side); a warning remains for `get_public_auth_provider_settings()`, which is a SECURITY DEFINER function that returns only the two public booleans for Google/Apple sign-in availability. Review its exposure before changing permissions because signup needs these flags.
- Performance advisor reports 45 RLS policies that may re-evaluate auth expressions per row. Optimize these carefully in targeted migrations and preserve each policy's semantics.
- Verify admin can enter Worldwide and Country VIP rooms in an authenticated browser session and test the database `ensure_vip_group` / `join_chat_group` path. Admin bypass is present in `ensure_vip_group`; inspect `join_chat_group` for matching backend authorization.
- Finish provider setup and verify a Paystack test purchase end-to-end, including webhook replay/idempotency.
- Configure rewarded ads and verify server-side reward completion.
- Run the full request-to-DM matrix across Dating, Events, Groups and WCW/MCM using two test accounts.
- Finish the remaining visual consistency and production regression pass.

Update this tracker as each vertical feature is implemented and tested so completed work is not re-listed as unfinished in later sessions.


## VIP group authorization fix (2026-10-22)

- Inspected the active Supabase `join_chat_group(uuid)` function and found a backend mismatch: it checked only the raw profile VIP flag, ignored VIP expiry, and did not allow admins whose VIP access is derived from `user_roles`.
- Applied migration `fix_vip_group_join_admin_and_expiry` to the active Supabase project. The function now requires an unexpired VIP pass for non-admin VIP-room entry, recognizes the authoritative admin role, and permits admins through country restrictions while retaining those restrictions for regular members.
- Added the matching migration file to the new GitHub repo in commit `de4e29c879a435c482dd64b0b13ca8f5e890ac8a`. Need verify deployment/build for the new commit and run signed-in acceptance tests for admin and normal VIP/non-VIP users; SQL migration success alone does not prove browser flows.


## Group chat admin gate fix (2026-10-22)

- Inspected `open_group_chat(uuid)` and found the normal-group three-member gate used only the profile VIP flag. Admins with role-based privileges could therefore be blocked from opening a normal group with fewer than three members.
- Applied migration `admin_bypass_normal_group_member_gate` to active Supabase project `chcyncvieekjousgzlrg` and added matching migration `supabase/migrations/20261022121500_admin_bypass_normal_group_member_gate.sql`.
- Normal users still need three members to open a regular group; active VIP members and admins bypass that threshold. Closed-group and membership checks remain enforced.
- Still requires authenticated-browser regression testing; do not treat migration success as proof of the full user journey.


## Group message authorization fix (2026-10-22)

- A second audit found the `guard_group_chat_open()` message-insert trigger repeated the normal-group three-member check without considering role-based admin access. This could allow an admin to open a room but still block message sends when fewer than three members exist.
- Applied `admin_bypass_group_message_gate` to the active Supabase project and committed the matching migration `supabase/migrations/20261022123000_admin_bypass_group_message_gate.sql`.
- Normal-group three-member requirements remain for ordinary users. Closed-group checks, membership checks, VIP checks and group messaging settings remain enforced; platform admins are recognized for the group threshold and admin messaging permissions.
- End-to-end authenticated testing remains outstanding.

## Hot Seat stage alignment (2026-10-24)

- Updated `src/HotSeatFeature.tsx` in commit `51d485b0a07b292f0dcd4c54226085d1c3280b29`.
- Removed the extra floating giveaway shortcut so the right-side stage rail contains the five requested actions: host profile, reaction picker, gifts, questions, and next-seat bidding. Giveaway entry remains accessible through the feature's giveaway area.
- Changed the bottom preview label from “CHAT” to “COMMENTS” and removed the misleading “anonymously” comment placeholder because comments are stored with the signed-in user's ID.
- Confirmed the active Supabase project's Realtime publication includes Hot Seat sessions, comments, reactions, gift transactions, bids, questions, polls, giveaway entries, and follows.
- Production deployment for this commit was still building at the time of this checkpoint. Wait for READY and inspect build logs before calling the change verified.
