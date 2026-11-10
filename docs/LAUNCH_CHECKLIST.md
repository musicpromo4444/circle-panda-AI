# Circle Panda — production completion gate

Last checked: 2026-11-07
Repository: `musicpromo4444/circle-panda-AI`
Supabase rebuild project: `chcyncvieekjousgzlrg` (`eu-west-1`)
Production host: `https://circle-panda-ai.vercel.app`

## Verified from provider control planes

- Supabase project state is `ACTIVE_HEALTHY`; SQL connectivity and table introspection are working.
- Live database contains the rebuilt application schema and 153 recorded migrations. Do not replay or bulk-apply historical migrations.
- Owner account `circlepandaapp@gmail.com` is confirmed as `admin` and permanent VIP (`is_vip=true`, `vip_expires_at=NULL`).
- Vercel production environment contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for production, preview and development. Secret values are intentionally not copied here.
- Three Supabase Edge Functions are registered ACTIVE: `create-panda-account`, `initialize-coin-purchase`, and `paystack-webhook`.
- Latest app-code commit `f8e9ef33d68dfb8f1add406971e5d0c1da44bc29` remains unchanged. The latest production deployment is `dpl_5nMEQp2E5K4xTwy4Cop3tg8mAJKE` for migration-source commit `75fe0cc8fe8396f47912a819008849a48422b961`; it is READY and assigned to the verified alias `circle-panda-ai.vercel.app`.
- Previous production deployment for commit `9480684c9b8dfb0021ee1f6bc1639474a31925d8` is also **READY**.
- Vercel runtime error aggregation for the last 24 hours returned no runtime errors. This is not a substitute for browser or authenticated user testing.
- Migration reconciliation on 2026-11-07: all 153 live ledger versions match exactly one committed `supabase/migrations/` filename; no missing, extra, duplicate or mismatched versions. Do not replay or bulk-apply historical migrations.
- Removed redundant index `group_message_reactions_one_per_user_idx`; the existing UNIQUE constraint still enforces one reaction per user.
- Added a primary key to `public.signup_rate_limits`; verified in PostgreSQL.
- Hardened the SECURITY DEFINER wrappers `claim_economy_reward`, `create_group`, and `request_context_message_secure` with explicit signed-in checks.
- Optimized the 52 RLS policies previously flagged for per-row auth function evaluation. Supabase performance advisor no longer reports `auth_rls_initplan`; the missing-primary-key notice is also cleared.
- Live security review of authenticated-callable SECURITY DEFINER functions: 137 remain in the advisor review queue. The reviewed function bodies use caller identity/ownership/membership checks or explicit admin-role checks for protected operations. Four authenticated-callable functions do not reference `auth.uid()`: `get_coin_packages`, `get_event_blast_plans`, `get_public_auth_provider_settings`, and `get_wcw_mcm_current_week`; these are read-only catalogue/feed/settings getters. The legacy `get_public_confessions(integer)` RPC was found to return `author_id` for anonymous posts and is no longer executable by client roles (see 2026-11-07 entry below).
- Security advisor still reports four RLS-enabled internal tables without direct client policies (`admin_audit_log`, `feed_content_reports`, `moderation_reviews`, `signup_rate_limits`). These are intentionally not directly accessible to client roles and are accessed through guarded backend/RPC flows.
- Performance advisor still reports seven multiple-permissive-policy warnings and 101 unused-index informational notices. The seven SELECT policy overlaps were reviewed as a combination of owner/admin `ALL` policies and public-to-authenticated read policies; no merge was applied because careless merging could change write permissions. Unused-index notices should be assessed after representative production traffic, not blindly dropped.
- Security advisor still flags the public auth-provider-settings SECURITY DEFINER RPC; it returns only Google/Apple enabled booleans. Leaked-password protection remains flagged and still needs to be enabled in Supabase Auth settings.

## Code and database changes recorded

- Daily activity prompt navigation fix: `openDailyActivity()` now routes to `DailyActivities` rather than Wallet. Commit: `b931ab781c71efc32c62a9c2bea35633253d2287`.
- Redundant group-reaction index cleanup migration: `20261105180000_remove_duplicate_group_message_reactions_index.sql`.
- Auth wrapper and rate-limit primary-key migration: `20261105190000_harden_auth_wrappers_and_rate_limit_primary_key.sql`.
- RLS auth initplan optimization migration: `20261105200000_optimize_rls_auth_uid_initplans.sql`.
- Latest checklist/security documentation commit previously recorded: `98e46b781d1d93f19981255433b3cd62de221e79`.

## Current release blockers (must clear before launch)

