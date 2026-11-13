# Circle Panda rebuild — persistent completion tracker

Last verified: 2026-11-12 (UTC)
Repository: `musicpromo4444/circle-panda-AI`
Active Supabase project: `chcyncvieekjousgzlrg` — **Circle Panda Rebuilt**
Production URL: https://circle-panda-ai.vercel.app
Latest application-code commit: `7ac1e47695d1674f607089abccfbbed52d37c3bf` (email/SMS signup verification); latest Vercel production deployment `dpl_3iq1neSQpiQgL1rrC78h4vGMaZZG` is READY and assigned to `circle-panda-ai.vercel.app` (source commit `5e3771f4f3f3297282453ec53eb75190f034c877`).
Latest applied migrations: `20261106092044_harden_public_client_role_privileges.sql`, `20261106092233_revoke_public_function_execute.sql`, and `20261106092801_add_notifications_to_realtime.sql`.

## Scope guard

Only work on the new `circle-panda-AI` repository and the `Circle Panda Rebuilt` Supabase project above. Do not merge or deploy the old SekuPanda/old Circle Panda UI or connect the inactive `nwmbbhuepbycbkjirqeg` project unless explicitly asked.

## Implemented in this build sequence

- Dating: profile cards, discovery, requests, free-period settings, per-message BC billing after the free window, mutual photo-reveal confirmations, request-to-chat integration, and participant-specific confirmation state.
- Events: categories, cover upload, keyword/category/location filters, monthly free Event Blast, paid BC blast tiers, and admin editing for blast reach/duration/prices.
- Groups: group details editing according to saved permissions, settings enforcement for member messaging, three-member gate for normal groups, no three-member gate for VIP rooms, group image/video/audio sharing, and view-once media UI with a short claim window.
- VIP enforcement: active expiry is checked in the UI, VIP-room entry, group membership, message reads/sends, and group-media access. Admin role remains a separate backend permission. Administrator account verified as admin and permanent VIP.
- Wallet: six database-backed BC package tiers, admin editing of coin amounts and NGN prices, secure Paystack initialization/webhook code, signed webhook validation, idempotent wallet crediting, and purchase-status handling.
- Authentication: phone OTP password recovery, Google/Apple sign-in entry points controlled by admin settings, and rate limiting on public account creation.
- Performance: country/state metadata and per-country city data load on demand; the former monolithic ~8 MB city chunk has been replaced with country-scoped chunks (see the 2026-11-06 audit below). Added an index for `coin_purchase_orders.package_id` to support package joins.
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

## Hot Seat reaction animation (2026-10-24)

- Added a live reaction overlay in `src/HotSeatFeature.tsx`: successful reaction toggles now emit the selected emoji into a short-lived floating animation; removing a reaction does not emit a new burst.
- Added responsive rise/fade keyframes in `src/styles.css`, with a reduced-motion fallback.
- Vercel build for the source commit `f5ec5ac5db95a6768b1e03d22071318380326de7` completed successfully and reached READY. The later CSS-only commit is queued for its own production build check.
- Existing build warning remains: the deferred city data chunk is approximately 8 MB minified. Track bundle splitting separately; it did not fail the build.

## Hot Seat action rail + admin moderation queue (2026-10-24)

- Hid the legacy duplicate four-button Hot Seat rail. The immersive stage now uses the requested five right-side actions only; the bottom comment bar remains in place. The CSS change reached READY in deployment `circle-panda-9ip9ip46k-replystagepro-6977.vercel.app`.
- Replaced the Admin Dashboard's moderation placeholder with a report queue for existing crush/profile and group-member reports. Admins can add internal notes, mark reports reviewed, or dismiss them.
- Applied Supabase migration `admin_moderation_review_queue_and_audit` to project `chcyncvieekjousgzlrg`. It adds RLS-protected review records and an audit log, plus admin-only RPCs that validate the actor and report before recording a review action. Direct client table access is revoked.
- Matching migration is tracked at `supabase/migrations/20261024150000_admin_moderation_review_queue_and_audit.sql`.
- The moderation UI TypeScript scope issue was fixed in commit `577162fcbe53a043a1e944a034d8513e6d51990f`, whose deployment reached READY. The latest source including the migration-file commit is still building; confirm READY before treating the current combined deployment as verified.
- Scope note: this is a report review/audit queue, not an automatic content-removal or account-suspension system. Those require separate protected moderation policies/actions and end-to-end testing.

## Hot Seat lifecycle controls and moderation audit display (2026-10-24)

- Fixed an important fullscreen-flow gap: the external host/stream controls were hidden by the immersive stage CSS. The Host action drawer now exposes Go Live / Start Hot Seat, Pause / Resume, End Hot Seat, and stream URL Save / Clear controls when the signed-in user is authorized.
- Hot Seat comments, questions, reactions, and gifts now explicitly require a live room or water break; the bottom comment composer is disabled when the room is offline or not interactive. Bid attempts now give a clear notice when no eligible round exists.
- Added an admin-only audit-history RPC and visible recent audit list in the Admin Dashboard. The database role check is enforced in the RPC; anonymous execution is revoked.
- Verified the owner account `circlepandaapp@gmail.com` currently has `user_roles.role='admin'` and permanent VIP access in the active new Circle Panda Supabase project.
- Production deployment for the host/stream controls reached READY at `https://circle-panda-ai.vercel.app`. Later audit-history UI styling is in its own deployment build and should be checked before considering that latest revision verified.

## Profile locations and admin-controlled login streak display (2026-10-24)

- Replaced free-text country/state/area fields on the Profile page with the shared searchable location selectors, keeping saved values in the existing profile fields.
- The seven-day login reward strip now reads the weekday amounts from `economy_settings` rather than showing hardcoded values. The actual credit remains calculated by the database's server-side daily-login reward function.
- Profile selector and styling changes reached READY at `https://circle-panda-ai.vercel.app`. Daily-login popup change reached READY in the deployment immediately before the profile selector commits.

## Feed post reporting and moderation review context (2026-10-24)

- Added a private Report action to feed/confession cards with reason selection and optional details. Reports are submitted through `report_feed_post_secure`; the backend rejects self-reports and duplicate reports.
- Added `feed_content_reports` with RLS enabled and direct client table access revoked. Extended the admin-only moderation queue and audit actions to include feed-post reports.
- The moderation queue now receives a limited content preview for reported feed posts so administrators can understand what was reported without opening unrestricted table access.
- Supabase migrations applied and tracked: `20261024160000_feed_post_reporting_and_moderation_queue.sql` and `20261024161000_admin_moderation_report_content_preview.sql`.
- The feed-report UI commit reached READY before the reported-content preview change; the latest preview/style and migration-file deployments are still building/queued and must reach READY before this full flow is verified.

## Hot Seat water-break accessibility and final moderation fixes (2026-10-24)

- Restored room activities, polls, and giveaways inside the fullscreen action drawer without adding a sixth floating icon. Viewers can reach the room activities from Questions; hosts can also open it from the Host drawer.
- Disabled the question and comment inputs when the room is offline or not interactive, so users no longer see enabled forms that silently do nothing.
- Feed post reporting now shows the selected post preview and keeps submission errors visible inside the modal. The report flow is backed by the private report table and admin-only queue/audit functions.
- Corrected an admin moderation mapping issue: crush reports reference a `crush_posts` row, so the queue now resolves the actual target profile through `crush_posts.user_id` and shows the caption preview instead of treating the crush-post ID as a user ID.
- Current app code reached READY at `https://circle-panda-ai.vercel.app` on commit `c6b13fd106fdbf7989d93e397a9bace2f983ae1e`. Production build still reports a large, lazily loaded city-data chunk (~8 MB minified); initial builds succeed, but location-selector bundle splitting remains a performance follow-up.


## 2026-11-06 launch-readiness continuation

### Provider and database evidence

- Confirmed the intended Supabase project is **Circle Panda Rebuilt**, ref `chcyncvieekjousgzlrg`, region `eu-west-1`, status `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.003`. No access to the old SekuPanda project was used.
- The live public schema contains 78 base tables; RLS is enabled on all 78, with zero public tables found with RLS disabled.
- Storage has four buckets and 14 storage policies: `dating-profile-photos` and `group-media` are private; `event-covers` and `crush-post-photos` are public.
- Twenty-one tables are in `supabase_realtime`.
- All three registered Edge Functions are ACTIVE: `create-panda-account` (JWT verification off by design for the custom signup endpoint, with strict origin allow-list, validation and IP-fingerprint rate limit), `initialize-coin-purchase` (JWT verification on), and `paystack-webhook` (Paystack HMAC-SHA512 signature verification).
- The owner account `circlepandaapp@gmail.com` is still confirmed as `admin` and permanent VIP (`is_vip=true`, `vip_expires_at=NULL`).
- Frontend RPC references in the main app, Hot Seat, Crush, Daily Activities, campaign admin, global action slot and VIP call controls were compared with the live database: every referenced RPC exists. The audited table references also resolve to live tables/views or the named storage buckets.
- The Paystack completion RPC is executable by `service_role` only, not `anon` or `authenticated`. It locks the purchase row, checks the amount/currency, and returns an `already_credited` result for a replay after the order is paid. The internal ad-reward RPC is not executable by client roles; the public claim wrapper rejects `ad_reward` unless trusted verification is implemented.

