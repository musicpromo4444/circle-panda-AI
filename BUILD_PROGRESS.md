# Circle Panda rebuild — persistent completion tracker

Last verified: 2026-11-06 (UTC)
Repository: `musicpromo4444/circle-panda-AI`
Active Supabase project: `chcyncvieekjousgzlrg` — **Circle Panda Rebuilt**
Production URL: https://circle-panda-ai.vercel.app
Latest app code deployment: `4c7b9043ed7e54866a4e59c5558e2565cf12927c` (secondary feature panels lazy-loaded; Vercel deployment READY).\nLatest database migrations: `20261106083427_fix_crush_vote_timezone_and_concurrency.sql` and `20261106084052_fix_event_blast_monthly_timezone.sql` (both applied to the active rebuild project).

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