1. **Enable leaked-password protection** in Supabase Auth settings and verify the setting is active.
2. **Paystack:** confirm secret is set only in Supabase Edge Function secrets; configure the webhook URL `https://chcyncvieekjousgzlrg.supabase.co/functions/v1/paystack-webhook`; enable `charge.success` and `charge.failed`; configure enabled NGN coin-package prices; test successful payment, failed payment, webhook signature validation, and replay/idempotency. Never paste secret values into chat or GitHub.
3. **Google/Apple OAuth:** configure provider credentials and redirect URLs in Supabase Auth before enabling the corresponding admin toggles.
4. **Rewarded ads:** keep BC rewards disabled until an ad provider and server-verifiable completion callback are configured.
5. **Authenticated end-to-end tests with at least two test accounts:** sign-up/login/recovery; confession create/read/react/comment/report; request/accept/decline and DM; BC earning/spending; dating profile/discovery/request/free period/paid messages/review; groups and VIP gates; event creation/attendance/blasts; WCW/MCM schedule/voting; Hot Seat host/viewer lifecycle, gifts, comments, questions and bids; notifications; admin settings and moderation.
6. **Production smoke test:** open the production alias on Android and desktop; check routes, media uploads, refresh persistence, empty/error/loading states, mobile layouts, browser console and network errors. Verify public reachability and absence of unintended deployment protection.
7. **Performance pass:** country-specific city data is now split into deferred country chunks; the latest CI build no longer has the historical ~8 MB monolithic city chunk or a >500 KB Vite chunk warning. Measure initial route loading on a real mobile connection before sign-off.
8. **Release sign-off:** confirm all critical flows pass, no unresolved high/critical security findings remain, backups/restore path are understood, and the live Paystack account is approved before enabling real-money purchases.

## Important operating rules

- Work only in the new `circle-panda-AI` repository and `Circle Panda Rebuilt` project.
- Never connect the old SekuPanda database or copy the old app UI.
- Never put service-role keys, Paystack secrets, OAuth secrets or user passwords in frontend variables, source control, issue comments or this document.
- A READY Vercel build proves compilation/deployment only; it does not prove the database or user journeys work.
- Do not mark the project 100% complete until every release blocker above has evidence of passing.

## Latest continuation — 2026-11-05

- Confirmed the two previously queued/building deployments have now both reached **READY**. The newest commit `98e46b781d1d93f19981255433b3cd62de221e79` is live on the production alias.
- Checked Vercel runtime error aggregation over the last 24 hours: no runtime errors were returned.
- Re-ran Supabase advisors. The RLS auth-initplan and missing-primary-key findings remain cleared. Remaining performance findings are seven multiple-permissive-policy warnings and 105 unused-index informational notices.
- Continued the SECURITY DEFINER body review. The five functions without an `auth.uid()` reference are read-only public getters/catalogue endpoints; the rest of the 138 advisor-listed functions reference caller identity. Protected admin RPCs reviewed so far include explicit `user_roles.role='admin'` checks. This remains a security-review item, not a blanket declaration that all 138 are risk-free.
- Updated README status so it no longer describes the app as merely an initial UI foundation.
- Outstanding owner-dashboard tasks remain: leaked-password protection, Paystack setup/test, OAuth credentials, and rewarded-ad provider callback. Full two-account and Android/desktop acceptance testing is still not completed.


## Latest continuation — 2026-11-06

### Verified now