### Migration reconciliation — no unsafe replay

- The live ledger contains 148 applied migration entries. The repository currently contains 72 SQL migration files, with 69 exact-name file matches. Three committed files have no exact ledger-name match: `group_chat_replies_reactions`, `add_dating_searcher_experience`, and `daily_activities_weekday_rewards`; the corresponding live effects were checked and are already present (group message reply/reaction schema, dating searcher experience, and five daily-activity tables).
- Seventy-nine applied ledger entries have no matching committed file, and one migration name stem is duplicated in the repository. These are historical source-control/reproducibility gaps, not permission to replay the SQL. No migration was applied in this run because no unapplied schema change was verified. Reconstruct or baseline the missing historical migration source before relying on this repository to recreate the database from scratch.

### Implementation and performance changes

- Replaced the all-countries `country-state-city` city dataset with `countrycitystatejson/client` (pinned to `26.09.2802`), which loads city data per selected country. Updated both `LocationFields.tsx` and Dating's country/state validation in `App.tsx`.
- Previous production build emitted an 8,065.11 KB city chunk (2,188.44 KB gzip). The new build emits country-scoped chunks instead; Nigeria is 27.63 KB, the largest observed country chunks are India 278.99 KB and the US 271.97 KB, and the metadata/client chunk is deferred at 303.40 KB. No monolithic 8 MB city chunk remains.
- Lazy-loaded the Crush, Hot Seat, Daily Activities, daily campaign admin and VIP call-control panels. The main JS chunk fell from 526.92 KB (145.73 KB gzip) to 426.07 KB (121.45 KB gzip), about a 19% reduction. The latest Vite build no longer emits the >500 KB chunk warning.
- GitHub Actions build run [#646](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42187638796) passed on commit `4c7b9043ed7e54866a4e59c5558e2565cf12927c`. The latest Vercel production deployment for that commit is **READY** and has no alias error.
- Vercel confirms `circle-panda-ai.vercel.app` is a verified project domain, is present on the production deployment alias list, and has no production password protection (SSO is limited to preview deployments). Aggregated runtime errors for the last 24 hours returned none; the last 30-minute warning/error log query also returned none. Direct external HTTP rendering and device-level smoke tests were not completed in this run.

### Remaining launch blockers and owner actions

- All six coin packages are enabled but currently have `price_ngn=NULL`. The purchase Edge Function correctly rejects these with HTTP 409; there are no purchase orders. The owner must set the intended NGN prices in the admin dashboard before payment can be tested.
- The Paystack secret must be present only in Supabase Edge Function secrets. The webhook URL is `https://chcyncvieekjousgzlrg.supabase.co/functions/v1/paystack-webhook`; the Paystack dashboard must subscribe to `charge.success` and `charge.failed`. Secret presence and a real signed webhook were not testable through the available control-plane metadata.
- Google and Apple auth toggles are both off in the database. The owner must configure provider credentials and redirect URLs in Supabase Auth, test them, then enable the toggles.
- Supabase Auth's leaked-password protection remains disabled according to the security advisor; the owner must enable it.
- No rewarded-ad provider or verifiable completion callback is configured. BC ad payouts remain disabled; do not enable them until server-side completion verification exists.
- Two-account authenticated journeys, real Paystack success/failure/replay, OAuth, ad callback, and Android/desktop browser smoke tests have not been performed. A READY build and zero observed runtime errors do not prove those flows pass.
- Current Supabase advisor findings: four internal RLS-enabled tables intentionally have no direct client policies; one public SECURITY DEFINER getter exposes only Google/Apple enabled booleans; 138 authenticated-callable SECURITY DEFINER functions remain on the advisor review list. All 138 were checked for a pinned empty search_path; the five without `auth.uid()` are read-only public getters, and no mutating function without caller identity was found in the broad scan. Admin-prefixed functions have admin-role guard patterns. Continue targeted authorization tests before launch.
- Performance advisor currently reports seven multiple-permissive SELECT-policy overlaps and 101 unused-index notices. Do not merge write policies or drop indexes without traffic and semantics review. Health advisor returned no findings.

Do not mark Circle Panda 100% complete until the owner configuration items and authenticated/device acceptance tests above have passing evidence.


### Additional server-side Crush vote correction — 2026-11-06

- Found that free and paid weekly WCW/MCM vote paths used different week boundaries: the free vote implementation used the voter's saved timezone, while the quota wrapper and paid-vote path counted against the database/server week. The paid path also did not reject a nominee from a previous local week.
- Applied and committed migration `20261106083427_fix_crush_vote_timezone_and_concurrency.sql` to the active rebuild project.
- Free and paid votes now use the same validated profile timezone and local Monday-week window, reject stale-week nominees, and share a per-user transaction advisory lock so parallel free/paid requests cannot race past the three-free-vote limit.
- Free votes now award the configured vote XP as well; paid extra votes retain the configured BC charge and the existing already-voted no-double-charge response. The authenticated grants and pinned empty search_path were verified unchanged after migration.
- The ad-funded extra-vote path remains unavailable until a server-verifiable ad callback exists. Authenticated two-account voting and concurrency tests still need to be run; SQL definition/ACL verification is not a substitute for those tests.


### Additional monthly Event Blast correction — 2026-11-06

- The free Event Blast status and claim functions previously measured the monthly window using the database/server timezone. Both now use the user's validated profile timezone, with UTC fallback, so the eligibility display and server-side claim share the same local calendar month.
- The existing entitlement is preserved: one free blast per calendar month, 100 unique reach for standard accounts and 500 for active VIP accounts. A namespaced per-user transaction advisory lock prevents two simultaneous claims from consuming the monthly allowance twice.
- Applied migration `20261106084052_fix_event_blast_monthly_timezone.sql`. Both functions retain authenticated-only execution and an empty pinned search_path. The database definitions and grants were verified after application; a two-account/month-boundary E2E test remains outstanding.

### Core product-rule snapshot checked in the live database

- Welcome bonus: 200 BC; first activity reward: 2 BC.
- Direct-message sender cost: 1 BC; dating free window: 72 hours; post-window dating message cost: 1 BC.
- WCW/MCM: three free votes per local week, then 50 BC per extra vote. The ad-funded alternative remains disabled pending verifiable ad completion.
- The database trigger schedules MCM for Monday 10:00 AM and WCW for Wednesday 10:00 AM in the profile timezone. The November 6 vote migration aligns free and paid vote quotas to that same local week and serializes concurrent claims.
- Normal groups retain the three-member activation gate; VIP groups do not require three members, and the admin role has the expected group-access bypass.


## 2026-11-06 continued production audit

### Safe wallet UI correction

- The wallet previously displayed a fixed “Get 100 Free BC” ad CTA and exposed the configured ad reward amount/cooldown in the user-facing rules, even though no rewarded-ad provider or verifiable completion callback exists.
- Updated the wallet CTA to **Rewarded ads paused** and the user-facing economy tiles to **Paused / Provider required**. The existing click handler already returned a pause notice without crediting coins; this change removes the misleading advertised payout. Commit: `25c76cc7d09262ca61e1b51d1bfaded032006aee`.
- Confirmed the live public reward wrapper rejects `ad_reward`; the internal reward RPC is executable only by `service_role`, not `anon` or `authenticated`. Keep ad payouts disabled until trusted server-side completion verification is implemented.

### Fresh Supabase control-plane and database verification

- Project `chcyncvieekjousgzlrg` (“Circle Panda Rebuilt”, `eu-west-1`) is `ACTIVE_HEALTHY`; a harmless SQL connectivity check succeeded on PostgreSQL 17.11.
- All 78 public base tables have RLS enabled; none were found with RLS disabled. There are 104 public RLS policies. The only anonymous policy is read-only access to enabled, priced coin packages; there are no anonymous write policies. All exposed public views inspected use `security_invoker=true`.
- Four internal tables (`admin_audit_log`, `feed_content_reports`, `moderation_reviews`, `signup_rate_limits`) intentionally have RLS enabled without direct client policies; access is through guarded backend/RPC flows.
- Storage has four buckets and 14 policies: dating photos and group media are private; event covers and crush-post photos are public. The `supabase_realtime` publication contains 21 tables.
- All three Edge Functions are ACTIVE: `create-panda-account` (JWT verification off for public signup; server-side validation/rate limit), `initialize-coin-purchase` (JWT required), and `paystack-webhook` (JWT off; Paystack HMAC-SHA512 verification in code).
- Owner account `circlepandaapp@gmail.com` is still `admin` and permanent VIP (`is_vip=true`, `vip_expires_at=NULL`).
- Database scan found 158 SECURITY DEFINER functions; 138 are executable by authenticated users and one read-only provider-settings getter is executable by anon. All callable SECURITY DEFINER functions have a pinned `search_path`. The five callable functions without `auth.uid()` are read-only public getters/catalogue functions. The 138 authenticated-callable warnings still require targeted authorization tests; they are not treated as automatically safe.
- Security Advisor currently reports four RLS-enabled/no-policy internal tables, one anonymous SECURITY DEFINER getter, 138 authenticated-callable SECURITY DEFINER functions, and leaked-password protection disabled. Performance Advisor reports seven multiple-permissive-policy warnings and 101 unused-index informational notices. Health Advisor returned no findings.

### Migration ledger source restoration — resolved in this run

- The live `supabase_migrations.schema_migrations` table stores the original SQL in `statements`. Verified all 148 ledger rows have unique versions and one non-empty statement each (477,831 SQL characters total).
- Reviewed the recovered SQL before committing it: no literal Paystack/Supabase secret or private-key patterns, and no destructive DDL (`DROP TABLE`, `DROP SCHEMA`, `TRUNCATE`, `ALTER TABLE ... DROP COLUMN`, or `DROP TYPE`) was found. The 16 `DELETE FROM` matches are inside application RPC logic, not migration-time table wipes.
- Reconstructed all 148 canonical migration files using the exact applied ledger `version`, `name`, and stored SQL. The previous 72 repository migration files were preserved under `supabase/archive/legacy-migration-source/` with a README explaining that they are provenance-only and must not be replayed.
- Verified the canonical directory now has exactly 148 files for 148 applied ledger versions: zero missing versions, zero extra versions, and zero duplicate versions. No database migration was applied during this source restoration.
- This resolves the repository/ledger filename and source gap for the current live database. A fresh-project bootstrap should still be tested on an isolated Supabase branch before using the recovered history to provision a new production project.

### Latest CI and production deployment

- Latest GitHub Actions run [#42191875751](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42191875751) passed on the migration-restoration/documentation commit: checkout, Node setup, `npm install`, and `npm run build` all succeeded. The repository currently has no unit/E2E test script.
- Latest Vercel production deployment `dpl_46azmi1UHLYSzTvcwJ3n843AySWA` for commit `6afa8480488811af6bdf4df43f40f5506d7f6f1e` is **READY**, with `circle-panda-ai.vercel.app` assigned as an alias and no alias error. The project domain is verified; production password protection is off and SSO protection applies only to previews.
- Vercel project environment metadata contains only the public client variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; no secret values were decrypted. Paystack/OAuth credentials must remain server-side.
- Runtime error aggregation returned no errors for the last 24 hours, and the last 30-minute production warning/error log query returned no entries. The deployment alias is verified in Vercel's control plane, but a direct external HTTP/browser request was not completed in this run.

### Remaining owner actions and uncompleted tests

- All six enabled coin packages still have `price_ngn=NULL`; there are zero purchase orders. Configure the six NGN prices in the admin dashboard, set `PAYSTACK_SECRET_KEY` only in Supabase Edge Function secrets, configure the webhook URL and `charge.success`/`charge.failed` events, then run signed success/failure/replay tests. Secret presence and a real Paystack webhook have not been verified.
- Google and Apple auth flags remain off. Configure provider credentials and redirect URLs in Supabase Auth, test both providers, then enable the admin toggles.
- Supabase organization plan is confirmed as **Free**. Leaked-password protection is disabled and the official guide says it is available on Pro plan and above; enabling it therefore requires an owner-approved plan upgrade before the Auth setting can be enabled. No plan change was made: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
- No rewarded-ad provider or signed completion callback is configured. Do not enable BC ad payouts.
- Authenticated two-account tests (auth, feed/confessions/reports/moderation, requests/DM, wallet, dating, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications, admin) and Android/desktop browser/media/refresh smoke tests remain unperformed because no dedicated test-account credentials or interactive browser session were available. CI/build success and zero observed runtime errors do not prove these flows pass.
- Do not mark Circle Panda 100% complete until owner configuration and all critical authenticated/device acceptance tests have passing evidence.


## Latest continuation — 2026-11-06 (database hardening, notifications, release gate)

### Verified project and migration state

- Rechecked the exact target Supabase project before work: `chcyncvieekjousgzlrg`, **Circle Panda Rebuilt**, `eu-west-1`, PostgreSQL 17.11, state `ACTIVE_HEALTHY`; SQL connectivity remained available.
- Reconciled the live migration ledger against the repository tree after the changes: **152 applied migrations and 152 exact-version SQL files**, with no missing, extra or duplicate versions. The three new applied versions are `20261106092044_harden_public_client_role_privileges`, `20261106092233_revoke_public_function_execute`, and `20261106092801_add_notifications_to_realtime`. Do not replay or bulk-apply the historical migration set.
- The owner account `circlepandaapp@gmail.com` remains `user_roles.role='admin'`, permanent VIP, and `vip_expires_at=NULL`.

### Database security and service checks

- All **78/78 public base tables** have RLS enabled; 104 public policies exist. No public table is missing RLS. Four RLS-enabled internal tables intentionally have no direct client policies: `admin_audit_log`, `feed_content_reports`, `moderation_reviews`, and `signup_rate_limits`.
- Storage: four buckets and 14 policies. Crush photos and event covers are public-read buckets; dating-profile photos and group media remain private with owner, mutual-match, group-membership, active-VIP and view-once checks. All nine public views use `security_invoker=true`.
- Realtime publication now contains **22 tables**, including `notifications`.
- All three Edge Functions remain ACTIVE: `create-panda-account` (v7, JWT verification disabled for public signup), `initialize-coin-purchase` (v2, JWT verification enabled), and `paystack-webhook` (v2, JWT verification disabled for the signed server webhook).
- Re-ran Supabase advisors: four INFO RLS/no-policy findings for the internal tables above; one WARN for the deliberately public, read-only `get_public_auth_provider_settings()`; 138 authenticated-callable SECURITY DEFINER functions remain in the advisor review queue. Five callable getters do not reference `auth.uid()`; they are read-only catalogue/feed/settings functions. All 138 authenticated-callable definer functions reference caller identity or an explicit admin guard; admin-prefixed definer functions reviewed all contain an admin-role check. Every SECURITY DEFINER function has a pinned search_path. Twenty-six Hot Seat/admin functions pin `public` (some also `pg_temp`) but use schema-qualified application objects; the rest pin an empty path. No function retains EXECUTE for the PostgreSQL `PUBLIC` pseudo-role.
- Found and fixed an over-broad client privilege default: anonymous clients previously inherited table/sequence/function privileges that RLS alone cannot safely constrain for operations such as TRUNCATE. The applied migrations now leave `anon` with only SELECT on `public.coin_packages`, no anonymous sequence privileges, and explicit EXECUTE only on the public provider-availability getter. All PUBLIC function EXECUTE grants were revoked. `authenticated` retains the DML required by RLS-protected app flows but no longer has TRUNCATE, MAINTAIN, REFERENCES or TRIGGER privileges on public tables. The current migration-owner (`postgres`) default ACL is hardened for future app objects. All 88 current public objects are owned by `postgres`. Supabase-managed `supabase_admin` default ACLs remain broad and could not be changed by the migration role; no current public objects are owned by that role, so future platform-managed objects in `public` should be reviewed if any are introduced.
- Performance advisor: seven reviewed SELECT-policy overlaps and 101 unused-index INFO notices remain. Do not merge policies or drop indexes without workload evidence. Health advisor returned no findings.

### Application changes in this run

- Replaced the inert notification toast with a real per-user notification inbox: latest 30 rows, exact unread count, mark-one-read, mark-all-read, error/retry state, and routing to the related app section. The unread badge now updates from a user-filtered Supabase Realtime INSERT subscription; `notifications` was added to the Realtime publication. Database RLS limits reads/updates to the notification owner.
- Clarified the daily activity popup: ad-funded rewards now explicitly say they are paused until trusted ad playback is verified. The server-side reward wrapper rejects direct ad claims, the internal payout RPC is service-role-only, and ad-only activity start/completion paths reject unverified playback. No rewarded BC payout was enabled.
- Static source-to-schema audit checked 20 TypeScript source files: all literal frontend RPC names, table/view references and storage bucket references resolve in the live database. Dynamic Hot Seat/admin RPC references were also present.
- Reviewed core transaction paths: message trigger enforces 1 BC per non-VIP DM and the dating free window; dating match RPCs enforce participant confirmation; group-message trigger enforces normal-group activation and active-VIP gates; Event Blast free monthly claims use the user's local timezone; WCW/MCM paid voting is server-side; Paystack crediting locks the order and is idempotent. These are code/database reviews, not two-account acceptance tests.

### Build and deployment evidence

- GitHub Actions run [#42195661828](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42195661828) passed checkout, Node setup, `npm install`, and `npm run build` for commit `f8e9ef33d68dfb8f1add406971e5d0c1da44bc29`.
- Latest Vercel production deployment `dpl_8ce9tEzHPyJWtPFTfaB65Jvb5f23` for the same commit is **READY**. The `circle-panda-ai.vercel.app` domain is verified, assigned as a production alias, has no alias error, and has no production password protection; SSO protection is limited to previews.
- Vercel returned no production warning/error logs in the latest 30-minute query and no runtime errors in the latest 24-hour aggregation. The Vercel control plane confirms alias assignment, but direct external HTTP/browser rendering was not completed.

### Remaining owner actions and release gates

- All six enabled BC coin packages still have `price_ngn=NULL`; there are zero purchase orders. Owner must set prices, configure `PAYSTACK_SECRET_KEY` only in Supabase Edge Function secrets, register the documented webhook URL and `charge.success`/`charge.failed` events, and run signed success/failure/replay tests. The available control plane does not expose Edge Function secret-presence metadata, so secret presence and a real webhook remain unverified. Vercel contains only the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` variables; their values were not decrypted.
- Google and Apple Auth flags remain false. Owner must configure provider credentials and redirect URLs in Supabase Auth and test each provider before enabling the admin toggles.
- Supabase organization plan is **Free**. Leaked-password protection remains disabled; the owner must approve the Pro-or-higher plan upgrade and enable the Auth setting.
- No rewarded-ad provider or server-verifiable completion callback is configured. Keep BC ad payouts disabled.
- No dedicated two-account test credentials or interactive browser session are available in this run. Authentication, feed/confession/report/moderation, requests/DM, BC wallet, Paystack, dating 72-hour/1-BC, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications and admin flows still need two-account acceptance testing. Android/desktop responsive, media, refresh-persistence, console and network smoke tests also remain open.
- CI currently runs a production build only; it has no unit/E2E suite. Do not mark the rebuild 100% complete until the owner actions and critical acceptance tests pass with evidence.


## Latest continuation — 2026-11-07 (anonymous-confession RPC privacy hardening)

### Supabase state and migration reconciliation
- Started by checking the exact target project: `chcyncvieekjousgzlrg`, **Circle Panda Rebuilt**, region `eu-west-1`, status `ACTIVE_HEALTHY`; read-only SQL connectivity succeeded.
- Reconciled the live migration ledger against committed `supabase/migrations/`: **153 applied migrations = 153 repository SQL files**, with no missing versions, extra files, duplicate versions or version/name mismatches. No historical migration was replayed.
- Applied and committed `20261107082130_revoke_legacy_confession_author_exposure.sql`.

### Security defect found and fixed
- The legacy `public.get_public_confessions(integer)` SECURITY DEFINER RPC returned `author_id` for anonymous confession rows. The current React app does not call this RPC; it reads `feed_posts_public`, a `security_invoker=true` view that omits author IDs and returns a null author name for anonymous posts.
- Revoked `EXECUTE` on the legacy RPC from `authenticated`. Verified `has_function_privilege` is false for both `authenticated` and `anon`. The public feed's existing view and app behavior were not changed.
- Latest security advisor now reports 137 authenticated-callable SECURITY DEFINER functions (down from 138), one intentionally public read-only auth-provider availability getter, and four INFO notices for RLS-enabled internal tables with no direct client policies.
- Current SECURITY DEFINER inventory: 158 functions; all 158 have a pinned `search_path`; 137 are callable by authenticated clients; one read-only getter is callable by anon; zero retain EXECUTE for PostgreSQL PUBLIC. The four authenticated-callable definer functions without `auth.uid()` are read-only getters for coin packages, event-blast plans, auth-provider availability and WCW/MCM current-week data. All authenticated-callable `admin_*` definer functions inspected contain an admin-role guard.
- Rechecked client table privileges: no public-table anonymous INSERT/UPDATE/DELETE privileges and no authenticated TRUNCATE/MAINTAIN/TRIGGER/REFERENCES privileges. Anonymous sequence usage found only on Supabase's `realtime.subscription_id_seq`, not in `public`.
- 78/78 public base tables have RLS enabled. Four storage buckets have 14 storage policies; dating photos and group media are private, while crush-post photos and event covers are public. Realtime publishes 22 tables, including `notifications`.
- All three Edge Functions are ACTIVE: `create-panda-account` (JWT verification off for the guarded public signup flow), `initialize-coin-purchase` (JWT verification on), and `paystack-webhook` (JWT verification off; handler validates Paystack HMAC-SHA512). No secret values were read or changed.
- Owner `circlepandaapp@gmail.com` remains `user_roles.role='admin'`, permanent VIP, `is_vip=true`, `vip_expires_at=NULL`; credentials were not changed.
- Performance advisor: seven reviewed multiple-permissive SELECT-policy warnings and 101 unused-index INFO notices remain. Health advisor returned no findings. Unused indexes/policy overlaps were not changed without workload evidence.

### App, build and deployment evidence
- Reviewed the current confession feed call sites: the app reads `feed_posts_public` and does not call the revoked legacy RPC. No visual/product behavior was changed.
- Rechecked sponsored activity safety: UI keeps ad-only activities at “Setup required”; `claim_economy_reward('ad_reward')` explicitly rejects direct ad claims and the internal reward RPC is not executable by client roles. No ad payout was enabled.
- GitHub Actions [run #42355149494](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42355149494) passed checkout, Node setup, `npm install` and `npm run build` for commit `75fe0cc8fe8396f47912a819008849a48422b961`. Build completed in 3.49 seconds. Country-specific location chunks are split; the largest listed main bundle was about 430 KB (uncompressed), with no prior ~8 MB monolithic city chunk or Vite >500 KB chunk warning in this build log.
- Latest Vercel production deployment `dpl_5nMEQp2E5K4xTwy4Cop3tg8mAJKE` for the same commit is **READY**, assigned to `circle-panda-ai.vercel.app`, with `aliasError=null`. Runtime error aggregation found no errors in the last 24 hours.
- A direct HTTP probe could not resolve external DNS in the execution environment. The Vercel control plane confirms the production alias, but direct browser rendering and Android/desktop smoke tests remain unverified.

### Remaining launch gates — NOT COMPLETE
- All six coin packages are enabled but still have `price_ngn=NULL`; no purchase orders exist. Owner must set the intended NGN prices, configure `PAYSTACK_SECRET_KEY` only in Supabase Edge Function secrets, register the webhook and `charge.success`/`charge.failed` events, then run signed success/failure/replay tests. Secret presence is not exposed by the available control plane.
- Google and Apple auth flags remain false. Owner must configure provider credentials and redirect URLs in Supabase Auth, test both providers, then enable the corresponding admin settings.
- Leaked-password protection remains disabled; Supabase security advisor continues to flag it. The organization was previously confirmed on the Free plan; owner approval of the required Pro-or-higher plan upgrade and enabling the Auth setting remain outstanding.
- No rewarded-ad provider or server-verifiable completion callback is configured. Keep BC ad payouts disabled.
- No dedicated two-account test credentials or interactive browser session are available. Auth, confession/feed/report/moderation, request/DM, wallet, Paystack, dating 72-hour/1-BC, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications and admin acceptance tests remain unpassed.
- CI still runs build only; it has no automated unit/E2E suite. Android/desktop media, refresh persistence, responsive, console and network smoke tests remain open.
- Do not mark Circle Panda complete until all owner configuration and critical acceptance tests have passing evidence.

### Post-update verification — 2026-11-07
- Checked profile column-level grants: authenticated clients cannot SELECT date_of_birth or address_line, cannot UPDATE is_vip or vip_expires_at, and profile row updates remain restricted by the own-user RLS policy.
- The documentation commit for this tracker, 9751aa5bac5759838019e2fa3aa306c333f9dfd0, also passed GitHub Actions run #42355404636 (npm install and npm run build).
- Newest Vercel production deployment for that commit, dpl_5bR6fdMiWgK3kozM8dBxjHpUfJLW, reached READY and retains the circle-panda-ai.vercel.app production alias with aliasError=null. This is a documentation/migration-source update; app source remains unchanged.


## Latest continuation — 2026-11-08 (live source reconciliation and release CI)

### Supabase state and schema evidence
- Started with project lookup: `chcyncvieekjousgzlrg`, **Circle Panda Rebuilt**, `eu-west-1`, **ACTIVE_HEALTHY**; read-only SQL connectivity succeeded.
- Live migration ledger reconciles exactly with committed `supabase/migrations/`: **153 applied / 153 files**, no missing/extra/duplicate/version-name mismatch. No migration was applied in this run.
- Owner is still admin and permanent VIP, verified in the correct tables: `user_roles.role='admin'`, `profiles.is_vip=true`, `profiles.vip_expires_at=NULL`. No credentials changed.
- Public schema: **78/78** base tables have RLS. Storage: **4 buckets / 14 policies**; dating photos and group media are private. Realtime: **22 tables**, including notifications.
- SECURITY DEFINER inventory: **158 total**, all with pinned search paths; **0** EXECUTE grants to PostgreSQL PUBLIC; **1** read-only anon-callable provider-availability getter; **137** authenticated-callable functions. Four authenticated-callable getters lack an `auth.uid()` reference and are read-only catalogue/current-week/provider-setting getters. The 137 advisor warnings remain a review queue; they are not treated as a blanket proof of safety.
- Security advisor: 4 INFO no-direct-policy findings for internal RLS tables, 1 WARN for the intentionally public read-only auth-provider getter, 137 WARN authenticated-callable SECURITY DEFINER functions, 1 WARN leaked-password protection disabled. The public getter returns only provider-enabled booleans; Google and Apple flags are both 0/false.
- Performance advisor: 7 reviewed multiple-permissive SELECT-policy warnings and 101 unused-index INFO notices. No changes were made without workload evidence. Health advisor: no findings.
- All three Edge Functions are ACTIVE: signup v7, purchase initializer v2, Paystack webhook v2. The webhook handler validates HMAC-SHA512 before wallet-credit RPC. Ad reward claim raises an error pending trusted ad-completion verification; internal payout RPC is not executable by client roles.
- Admin profile verification confirms permanent VIP. Six coin packages are enabled but all have `price_ngn=NULL`; there are zero purchase orders. Supabase Auth currently has only **one** user (the owner).

### Application/source work
- Detected a source-of-truth mismatch: repository `create-panda-account/index.ts` lagged behind the deployed v7 function. Synced the repository file to the exact deployed v7 source and verified byte-for-byte equality. The live handler includes origin allowlisting, a 16 KiB request cap, 8–128 character password validation, stricter email/phone validation, safe metadata fields, atomic per-IP signup limiting and generic failure responses. No Edge Function secrets or credentials were read or changed.
- Added `tests/release-contracts.test.mjs` with eight Node built-in tests for public-only browser config, no server secrets in browser source, signup guardrails, authenticated and priced checkout, HMAC-before-credit webhook handling, anonymous confession privacy, user-scoped notifications, and ad-reward blocking.
- Added `npm test` to package scripts and GitHub Actions before the production build.
- Final CI run [#42462458038](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42462458038) passed: **8/8 release-contract tests**, `npm install`, and `npm run build`. An initial false-negative test assertion was corrected; it was a test matcher issue, not an application defect.

### Vercel evidence
- Latest production deployment `dpl_EtuR6RyFd8wUvdFkCeJQHHJZgphX` for commit `2f7a5fea92122ba2389841f6f0312d543b2c33dd` is **READY** with `aliasError=null` and `circle-panda-ai.vercel.app` assigned. The Vercel domain is verified.
- Build output: main bundle 429.92 KB minified / 122.51 KB gzip. Country-specific location chunks remain split; the former ~8 MB monolithic city-data chunk is not present.
- Vercel runtime error aggregation returned no errors over the last 24 hours.
- Direct public HTTP/browser rendering was not completed; verified alias assignment is not equivalent to browser smoke testing.

### Owner actions and unpassed acceptance gates
- Owner must set six NGN coin package prices; configure `PAYSTACK_SECRET_KEY` only in Supabase Edge Function secrets; register webhook and `charge.success`/`charge.failed`; run signed success/failure/replay tests. Secret presence cannot be read through the available control plane.
- Configure Google and Apple provider credentials and redirect URLs in Supabase Auth before enabling their currently false flags.
- Supabase organization is on Free plan; owner must approve Pro-or-higher upgrade and enable leaked-password protection.
- No rewarded-ad provider/server-verifiable callback is configured; keep payouts disabled.
- Only one Auth user exists, so two-account tests cannot run without a second test account. No production test account was created. Authentication and the requested two-account flows remain untested.
- Browser rendering, Android/desktop smoke, media upload, refresh persistence, responsive layout and console/network tests remain unverified.

**Circle Panda is deployed, but production completion is NOT achieved.** Continue only with evidence-based tests and safe fixes; never mark 100% while any critical gate is open.

## Latest continuation — 2026-11-09 (group-chat regression guard and release re-audit)

### Target project and migration reconciliation
- Started by checking Supabase project `chcyncvieekjousgzlrg`: **Circle Panda Rebuilt**, region `eu-west-1`, status **ACTIVE_HEALTHY**. SQL connectivity succeeded.
- Reconciled the live migration ledger against the recursive GitHub tree for `supabase/migrations/`: **153 applied = 153 exact-version/name files**; no missing, extra, duplicate or version/name mismatches. No migration was applied.
- Owner account remains `circlepandaapp@gmail.com`, `user_roles.role='admin'`, `profiles.is_vip=true`, `profiles.vip_expires_at=NULL`. Credentials were not changed.
- Auth currently contains **one user**, the owner/admin. No disposable production account was created.

### Database, grants, storage and Realtime
- Public schema: **78/78** base tables have RLS enabled; 104 public policies exist; all nine public views use `security_invoker=true`.
- No public table grants allow `anon` INSERT/UPDATE/DELETE/TRUNCATE. Authenticated clients have no elevated TRUNCATE/MAINTAIN/REFERENCES/TRIGGER table privileges. The checked sensitive profile column grants remain empty: authenticated has no direct SELECT on `date_of_birth` or `address_line`, and no UPDATE on `is_vip` or `vip_expires_at`.
- Storage buckets: `crush-post-photos` (public, 5 MiB image-only), `event-covers` (public, 5 MiB image-only), `dating-profile-photos` (private, 5 MiB image-only), and `group-media` (private, 50 MiB; allowed image/video/audio MIME types). Four buckets and 14 storage policies remain in place; private dating and group media access stays membership/match/VIP/user-folder controlled.
- Realtime publishes **22** tables, including `notifications`, group messages/reactions, dating requests/matches and Hot Seat activity.

### SECURITY DEFINER and advisor review
- **158** public SECURITY DEFINER functions; all 158 have pinned search paths; **zero** have EXECUTE granted to PostgreSQL `PUBLIC`; **137** are callable by `authenticated`, and one read-only provider-availability getter is callable by `anon`.
- Four authenticated-callable getter functions without an `auth.uid()` reference were rechecked: `get_coin_packages`, `get_event_blast_plans`, `get_public_auth_provider_settings`, and `get_wcw_mcm_current_week`. They are read-only catalog/schedule/provider-availability getters. The legacy `get_public_confessions(integer)` remains executable only by `service_role`; both `anon` and `authenticated` are denied.
- No authenticated-callable `admin_*` SECURITY DEFINER function was found without an admin-role guard in its definition. This source-level review does not replace a full function-by-function two-account test.
- `claim_economy_reward('ad_reward')` explicitly raises an error pending trusted ad-completion verification. It remains unavailable to `anon`; the UI continues to show ad rewards as setup-required.
- Security advisor still reports four intentional internal RLS/no-direct-policy tables, one intentionally public read-only provider-settings getter, 137 authenticated-callable SECURITY DEFINER warnings, and leaked-password protection disabled.
- Performance advisor still reports seven reviewed multiple-permissive SELECT-policy overlaps and 101 unused-index INFO notices. No risky policy merge or unused-index deletion was made without workload evidence. Health advisor returned no findings.

### Edge Functions and payments
- All three deployed Edge Functions are ACTIVE: `create-panda-account` v7 (custom guarded public signup), `initialize-coin-purchase` v2 (JWT required), and `paystack-webhook` v2 (JWT disabled at gateway; signature checked in handler).
- Compared live Edge Function `index.ts` contents against GitHub for all three functions: **byte-for-byte matches** (signup 6,177 bytes; purchase initializer 5,288 bytes; webhook 3,539 bytes). No secrets were read or changed.
- The Paystack completion RPC is service-role-only; it locks the purchase order and checks reference, status, currency and amount before crediting. This is code/SQL review, not a real signed webhook test.
- Six coin packages remain enabled: 100/300/700/1,200/2,500/5,000 BC; all six have `price_ngn=NULL`. There are zero purchase orders. Owner must set intended NGN prices, configure `PAYSTACK_SECRET_KEY` only in Supabase Edge Function secrets, register the webhook and `charge.success`/`charge.failed` events, then test signed success/failure/replay.
- Google and Apple auth flags remain `0`/false. Owner must configure provider credentials and redirect URLs in Supabase Auth before enabling them.
- The Auth security advisor continues to flag leaked-password protection as disabled. Owner-controlled plan/settings action is still required. Rewarded-ad payouts remain disabled until a provider offers a server-verifiable completion callback.

### App implementation and CI
- Investigated two failed Vercel deployments for the group-chat UI commits `4d7dbd3` and `f3465ff`. Both failed TypeScript build on `coinBalance` being undefined at the Groups route and `showGroupSettings` being declared but unused.
- The subsequent app commit `6812e7f397c2554f81782d8ca18dc9eee5b6aee9` fixed both: `coinBalance` is passed into `GroupsFeature`, and creator/admin group cards now invoke the settings loader. The full-screen group conversation retains the BC balance, scrollable history, composer and mobile `100dvh` layout.
- Added a ninth Node release-contract regression test for the group-chat full-screen layout, BC balance and creator/admin management access. CI run [#42597096673](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42597096673) passed **9/9 tests**, `npm install`, and `npm run build` (build completed in 3.34 seconds).
- This regression test commit `08bfcd119c8772fedb1215919ab3ae199187333b` changes tests only; production app source remains at the passing app commit above.

### Vercel and performance
- Newest app deployment inspected: `dpl_AtxcccZP9YKrVkQUweYDQFEr4aoK`, commit `6812e7f397c2554f81782d8ca18dc9eee5b6aee9`, **READY**, production aliases include `circle-panda-ai.vercel.app`, `aliasError=null`.
- The two earlier group-chat UI deployments are confirmed **ERROR** due to the TypeScript issues listed above; the follow-up deployment is READY. Do not use either failed deployment as production.
- Vercel runtime error aggregation returned no errors in the latest 24 hours.
- Latest Vercel build output: main JS **430.25 KB / 122.57 KB gzip**; CSS **288.84 KB / 56.04 KB gzip**. The deferred country/location client chunk is **303.40 KB / 76.98 KB gzip**; US/India country chunks are each roughly 272–279 KB raw. `LocationFields` loads the dataset as a dynamic import, and city lists load only when the Area/Local Government field is opened. The former ~8 MB monolithic city bundle is gone, but real-device load timing still needs measurement.
- Direct public HTTP rendering could not be verified: the external web open returned an access/internal error. Vercel control-plane alias assignment is verified; browser rendering is not.

### Still NOT complete
- One production Auth user means no genuine two-account test has run. Do not create production test users or mutate real wallet/customer data without owner authorization.
- No live/test Paystack checkout or signed webhook replay has been tested; package prices and provider configuration are missing.
- Google/Apple OAuth has not been configured or tested; leaked-password protection remains disabled; no verified ad provider exists.
- Authentication, confession/feed/report/moderation, message requests/DMs, BC reward/deduction, dating 72-hour/1-BC rules, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications and admin workflows remain unaccepted end-to-end.
- Android/desktop browser, media upload, refresh persistence, responsive, console and network smoke tests remain unverified.

**Release status: NOT COMPLETE.** Do not mark 100% until owner configuration and all critical authenticated/device acceptance gates have passing evidence.


## Latest continuation — 2026-11-10 (VIP group privacy fix and release verification)

### Target project and migration ledger
- Started by checking Supabase project `chcyncvieekjousgzlrg`: **Circle Panda Rebuilt**, `eu-west-1`, **ACTIVE_HEALTHY**. SQL connectivity succeeded.
- Reconciled live migrations against the complete recursive GitHub tree: **154 applied / 154 committed files**, exact version/name match, no missing, extra or duplicate files.
- Applied and committed `20261110091200_restrict_vip_group_discovery_to_eligible_members.sql`. No other migration was applied.
- Owner `circlepandaapp@gmail.com` remains `user_roles.role='admin'`, `profiles.is_vip=true`, `vip_expires_at=NULL`, country Nigeria. No credentials or persistent role changes were made.

### Security defect found and fixed: VIP room metadata/member enumeration
- Before the fix, a simulated signed-in non-VIP identity could read the existing **Worldwide VIP Group** row and its member row through the broad `chat_groups` and `group_members` SELECT policies (both used `USING (true)`). The actual chat-opening RPC already blocked non-VIP entry, but the room and membership metadata were still enumerable.
- Added private SECURITY DEFINER helper `private.can_view_group(uuid)`, pinned to an empty search path, using `auth.uid()`, admin role, active VIP status/expiry, VIP scope and the profile's saved country.
- Replaced broad SELECT policies on `chat_groups` and `group_members`. Ordinary groups remain discoverable to signed-in users; VIP metadata/member rows are visible only to admins or active VIPs in the correct scope. Anonymous execution is revoked; authenticated execution is granted for RLS policy evaluation.
- Read-only transactional policy probes (all rolled back) passed:
  - Simulated non-VIP: **0** VIP group rows / **0** VIP member rows; still sees **1** normal group and its **1** member.
  - Permanent VIP profile with the admin role temporarily removed inside a rolled-back transaction: can see the worldwide VIP group/member.
  - Admin identity: can see the VIP group/member.
  - Non-VIP `open_group_chat` calls are denied with the expected membership/VIP errors; owner/admin can open the VIP conversation.
- Country-scoped VIP branch is implemented and code-reviewed; no country-specific VIP group currently exists for a live data-backed country-branch probe. No production test data was retained.

### Additional database/auth checks
- Public schema: **78/78** tables have RLS; **104** public policies; **9/9** views use `security_invoker=true`.
- Storage: **4 buckets / 14 policies**; dating profile photos and group media remain private. Realtime publication: **22 tables**, including notifications.
- Public SECURITY DEFINER inventory: **158**, all with pinned search paths; **0** PostgreSQL PUBLIC EXECUTE grants; **1** anon-callable read-only provider-availability getter; **137** authenticated-callable functions. The new helper is in the private schema, with authenticated-only execution.
- Security advisor (2026-11-10): 4 internal RLS/no-policy INFO findings, 1 public read-only provider getter WARN, 137 authenticated-callable SECURITY DEFINER WARNs, and leaked-password protection disabled. Performance advisor: 7 multiple-permissive-policy WARNs and 96 unused-index INFO notices. Health advisor: no findings.
- All three Edge Functions remain ACTIVE: `create-panda-account` v7, `initialize-coin-purchase` v2, `paystack-webhook` v2.
- Read-only auth impersonation probes confirmed a non-admin is denied by `admin_list_moderation_reports`; `claim_economy_reward('ad_reward')` rejects with the trusted-ad-verification requirement; and `complete_coin_purchase_secure` is executable only by `service_role`.
- Economy settings remain `dating_free_hours=72` and `dating_message_cost=1`. All six enabled coin packages still have `price_ngn=NULL`; there are zero purchase orders. Google/Apple flags remain false. Auth still has one user (the owner).

### New authentication launch risk discovered
- The public signup Edge Function uses service-role `admin.createUser` with both `email_confirm=true` and `phone_confirm=true`. It does not prove that the registrant controls the submitted email address or phone number before marking it confirmed. This is an identity-ownership/impersonation risk, separate from the rate-limit and input-validation protections.
- Do not describe signup as contact-verified. Before broad public launch, implement a real email/SMS verification flow and configure its provider, or record an explicit owner risk decision. The current signup behavior was not changed in this run because a correct verification flow requires provider configuration and a coordinated UI flow change.

### Application fix and regression tests
- Fixed inaccurate wallet copy: the daily login reward requires an explicit **Claim today's reward** action, but the wallet page said it was credited automatically. The wallet now says “Claim once per day when you first open Circle Panda” and labels it “Daily claim”; the existing full-screen claim popup/flow is unchanged.
- Added regression coverage for the daily-claim wording and the VIP group privacy migration. Release-contract suite now has **11 tests**.
- GitHub Actions run [#42788762821](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42788762821) passed: `npm install`, **11/11 tests**, and `npm run build`.
- Latest build: main JS **430.16 KB / 122.51 KB gzip**; deferred location-data client chunk **303.40 KB / 76.98 KB gzip**; US and India chunks are separate. The former ~8 MB monolithic city-data bundle remains absent.

### Production verification
- Latest Vercel production deployment: `dpl_2ujsofSuAiU2tq5e7MCH1CmzsbC4`, commit `6b562f04edacb751df70eb12947198524346eb2d`, **READY**, aliases include `circle-panda-ai.vercel.app`, `aliasError=null`.
- Direct production fetch on 2026-11-10 returned **HTTP 200** for the root HTML and all referenced main JS, React vendor JS, Supabase vendor JS and CSS assets. The served JS contains the corrected daily-claim wording and no longer contains the inaccurate “Credited automatically” copy.
- Vercel runtime error aggregation over the last 24 hours returned no errors.
- This is HTTP/static-asset verification, not interactive browser execution. No Android or desktop device session was available; interactive UI, media upload, refresh persistence, console/network and mobile/desktop smoke tests remain open.

### Still NOT complete
- Paystack: owner must set six intended NGN package prices, configure `PAYSTACK_SECRET_KEY` only in Supabase Edge Function secrets, register the webhook and `charge.success`/`charge.failed`, then run real signed success/failure/replay tests.
- Google/Apple: owner must configure provider credentials and redirect URLs before enabling the currently disabled flags.
- Auth security: owner must approve the required Pro-or-higher Supabase plan/settings action and enable leaked-password protection. A genuine email/phone ownership-verification flow is also required or must be explicitly risk-accepted.
- Rewarded ads: no provider/server-verifiable completion callback exists; BC ad payouts remain disabled.
- One Auth user means two-account acceptance has not been run. Do not create production test accounts without owner authorization. Confessions/feed/report/moderation, message requests/DMs, BC rewards/deductions, dating 72-hour/1-BC charges, group/VIP flows, events/blasts, WCW/MCM, Hot Seat, notifications and admin controls still need genuine two-account acceptance.
- Android/desktop interactive browser and media/refresh persistence smoke tests remain unverified.

**Release status: NOT COMPLETE.** The VIP group metadata leak is fixed and tested at the database-policy level, but owner/provider configuration, verified-contact signup, real two-account flows and device acceptance remain release gates.


### Follow-up country-scope verification — 2026-11-10
- Tested the country-specific VIP branch using temporary Ghana and Nigeria VIP group rows inside a single transaction that was rolled back. With the permanent VIP profile's admin role temporarily removed in that transaction, `private.can_view_group` returned **false** for Ghana and **true** for Nigeria.
- Post-rollback verification found **zero** temporary group rows; the owner remained admin and permanent VIP. No test data or role changes persisted.


## Latest continuation — 2026-11-11 (verified-contact signup enforcement)

### Starting project state and migration reconciliation
- Began by checking Supabase project `chcyncvieekjousgzlrg`: **Circle Panda Rebuilt**, `eu-west-1`, **ACTIVE_HEALTHY**. SQL connectivity succeeded.
- Compared the live migration ledger with the recursive GitHub `supabase/migrations/` directory listing: **154 live / 154 committed SQL files**, exact version-and-name match, no missing, extra or mismatched migrations. No migration was needed or applied in this run.
- No access was made to the old SekuPanda project `nwmbbhuepbycbkjirqeg`.

### Database, storage, Realtime and administrator audit
- Public tables/RLS: **78/78**.
- Storage: **4 buckets / 14 policies**. `dating-profile-photos` and `group-media` remain private; event covers and crush-post photos remain public.
- Realtime publication: **22 tables**.
- Security-definer inventory: **158 public + 4 private = 162**; all 162 have a pinned `search_path`; **0** have PostgreSQL PUBLIC EXECUTE.
- Owner `circlepandaapp@gmail.com`: `user_roles.role='admin'`, `profiles.is_vip=true`, `vip_expires_at=NULL`. Credentials and persistent roles were not changed.
- Auth user count remains **1** (the owner). No production test user was created.
- Dating economy settings remain `dating_free_hours=72` and `dating_message_cost=1`.
- All six enabled coin packages still have `price_ngn=NULL`; purchase-order count is **0**.
- Public auth-provider settings report Google disabled and Apple disabled.

### Edge Function source and contact-verification fix
- Before this run, signup used service-role `createUser` with `email_confirm=true` or `phone_confirm=true`, allowing an unverified identifier to become immediately sign-in eligible.
- Updated `supabase/functions/create-panda-account/index.ts` to create both email and phone users with confirmation explicitly **false**. The server-side IP-fingerprint rate limit and trusted metadata path remain.
- Updated `src/App.tsx`: after account creation the UI requests Supabase email confirmation or an SMS OTP; phone signup now has an OTP entry/verification form; users are not signed in until the Supabase confirmation flow succeeds; resend supports both email and SMS.
- Deployed signup Edge Function **version 8** with `verify_jwt=false` preserved (the function remains a public signup endpoint with its own server-side validation and rate limit).
- Re-fetched the deployed signup, purchase-initialization and Paystack-webhook source and compared each byte-for-byte with GitHub. Versions **8 / 2 / 2** are ACTIVE and all three source files match.
- The email/SMS delivery providers and live challenge delivery have **not** been tested. Owner must configure working Supabase Auth email/SMS delivery and redirect URLs, then complete a real verification test. This code change removes automatic confirmation; it does not prove provider delivery is configured.

### Advisors
- Security advisor: 4 intentional internal RLS-enabled/no-policy INFO findings; 1 anonymous-callable read-only provider-availability SECURITY DEFINER warning; 137 authenticated-callable SECURITY DEFINER warnings; leaked-password protection remains disabled.
- Performance advisor: 7 multiple-permissive-policy warnings and 96 unused-index informational notices.
- Health advisor: no findings.
- The SECURITY DEFINER warnings remain a review queue; do not interpret the count as proof that each function is exploitable or as proof that every function is safe.

### Automated tests, build and production
- Added a 12th release-contract test for email/SMS verification and changed signup assertions to require `email_confirm=false` and `phone_confirm=false`.
- GitHub Actions run [#42987033844](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42987033844) completed successfully: `npm install`, **12/12 tests passed**, and `npm run build` passed.
- Build output: main JS **431.96 KB / 122.86 KB gzip**; deferred location-data client chunk **303.40 KB / 76.99 KB gzip**; US and India country chunks remain separate. The former ~8 MB monolithic city-data bundle remains absent.
- Latest Vercel production deployment: `dpl_6kefkpyPuGd9kZJunYgohQgGRMEz`, commit `493bfb7f7552a68ebe4b5d4c236efed5c7f4047a`, **READY**, production alias `circle-panda-ai.vercel.app`, `aliasError=null`.
- Public alias root HTML returned **HTTP 200**; referenced main JS returned **HTTP 200** and contains the email/SMS verification UI strings; CSS returned **HTTP 200**. Vercel runtime error aggregation for the latest 24 hours returned no errors.
- These are deployment/static-asset checks, not interactive browser execution. Android/desktop, media upload, refresh persistence, responsive interaction and browser console/network smoke tests remain unverified.

### Still NOT complete — owner and acceptance gates
1. Configure and test Supabase Auth email delivery/SMTP and SMS provider/OTP delivery; verify a real email link and phone OTP. Do not re-enable auto-confirm.
2. Set all six intended NGN coin-package prices. Configure Paystack secret only in Supabase Edge Function secrets, register `charge.success`/`charge.failed`, and run real signed success/failure/replay tests. No Paystack payment has been tested.
3. Configure Google and Apple OAuth credentials/redirect URLs; both provider flags remain false.
4. Upgrade/approve the required Supabase plan/settings action and enable leaked-password protection.
5. Keep rewarded-ad BC payouts disabled until a server-verifiable provider callback is configured and tested.
6. Obtain owner authorization for a second disposable test account or safe staging environment. One production Auth user is not enough for genuine two-account acceptance.
7. Run two-account acceptance for feed/confessions/reports/moderation, message requests/DMs, BC earning/deductions, Paystack, dating 72-hour/1-BC rules, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications and admin controls.
8. Complete interactive Android and desktop browser/device smoke tests.

**Release status: NOT COMPLETE.** Signup now requires a real Supabase confirmation challenge in code and the deployed Edge Function, but delivery is unverified until owner provider configuration. No two-account or payment flow is claimed as passed.


## 2026-11-12 run — unused WCW/MCM RPC client access revoked

Scope remained limited to `musicpromo4444/circle-panda-AI` and Supabase project `chcyncvieekjousgzlrg` (Circle Panda Rebuilt, `eu-west-1`). The old SekuPanda project was not accessed.

### Database and migration evidence

- Project state: `ACTIVE_HEALTHY`; PostgreSQL 17.11. A harmless SQL connectivity query succeeded at 2026-11-12 08:39 UTC.
- Live migration ledger: **155** entries; committed `supabase/migrations/`: **155** files; exact version/name match, no missing or extra migrations.
- Latest applied migration: `20261112084424_revoke_unused_crush_week_public_rpc`.
- Public base tables: 78; RLS enabled on 78/78; public views: 9; public RLS policies: 104.
- SECURITY DEFINER functions: 158; all have pinned search paths; zero PUBLIC EXECUTE grants.
- Client-executable SECURITY DEFINER counts after this run: anon 1 (the intentionally public auth-provider boolean getter), authenticated 136.
- Realtime publication: 22 public tables.
- Storage: 4 buckets and 14 policies. `dating-profile-photos` and `group-media` are private; `crush-post-photos` and `event-covers` are public.
- Four internal tables (`admin_audit_log`, `feed_content_reports`, `moderation_reviews`, `signup_rate_limits`) have RLS but no client policies; direct SELECT/INSERT/UPDATE/DELETE grants to anon/authenticated were verified absent.
- Owner account `circlepandaapp@gmail.com`: role `admin`, `is_vip=true`, `vip_expires_at=NULL`. Credentials unchanged.

### Security fix

The legacy `public.get_wcw_mcm_current_week()` SECURITY DEFINER RPC was not referenced by any current `src/` file. It returned scheduled crush cards through a definer function without enforcing the table's `scheduled_for` RLS visibility condition. The current `CrushFeature` reads `crush_posts` directly under RLS. Migration `20261112084424_revoke_unused_crush_week_public_rpc` revoked EXECUTE from `PUBLIC`, `anon`, and `authenticated`; SQL confirmed all three roles now lack EXECUTE, while the coin-package, event-plan and public auth-provider getters remain available as required. This removes one authenticated SECURITY DEFINER advisor finding.

Regression coverage was added in `tests/release-contracts.test.mjs`. The first test attempt had an over-escaped regex and failed 1/13; the assertion was corrected, and the final CI run passed 13/13.

### Edge Functions and release evidence

- `create-panda-account`: ACTIVE v8, `verify_jwt=false` with its own origin, payload, validation and signup-rate-limit controls.
- `initialize-coin-purchase`: ACTIVE v2, JWT required.
- `paystack-webhook`: ACTIVE v2, JWT disabled because it verifies Paystack's signed webhook.
- Deployed Edge Function source for all three was compared byte-for-byte with the committed GitHub files; all matched.
- Signup creates unconfirmed email/phone identities; the production JS bundle includes email/SMS resend and OTP verification code. Delivery through configured SMTP/SMS providers remains untested.
- GitHub Actions run [#738](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/43185913427), commit `5e3771f4f3f3297282453ec53eb75190f034c877`: npm install, **13/13 tests**, and `npm run build` all passed.
- Latest Vercel production deployment `dpl_3iq1neSQpiQgL1rrC78h4vGMaZZG` is READY for commit `6dd624c77ba50839f09e84ab33961c19ac8aa162`; aliases include `circle-panda-ai.vercel.app`; alias error is null.
- Public production root HTML, main JavaScript (448,135 bytes) and CSS (289,617 bytes) returned HTTP 200. The JS contains the email/SMS verification flow. This is an HTTP smoke test, not an interactive browser/device test.

### Current blockers — do not mark complete

- Auth user count remains 1 (the owner account); no second test identity was created. Genuine two-account acceptance tests remain unperformed.
- All six coin packages are enabled but have `price_ngn=NULL`; `coin_purchase_orders` count is 0. No real Paystack payment or webhook replay test has been performed.
- Google and Apple provider flags are both false. Provider credentials/redirects are not configured or verified.
- Email/SMS verification delivery is not confirmed; owner must configure and test Supabase Auth delivery providers.
- Leaked-password protection remains disabled per the security advisor; owner must enable it in Supabase Auth settings.
- Rewarded-ad BC payouts remain disabled until server-verifiable completion is configured.
- Security advisor: four internal RLS/no-policy notices; one intentional anon SECURITY DEFINER getter returning only Google/Apple enabled booleans; 136 authenticated-callable SECURITY DEFINER warnings; leaked-password protection warning. The public getter remains because the unauthenticated login UI uses it.
- Performance advisor: 7 multiple-permissive-policy warnings and 96 unused-index notices. Health advisor: no findings. No indexes or policy semantics were changed based solely on these warnings.
- Mobile/desktop interactive smoke tests and browser-driven authenticated flows remain unverified. No claims are made for confessions, reports, DMs, BC rewards/deductions, Paystack, dating 72-hour/1-BC rules, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications or admin end-to-end acceptance.

Owner actions remain: set six NGN prices; configure Paystack secret and webhook; configure Google/Apple providers; configure SMTP/SMS; enable leaked-password protection; provide an authorized second test account or staging environment; and configure a verifiable rewarded-ad provider.


## 2026-11-13 — bounded signup request parsing and production recheck

Scope remained limited to musicpromo4444/circle-panda-AI and Supabase project chcyncvieekjousgzlrg (Circle Panda Rebuilt, eu-west-1). The old SekuPanda application/project was not accessed.

### Concrete change

- Hardened supabase/functions/create-panda-account/index.ts: request bodies are now read as a stream in bounded chunks, capped at 16,384 bytes even when Content-Length is absent or inaccurate. The reader is cancelled once the cap is exceeded; JSON parsing happens only after the byte limit is enforced. Malformed JSON and non-object bodies return HTTP 400.
- Deployed signup Edge Function v9, status ACTIVE, retaining verify_jwt=false for the public signup endpoint. The deployed index.ts was compared with GitHub and matched exactly. No secrets or credentials were read or changed.
- Added a fourteenth static release-contract test for the streaming body limit in tests/release-contracts.test.mjs.
- Commits: bd773d4b8d092483792d6b066e4d797b10b410f5 (signup body limit) and f790757fb9e3a50b82f12bbb0c02473a78600375 (regression test).
- Latest Vercel production deployment dpl_DERraKwBiZxtBtjFYCbc5vop1Vz1 is READY, targets the test commit, and lists circle-panda-ai.vercel.app as an alias with no alias error. Vercel build/deployment succeeded.

### Supabase evidence checked on 2026-11-13

- Project state ACTIVE_HEALTHY; PostgreSQL 17.11; harmless SQL connectivity succeeded.
- Live migration ledger: 155 entries; latest 20261112084424_revoke_unused_crush_week_public_rpc. No migration was added in this run. The latest committed-directory reconciliation was 155/155 on 2026-11-12; the current ledger remains at 155.
- Public base tables: 78; RLS enabled on 78/78; public RLS policies: 104.
- SECURITY DEFINER functions: 158; pinned search paths: 158; PUBLIC EXECUTE grants: 0. One anon-executable function is the intentionally public get_public_auth_provider_settings() getter, returning only Google/Apple enabled booleans. The two authenticated-executable getters without caller-ID checks (get_coin_packages, get_event_blast_plans) are read-only and return enabled catalog fields. The signup rate-limit RPC is not client-executable.
- Anon has zero public-table write grants. The four internal RLS/no-policy tables (admin_audit_log, feed_content_reports, moderation_reviews, signup_rate_limits) have no direct anon/authenticated SELECT or INSERT grants.
- Storage: 4 buckets, 14 policies; dating photos and group media remain private. Realtime publication: 22 public tables.
- Edge Functions: create-panda-account v9, initialize-coin-purchase v2, paystack-webhook v2; all ACTIVE. Signup source exactly matches GitHub after v9 deployment; purchase and webhook sources remain at their previously verified versions.
- Admin circlepandaapp@gmail.com remains admin, is_vip=true, vip_expires_at=NULL; credentials unchanged.
- Auth users: 1. Six enabled coin packages still have price_ngn=NULL; purchase orders: 0. Google and Apple provider flags are both false.
- Security advisor: 4 internal RLS/no-policy INFO notices; 1 intentional anon getter warning; 136 authenticated-callable SECURITY DEFINER warnings; leaked-password protection warning. Performance advisor: 7 multiple-permissive-policy warnings and 96 unused-index notices. Health advisor: no findings.

### Test and verification boundary

- The last directly inspected GitHub Actions run, #43185913427, passed npm install, 13/13 then-existing tests, and npm run build. The fourteenth test was committed after that run; this connector did not expose a newer GitHub Actions run, so 14/14 is not claimed.
- Vercel's production build for the updated signup source and subsequent test commit reached READY. The deployment alias is verified by Vercel metadata. The web fetcher could not directly open the public host during this run, so no new HTTP/browser claim is made.
- No real email/SMS delivery, authenticated two-account workflow, Paystack payment/webhook replay, Google/Apple login, rewarded-ad callback, or interactive Android/desktop test was performed.

### Outstanding release gates

- Configure and test SMTP/email and SMS delivery; verify actual contact-ownership challenges.
- Set the six owner-approved NGN coin-package prices; configure Paystack server-side secret and webhook; test signed success, failure and idempotency replay.
- Configure Google/Apple provider credentials and redirect URLs, then test real login.
- Enable leaked-password protection in Supabase Auth.
- Keep rewarded BC payouts disabled until a server-verifiable ad-completion provider is configured.
- Authorize a second disposable test account or safe staging environment; complete the two-account acceptance matrix for feed/confessions/reports, message requests/DMs, wallet/rewards/deductions, dating 72-hour/1-BC rules, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications and admin.
- Complete interactive Android and desktop smoke tests, including media upload, refresh persistence, responsive layout, and console/network checks.

Production completion remains open. Do not mark 100% until all provider, payment, two-account and device gates have passing evidence.


### Follow-up verification (same 2026-11-13 run)

- Ran the deployed bounded-body reader logic under Node v22.16.0 against four cases: valid JSON, exactly 16,384 bytes, 16,385-byte rejection, and malformed JSON parse rejection. **4/4 targeted helper checks passed.** This is a focused helper test, not the full repository test suite.
- The latest inspected Vercel production deployment at this point, dpl_A8LZxw5MQavYHWMf1U28XSm6UQjz, is READY and includes the public alias circle-panda-ai.vercel.app; alias error is null. Build logs show npm run build, tsc -b && vite build, 350 modules transformed, and successful completion in 19 seconds. Main JS: 432.04 KB (122.92 KB gzip); deferred client chunk: 303.40 KB (76.99 KB gzip).
- Vercel runtime error aggregation for the last 24 hours returned no runtime errors.
- .github/workflows/ci.yml is configured for pushes to main and pull requests, running npm install, npm test, and npm run build. The last directly inspected GitHub Actions job remains run #43185913427 with 13/13 then-existing tests passed. The newer fourteenth test has not been verified by an accessible Actions run; do not claim 14/14.
- Vercel confirms the public alias, but the web fetcher could not open the public host in this run. This is not a successful direct HTTP/browser check.