- Supabase project `chcyncvieekjousgzlrg` is `ACTIVE_HEALTHY` in `eu-west-1`; PostgreSQL 17.11.0.003.
- All 78 public base tables have RLS enabled; none were found with RLS disabled. Storage has four buckets, 14 policies, and Realtime publishes 21 tables.
- The owner account `circlepandaapp@gmail.com` remains admin and permanent VIP.
- All three Edge Functions are ACTIVE. Signup uses server-side service-role access with validation and an atomic rate-limit RPC. Coin checkout requires a signed-in user and reads the package price server-side. The webhook verifies Paystack's HMAC-SHA512 signature and calls a service-role-only completion RPC.
- The frontend RPC references in the audited feature modules all match live database functions. `feed_posts_public` is a live view; the remaining non-table references are the expected storage bucket names.
- Rewarded-ad credit is still blocked from client roles: `claim_economy_reward('ad_reward')` rejects direct claims and `claim_economy_reward_internal` is not executable by `anon` or `authenticated`.
- Vercel production deployment for commit `4c7b9043ed7e54866a4e59c5558e2565cf12927c` is **READY**. The verified `circle-panda-ai.vercel.app` domain is assigned to the production project; production password protection is off and SSO protection applies only to previews.
- GitHub Actions build run [#646](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42187638796) passed. Vercel's latest build completed successfully.
- Runtime error aggregation returned no errors over 24 hours; the last 30-minute warning/error log query returned no entries.

### Migration ledger reconciliation

- Live migration ledger: 148 applied entries. Repository: 72 SQL files; 69 exact-name file matches; 3 file names do not exactly match the ledger, but their intended schema effects are already present; 79 applied ledger entries have no corresponding committed migration file. One migration name stem is duplicated in the repository.
- No migrations were replayed. No verified unapplied schema change was found. The missing historical SQL source is a repository reproducibility gap; reconstruct a baseline/history before using this repository to provision a fresh database.

### Performance work completed

- Replaced the monolithic 8,065.11 KB city-data chunk (2,188.44 KB gzip) with per-country lazy city chunks. The Nigeria chunk is 27.63 KB; the largest observed country chunks are India 278.99 KB and US 271.97 KB. Country metadata remains deferred.
- Lazy-loaded Crush, Hot Seat, Daily Activities, campaign admin and VIP call controls. Main JS fell from 526.92 KB / 145.73 KB gzip to 426.07 KB / 121.45 KB gzip (~19% smaller); no Vite >500 KB chunk warning remains.

### Still blocked — owner configuration or real acceptance testing required

1. **Paystack prices:** all six coin packages are enabled, but every `price_ngn` is null. Checkout correctly returns HTTP 409 and no purchase orders exist. Set the intended NGN prices; do not guess prices.
2. **Paystack credentials/webhook:** configure `PAYSTACK_SECRET_KEY` only in Supabase Edge Function secrets, set webhook URL `https://chcyncvieekjousgzlrg.supabase.co/functions/v1/paystack-webhook`, subscribe to `charge.success` and `charge.failed`, and test successful, failed, invalid-signature and replay/idempotency cases.
3. **Google/Apple:** both database toggles are currently off. Add the provider credentials and redirect URLs in Supabase Auth, test both providers, then enable the toggles.
4. **Leaked-password protection:** Supabase Auth security advisor still reports this disabled. Enable it in Auth settings.
5. **Rewarded ads:** keep BC ad payouts disabled until a provider and server-verifiable completion callback are configured and tested.
6. **Two-account acceptance:** sign-up/login/recovery, confessions/feed, reports/moderation, message requests/DM, BC rewards/deductions, dating request/accept/decline and 72-hour/1-BC rules, group/VIP gates, events/blasts, WCW/MCM, Hot Seat, notifications and admin controls remain untested with two real signed-in test accounts.
7. **Device/public smoke tests:** Vercel control-plane checks confirm the production alias and verified domain, but direct external page rendering plus Android and desktop route/media/refresh tests were not completed in this run.
8. **Migration source history:** restore or baseline the 80 applied migration entries absent from the repository before treating the repo as a reproducible fresh-project bootstrap.

### Advisor review

- Security: four internal RLS-enabled tables intentionally have no direct client policies; one public SECURITY DEFINER getter returns only provider-enabled booleans; 138 authenticated-callable SECURITY DEFINER functions remain listed by the advisor. All 138 have a pinned empty search_path; five without `auth.uid()` are read-only getters; the broad scan found no mutating SECURITY DEFINER function lacking caller identity. Admin-prefixed functions have admin-role guard patterns. Targeted authorization tests are still required.
- Leaked-password protection remains a warning.
- Performance: seven multiple-permissive SELECT-policy overlaps and 101 unused-index informational notices remain. No policy merge or index deletion was made without evidence that permissions/query plans would remain correct.
- Health advisor: no findings.

**Release status: NOT COMPLETE.** Do not enable live purchases or rewarded BC payouts until their server-side configuration and end-to-end tests pass. Do not mark 100% complete until every release gate has evidence.


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


## Latest verified continuation — 2026-11-06

### Completed safely in this run

- Wallet ad-reward messaging now clearly says **Rewarded ads paused** and **Provider required**, rather than advertising a fixed free-BC amount while no verified ad provider exists. The server wrapper continues to reject direct ad-reward claims; the internal reward RPC is service-role-only. No ad payouts were enabled.
- Confirmed Supabase project health and SQL connectivity; 78/78 public base tables have RLS enabled, 104 public policies exist, no anonymous write policies exist, four internal tables remain intentionally policy-less, four storage buckets have 14 policies, and 22 tables are in Realtime.
- Confirmed the owner account remains admin and permanent VIP.
- Reviewed SECURITY DEFINER metadata: 158 total, 138 authenticated-callable and one anonymous read-only getter; every SECURITY DEFINER function has a pinned search_path. Five functions without auth.uid() are read-only getters. Keep the function-by-function authorization tests open.
- Restored the complete canonical migration history from the live ledger: all 152 applied rows had one non-empty stored SQL statement. The 152 exact-version files are now in `supabase/migrations/`; the prior 72 files are preserved under `supabase/archive/legacy-migration-source/`. Rechecked the tree: 152/152 ledger versions present, no extra or duplicate versions. The SQL review found no literal secret/private-key patterns or destructive DDL. No database migration was applied; a fresh-project bootstrap test remains outstanding.
- Latest GitHub Actions [run #42195661828](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42195661828) passed checkout, Node setup, `npm install`, and `npm run build` for commit `f8e9ef33d68dfb8f1add406971e5d0c1da44bc29`. Latest Vercel production deployment `dpl_8ce9tEzHPyJWtPFTfaB65Jvb5f23` for the same commit is **READY** and includes the verified `circle-panda-ai.vercel.app` alias. Production password protection is off; SSO applies to previews only.
- Runtime error aggregation returned zero errors for 24 hours; no warning/error runtime logs appeared in the last 30 minutes. Direct external HTTP/browser rendering was not completed in this run.

### Current owner configuration blockers

1. All six coin packages are enabled but have `price_ngn=NULL`; there are zero purchase orders. Set the intended NGN prices before payment tests.
2. Add the Paystack secret only to Supabase Edge Function secrets, configure the webhook URL and `charge.success`/`charge.failed` events, and perform signed success/failure/replay tests. Secret presence and a real webhook remain unverified.
3. Configure Google and Apple OAuth credentials and redirect URLs in Supabase Auth; test each provider before enabling the database/admin toggles. Both flags currently remain false.
4. Supabase organization is currently on the **Free** plan. Leaked-password protection is disabled and the official guide says it is available on Pro plan and above; an owner-approved upgrade is required before enabling it in Auth settings: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
5. Keep rewarded-ad BC payouts disabled until a provider supplies a server-verifiable completion callback.

### Still not acceptance-tested

- Two-account authenticated journeys across sign-up/login, confession/feed/report/moderation, message requests/DM, wallet rewards/deductions, Paystack, dating 72-hour/1-BC rules, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications and admin controls.
- Android and desktop browser smoke tests, including media upload, refresh persistence, loading/error states, console/network errors and responsive layouts.
- Direct external HTTP rendering was not completed in this run; Vercel domain and deployment alias assignment were verified in the control plane only.
- The CI workflow currently builds but does not run unit or E2E tests. A READY build is not proof that user journeys pass.

**Release status remains NOT COMPLETE.** Do not mark 100% until every owner action and critical acceptance test has evidence of passing.


## Latest continuation — 2026-11-06 (privilege hardening and notification inbox)

- Supabase `chcyncvieekjousgzlrg` was rechecked first and remained `ACTIVE_HEALTHY` in `eu-west-1` (PostgreSQL 17.11); SQL connectivity succeeded.
- Live migration ledger and repository are now exactly reconciled: **152 applied rows = 152 exact-version files**, with no missing, extra or duplicate versions. The newest applied migrations are:
  - `20261106092044_harden_public_client_role_privileges.sql`
  - `20261106092233_revoke_public_function_execute.sql`
  - `20261106092801_add_notifications_to_realtime.sql`
- Privilege hardening: `anon` now has only SELECT on `public.coin_packages`, no sequence privileges, and explicit EXECUTE only on `get_public_auth_provider_settings()`. PUBLIC EXECUTE was revoked from all public functions. `authenticated` retains RLS-governed app DML but no TRUNCATE, MAINTAIN, REFERENCES or TRIGGER table privileges. The current `postgres` default ACL is hardened for future app objects. All 88 current public objects are owned by `postgres`; Supabase-managed `supabase_admin` default ACLs remain broad and could not be altered by the migration role, but no current public objects are owned by that role.
- Reconfirmed 78/78 public base tables have RLS, 104 public policies exist, and four internal tables intentionally have no direct client policies. There are no anonymous write policies. Four storage buckets have 14 policies; dating photos and group media are private, with match/membership/VIP/view-once checks. All nine public views use `security_invoker=true`.
- Realtime now publishes 22 tables, including `notifications`. The frontend now has a per-user notification inbox with unread count, mark-read/mark-all-read, retry state, destination routing and a filtered Realtime insert subscription. Notifications RLS remains user-scoped.
- SECURITY DEFINER review: 158 total, 138 authenticated-callable, one deliberately anonymous read-only provider-settings getter, and zero PUBLIC EXECUTE grants. The five callable getters without `auth.uid()` are read-only catalogue/feed/settings functions. Admin-prefixed definer functions reviewed have explicit admin-role checks. Every definer function has a pinned search_path; the 26 Hot Seat/admin functions pinned to `public` (some with `pg_temp`) use schema-qualified application objects.
- Supabase advisors: four INFO RLS/no-policy internal-table findings, one WARN for the deliberately public read-only provider-settings getter, 138 authenticated SECURITY DEFINER warnings, seven multiple-permissive SELECT-policy warnings, 101 unused-index INFO notices, and no health-advisor findings. Unused indexes remain in place pending production workload evidence.
- Daily activity UI now explicitly says sponsored BC rewards are paused until ad playback is verified. Server-side ad reward claims remain blocked and the internal payout RPC is service-role-only.
- Static source-to-schema scan checked 20 TypeScript source files: all literal frontend RPCs, table/view references and storage buckets resolve in the live database. Core message charging, dating free window, group VIP gates, Event Blast local-month claim and paid WCW/MCM vote logic were reviewed in SQL; these are code reviews, not two-account tests.
- Latest CI [run #42195661828](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42195661828) passed `npm install` and `npm run build`. Latest production deployment `dpl_8ce9tEzHPyJWtPFTfaB65Jvb5f23` for commit `f8e9ef33d68dfb8f1add406971e5d0c1da44bc29` is **READY**. Vercel confirms `circle-panda-ai.vercel.app` is verified, assigned as the production alias, has no alias error or production password protection; SSO is preview-only.
- No production warning/error logs appeared in the latest 30-minute query and runtime error aggregation found none in the last 24 hours. Direct external HTTP/browser rendering was not completed; alias status is verified from Vercel control-plane metadata.
- Supabase organization plan remains **Free**; leaked-password protection is disabled. All six coin packages remain enabled with `price_ngn=NULL`, and there are zero purchase orders. Google/Apple auth flags remain false. No rewarded-ad provider or server-verifiable callback is configured. Vercel environment metadata lists only the public Supabase URL and anon key; Edge Function secret presence is not exposed by the available control plane and has not been verified.
- Still not passed: two-account authenticated acceptance across all critical journeys; Paystack signed success/failure/replay; Google/Apple OAuth; Android and desktop browser/media/refresh smoke tests. CI has no unit/E2E test suite. Owner configuration and these tests remain mandatory before release.

**Release status remains NOT COMPLETE.** Never mark 100% until all owner actions and critical acceptance tests pass with evidence.

## Latest continuation — 2026-11-07

- Supabase project chcyncvieekjousgzlrg was checked first and remained ACTIVE_HEALTHY in eu-west-1; read-only SQL connectivity succeeded.
- Live migration ledger and repository now reconcile exactly: 153 applied migrations and 153 exact-version/name files, with no missing, extra, duplicate or mismatched versions. The new migration is 20261107082130_revoke_legacy_confession_author_exposure.sql.
- Privacy fix: revoked authenticated execution of legacy get_public_confessions(integer) because its SECURITY DEFINER response included author_id even for anonymous confessions. Confirmed the current frontend does not call this RPC; it uses feed_posts_public, a security_invoker=true view that omits author IDs and masks anonymous author names. Verified both authenticated and anon now lack EXECUTE on the legacy RPC.
- Database checks: 78/78 public base tables have RLS; four storage buckets have 14 policies; dating photos and group media are private; 22 tables are in Realtime including notifications. No anonymous public-table write privileges or authenticated elevated table privileges (TRUNCATE, MAINTAIN, TRIGGER, REFERENCES) were found. The owner account remains admin and permanent VIP.
- SECURITY DEFINER review: 158 functions total, all with pinned search paths; 137 are authenticated-callable, one intentionally public read-only auth-provider getter, and zero PUBLIC EXECUTE grants. Admin-prefixed authenticated-callable definer RPCs inspected contain admin-role guards. Security advisor: four INFO internal-table/no-policy notices, one WARN for the read-only public getter, 137 authenticated-callable definer warnings, and leaked-password protection disabled. Performance advisor: seven SELECT-policy overlaps and 101 unused-index INFO notices. Health advisor: no findings.
- All three Edge Functions remain ACTIVE with expected JWT settings: public signup handler (custom validation/rate limiting), authenticated purchase initializer, and signature-validated Paystack webhook. No secrets were exposed or changed. Rewarded-ad claims remain blocked until a server-verifiable ad callback exists.
- Six coin packages remain enabled with price_ngn=NULL; no purchase orders exist. Google and Apple auth flags remain false. Owner must configure Paystack prices/secrets/webhook and Google/Apple credentials/redirects. Supabase leaked-password protection remains disabled; owner approval of the required Pro-or-higher plan upgrade and enabling the Auth setting are still needed.
- CI run #42355149494 passed npm install and npm run build for commit 75fe0cc8fe8396f47912a819008849a48422b961; build completed in 3.49 seconds. Country-specific location chunks are split; largest listed main bundle was about 430 KB uncompressed, with no ~8 MB monolithic city chunk or >500 KB Vite warning.
- Latest Vercel production deployment dpl_5nMEQp2E5K4xTwy4Cop3tg8mAJKE is READY, assigned to circle-panda-ai.vercel.app, and has no alias error. Runtime error aggregation returned no errors in the last 24 hours. Direct HTTP probing failed because external DNS could not resolve in the execution environment; no browser session was available.
- Still not passed: authenticated two-account journeys across all critical feature areas, Paystack signed success/failure/replay, Google/Apple OAuth, direct public HTTP/browser rendering, and Android/desktop responsive/media/refresh smoke tests. CI still runs a build only, not E2E tests.

**Release status remains NOT COMPLETE.** The production alias and deployment are verified in Vercel's control plane, but do not treat this as direct browser validation or proof that all user journeys pass.
### Post-update verification — 2026-11-07
- Checked profile column-level grants: authenticated clients cannot SELECT date_of_birth or address_line, cannot UPDATE is_vip or vip_expires_at, and profile row updates remain restricted by the own-user RLS policy.
- The documentation commit for this tracker, 9751aa5bac5759838019e2fa3aa306c333f9dfd0, also passed GitHub Actions run #42355404636 (npm install and npm run build).
- Newest Vercel production deployment for that commit, dpl_5bR6fdMiWgK3kozM8dBxjHpUfJLW, reached READY and retains the circle-panda-ai.vercel.app production alias with aliasError=null. This is a documentation/migration-source update; app source remains unchanged.


## Latest continuation — 2026-11-08 (source reconciliation and CI security contracts)

### Target project and migration ledger
- Started with Supabase project lookup: `chcyncvieekjousgzlrg`, **Circle Panda Rebuilt**, region `eu-west-1`, status **ACTIVE_HEALTHY**. Read-only SQL connectivity succeeded.
- Reconciled the live migration ledger with committed `supabase/migrations/`: **153 applied = 153 SQL files**, with no missing, extra, duplicate or version/name mismatch. No migration was missing, so none was applied.
- The owner account was checked against the correct profile record: `user_roles.role='admin'`, `profiles.is_vip=true`, `profiles.vip_expires_at=NULL`. Credentials were not changed. (The VIP fields are in `profiles`, not `auth.users`.)

### Database, storage, Realtime and function checks
- All **78/78** public base tables have RLS enabled.
- Storage has four buckets and 14 policies: event covers and confession/crush photos are public; dating-profile photos and group media remain private.
- Realtime publishes 22 tables, including `notifications`.
- There are 158 public SECURITY DEFINER functions; all 158 have a pinned `search_path`; zero retain EXECUTE for PostgreSQL `PUBLIC`. One read-only auth-provider availability getter is callable by `anon`; 137 are callable by `authenticated`. Four authenticated-callable getters do not reference `auth.uid()` and are read-only catalogue/current-week/provider-availability getters. Continue treating the advisor's 137-function warning as a review queue, not as proof that every function is risk-free.
- The legacy anonymous-confession RPC remains revoked for authenticated users; the current app uses `feed_posts_public`. The live ad-reward claim RPC rejects `ad_reward`, and the internal payout RPC is not executable by `anon` or `authenticated`.
- All three Edge Functions are ACTIVE: `create-panda-account` v7 (JWT verification off for the custom guarded public signup flow), `initialize-coin-purchase` v2 (JWT on), and `paystack-webhook` v2 (JWT off; handler verifies the Paystack signature).
- Security advisor: four INFO internal-table/no-policy notices; one WARN for the deliberately public read-only provider-availability getter; 137 WARN authenticated-callable SECURITY DEFINER functions; one WARN for leaked-password protection disabled. The provider getter returns only Google/Apple enabled booleans; both flags are currently false.
- Performance advisor: seven reviewed overlapping SELECT-policy warnings and 101 unused-index INFO notices. No policy merge or index deletion was made without workload evidence. Health advisor returned no findings.

### Source drift corrected and regression checks added
- Found that committed `supabase/functions/create-panda-account/index.ts` was older than live Edge Function v7: repository code allowed wildcard CORS and lacked the live payload cap, maximum password length, stricter phone/email validation, safe metadata allowlist and generic failure responses.
- Synced the repository file to the exact live v7 source and verified byte-for-byte equality. The deployed function itself was already v7; no secret or credential was read or changed and no Edge Function redeploy was needed.
- Added eight Node built-in release/security contract tests and made GitHub Actions run `npm test` before `npm run build`. Tests cover browser-only public Supabase variables, no server secrets in browser source, signup hardening, authenticated/price-validated checkout initialization, Paystack HMAC-before-credit ordering, anonymous-confession RPC revocation, user-scoped notification reads/Realtime, and disabled unverified ad payouts.
- The first test run exposed a brittle assertion in the test (it expected template interpolation while the app correctly builds the Realtime filter by string concatenation). The assertion was corrected; the final run passed **8/8 tests** and the production build.
- Passing CI: [run #42462458038](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42462458038), commit `2f7a5fea92122ba2389841f6f0312d543b2c33dd`.

### Production build and deployment
- Vercel production deployment `dpl_EtuR6RyFd8wUvdFkCeJQHHJZgphX` for the same commit reached **READY**, with `aliasError=null` and aliases including `circle-panda-ai.vercel.app`. The production domain is verified in Vercel.
- Vercel build output: main bundle **429.92 KB minified / 122.51 KB gzip**; country/location data remains split into deferred country chunks (largest listed country chunk 303.40 KB). The former ~8 MB monolithic city bundle is not present.
- Runtime error aggregation returned no errors in the latest 24 hours.
- Direct public HTTP fetch/browser rendering could not be completed in this environment. The domain/alias are verified by Vercel control-plane records only; do not claim browser rendering or mobile/desktop smoke tests passed.

### Remaining launch gates — NOT COMPLETE
- There is currently **one** Supabase Auth user (the owner/admin). No second account or disposable test users were created in production. Two-account authenticated acceptance tests remain blocked until a second test account is supplied/authorized.
- All six coin packages remain enabled with `price_ngn=NULL`; there are zero purchase orders. Owner must set the intended NGN prices, configure `PAYSTACK_SECRET_KEY` only in Supabase Edge Function secrets, register the webhook and `charge.success`/`charge.failed` events, then test signed success/failure/replay. Secret presence in Supabase Edge Function secrets is not exposed by the available control plane.
- Vercel environment listing shows only the two public client variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; no server/payment secrets were requested or decrypted.
- Google and Apple auth flags are both false. Owner must configure provider credentials and redirect URLs in Supabase Auth and test the providers before enabling them.
- Supabase organization is on the Free plan; leaked-password protection remains disabled. Owner must approve the required Pro-or-higher plan upgrade and enable the Auth setting.
- No rewarded-ad provider or server-verifiable completion callback exists. Keep BC ad payouts disabled.
- Remaining tests: two-account authentication, confessions/feed/report/moderation, message requests/DMs, BC rewards/deductions, Paystack/webhook, dating 72-hour/1-BC rules, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications and admin controls; also direct browser, Android/desktop, media upload, refresh persistence, responsive layout, console/network smoke tests.

**Release status remains NOT COMPLETE.** Do not mark 100% until the owner configuration and critical acceptance tests above have passing evidence.

## Latest continuation — 2026-11-09

### Verified again
- Supabase project `chcyncvieekjousgzlrg` was checked first: **ACTIVE_HEALTHY**, `eu-west-1`; read-only SQL connectivity succeeded.
- Migration ledger and repository tree reconcile exactly: **153/153**, no missing, extra, duplicate or version/name mismatch. No migration was applied.
- Owner account remains admin and permanent VIP: `user_roles.role='admin'`, `profiles.is_vip=true`, `profiles.vip_expires_at=NULL`. No credentials changed.
- Public database: 78/78 base tables have RLS, 104 policies, 9/9 views use `security_invoker=true`; no anon table write grants/policies and no authenticated elevated table privileges. Sensitive profile column grants remain absent.
- Storage: four buckets / 14 policies. Public image buckets: crush-post-photos and event-covers (5 MiB); private buckets: dating-profile-photos (5 MiB) and group-media (50 MiB, allowed image/video/audio types). Realtime publishes 22 tables including notifications.
- SECURITY DEFINER: 158 total, 158 pinned search paths, zero PostgreSQL PUBLIC EXECUTE grants, 137 authenticated-callable and one anon-callable read-only provider-settings getter. Four authenticated-callable no-`auth.uid()` functions are read-only catalog/schedule/provider getters. No authenticated-callable `admin_*` definer was found without an admin-role guard. The legacy author-ID confession RPC is service-role-only.
- All three Edge Functions are ACTIVE and live source matches GitHub byte-for-byte: signup v7, purchase initializer v2, Paystack webhook v2. No secrets were read or changed.
- Security advisor: four intentional internal no-direct-policy notices, one public read-only provider getter warning, 137 authenticated-callable definer warnings, leaked-password protection disabled. Performance advisor: seven reviewed SELECT-policy overlaps and 101 unused-index INFO notices. Health advisor: no findings.
- Rewarded-ad claim rejects `ad_reward`; do not enable payouts without a trusted provider completion callback.
- Six coin packages (100, 300, 700, 1,200, 2,500, 5,000 BC) are enabled but all prices are NULL; zero purchase orders. Google/Apple provider flags are false. Auth currently has only the owner account.

### Group chat implementation and release checks
- Two failed group-chat deployments were traced to TypeScript errors: missing `coinBalance` in the Groups route and unused `showGroupSettings`. App commit `6812e7f397c2554f81782d8ca18dc9eee5b6aee9` fixes both and is Vercel **READY**.
- Added a ninth regression test covering the full-screen group chat layout, BC balance and creator/admin management controls. CI [run #42597096673](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42597096673) passed **9/9 tests**, dependency install and production build.
- Latest app deployment: `dpl_AtxcccZP9YKrVkQUweYDQFEr4aoK`, production alias `circle-panda-ai.vercel.app`, `aliasError=null`. Vercel runtime error aggregation: no errors in the last 24 hours.
- Build assets: main JS 430.25 KB (122.57 KB gzip); CSS 288.84 KB (56.04 KB gzip); deferred location client chunk 303.40 KB (76.98 KB gzip). Country data is dynamically imported; city/area lists are loaded only when the area field opens. The former ~8 MB monolithic city bundle is absent.
- Direct HTTP/browser rendering could not be verified because external web access returned an internal/access error. Control-plane alias verification is not browser acceptance.

### Open launch gates
1. Owner sets the six intended NGN coin prices, configures Paystack secret only in Supabase Edge Function secrets, registers webhook plus `charge.success`/`charge.failed`, then provides a safe window for signed success/failure/replay tests.
2. Owner configures Google and Apple OAuth credentials and redirect URLs in Supabase Auth, then verifies each provider before enabling the corresponding flags.
3. Owner completes the plan/settings action required to enable leaked-password protection; the Auth advisor still reports it disabled.
4. Owner chooses/configures a rewarded-ad provider with a server-verifiable completion callback. Keep BC ad payout blocked until then.
5. Supply/authorize a second disposable test account or a non-production test environment. Production Auth currently has one user; no production test user was created. Two-account journeys remain untested.
6. Run authenticated acceptance tests for signup/login/recovery, confession/feed/report/moderation, message requests/DM, BC earn/spend, Paystack, dating 72-hour/1-BC, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications and admin controls.
7. Complete real Android and desktop browser smoke tests for rendering, responsive layouts, media upload, refresh persistence, console and network errors.

**Release status remains NOT COMPLETE.** No critical gate is marked passed without direct evidence.


## Latest continuation — 2026-11-10: VIP privacy, signup verification, CI and live alias evidence

### Newly closed defect
- Fixed a real VIP privacy leak: before the migration, any signed-in non-VIP identity could enumerate the VIP group metadata and its member row even though the group-chat RPC correctly denied entry.
- Migration applied and committed: `20261110091200_restrict_vip_group_discovery_to_eligible_members.sql`.
- The new private `private.can_view_group(uuid)` helper enforces active VIP expiry, admin bypass, worldwide/country scope and saved-country matching. Broad SELECT policies on `chat_groups` and `group_members` were replaced.
- Transactional, rolled-back policy tests passed: non-VIP sees zero VIP group/member rows while still seeing ordinary groups; the permanent VIP profile sees the worldwide room even when its admin role is temporarily removed inside the transaction; admin sees the room. No test data or role changes were committed.
- Migration reconciliation now stands at **154/154 applied/file matches**.

### Current verified baseline
- Supabase project is `ACTIVE_HEALTHY`; SQL connectivity succeeds.
- Public tables/RLS: **78/78**; public policies: **104**; security-invoker views: **9/9**.
- Storage: **4 buckets / 14 policies**; Realtime: **22 tables**.
- Public SECURITY DEFINER functions: **158**, all pinned search paths; zero PUBLIC EXECUTE; one anon-callable read-only auth-provider getter; 137 authenticated-callable functions.
- Admin `circlepandaapp@gmail.com`: `role=admin`, permanent VIP `is_vip=true`, `vip_expires_at=NULL`. Credentials unchanged.
- Edge Functions ACTIVE: signup v7, purchase initializer v2, Paystack webhook v2.
- Advisors: security — 4 intentional internal RLS/no-policy INFO, 1 public read-only getter WARN, 137 authenticated-callable SECURITY DEFINER WARN, leaked-password protection WARN; performance — 7 multiple-permissive-policy WARN and 96 unused-index INFO; health — no findings.

### New release blocker: signup contact ownership
- The public signup Edge Function sets `email_confirm=true` or `phone_confirm=true` via service-role account creation without an email/SMS ownership challenge. Input validation and rate limiting do not prove control of the identifier.
- Before public launch, implement and configure genuine email/phone verification, or explicitly accept and document the impersonation risk. This run did not change signup behavior because the verification flow needs provider configuration and coordinated UI changes.

### Application, CI and deployment
- Corrected daily-reward wallet wording to match the explicit claim button; no reward logic or amounts changed.
- Added tests for daily claim copy and VIP group privacy. CI run [#42788762821](https://github.com/musicpromo4444/circle-panda-AI/actions/runs/42788762821) passed **11/11 tests**, dependency installation and production build.
- Latest production deployment `dpl_2ujsofSuAiU2tq5e7MCH1CmzsbC4` is **READY**, commit `6b562f04edacb751df70eb12947198524346eb2d`, with production alias `circle-panda-ai.vercel.app` and no alias error.
- Live HTTP fetch: root HTML **200**; main JS, React vendor, Supabase vendor and CSS assets **200**. Runtime error aggregation: no errors in the previous 24 hours.
- Main bundle **430.16 KB / 122.51 KB gzip**; deferred location chunk **303.40 KB / 76.98 KB gzip**; the former ~8 MB monolithic city bundle remains absent.
- Static HTTP success is not an interactive browser test. Android/desktop smoke, media upload, refresh persistence, responsive and console/network acceptance remain open.

### Owner-controlled launch actions still required
1. Set the six intended NGN coin-package prices; configure Paystack secret only in Supabase Edge Function secrets; register webhook events and complete real signed success/failure/replay tests.
2. Configure Google and Apple OAuth credentials and redirect URLs before enabling either provider.
3. Approve the required Supabase Pro-or-higher plan/settings action and enable leaked-password protection.
4. Configure an email/SMS verification provider and replace the unverified-contact signup behavior, or explicitly accept that risk.
5. Configure a rewarded-ad provider with a server-verifiable completion callback. Until then, keep BC ad payouts disabled.
6. Provide/authorize a second disposable test account or a safe staging environment for genuine two-account acceptance; do not create production test accounts without approval.
7. Complete interactive Android and desktop acceptance across authentication, feed/confessions/reports/moderation, requests/DMs, wallet, Paystack, dating, groups/VIP, events/blasts, WCW/MCM, Hot Seat, notifications and admin controls.

**Production completion remains open.** Do not mark 100% until all critical owner configuration, verified-contact, two-account and device acceptance gates have passing evidence.
