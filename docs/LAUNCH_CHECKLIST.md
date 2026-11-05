# Circle Panda — production completion gate

Last checked: 2026-11-05
Repository: `musicpromo4444/circle-panda-AI`
Supabase rebuild project: `chcyncvieekjousgzlrg` (`eu-west-1`)
Production host: `https://circle-panda-ai.vercel.app`

## Verified from provider control planes

- GitHub main branch contains the new Circle Panda rebuild and its Supabase migration history through the 2026-10-28 migrations.
- Vercel's latest production deployment is READY and was built from main commit `12a16c4b71803e61eba8cc18d1993467c8eaf631` ("Add publish action for draft activity campaigns"). It is aliased to `circle-panda-ai.vercel.app`.
- Vercel project environment contains both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for production, preview and development. Secret values are intentionally not copied into this document.
- Three Supabase Edge Functions are registered ACTIVE: `create-panda-account`, `initialize-coin-purchase`, and `paystack-webhook`.
- Supabase project reports state `COMING_UP` after a restore request. A database table-list request and a harmless `SELECT current_database(), now()` probe both failed with "Database is possibly not accessible at the moment". Do not infer that the database is empty from the empty migration-list response while the database is unavailable.
- Supabase security/performance advisor calls returned no lints during this unavailable period; those results are not a valid substitute for a live database audit.

## Current release blockers (must clear before launch)

1. **Restore database availability.** Wait for Supabase project state to become healthy/available. Then verify SQL connectivity, public tables, migration history, extensions, RLS, grants, triggers, functions, storage buckets and Realtime publication.
2. **Reconcile migrations.** Compare the live migration ledger with every committed migration in `supabase/migrations/`. Apply only missing migrations, in order, after reviewing their effects. Do not blindly replay migrations.
3. **Run security review on the live database.** Re-run Supabase security and performance advisors; inspect all SECURITY DEFINER functions, RLS policies, storage policies, and exposed RPC grants.
4. **Verify the owner/admin account.** Confirm `circlepandaapp@gmail.com` has the intended admin role and permanent VIP in the rebuilt project, without exposing credentials or changing the account password.
5. **Configure external providers.**
   - Paystack: set the secret only in Supabase Edge Function secrets, register the webhook URL in Paystack, set enabled NGN coin-package prices, then test success, failure and webhook replay/idempotency.
   - Google/Apple: configure OAuth credentials and redirect URLs in Supabase Auth before enabling their admin toggles.
   - Rewarded ads: keep BC rewards disabled until an ad provider and server-verifiable completion callback are configured.
6. **Run authenticated end-to-end tests with at least two test accounts.** Test sign-up/login/recovery; confession create/read/react/comment/report; request/accept/decline and DM; BC earning/spending; dating profile/discovery/request/free period/paid messages/review; groups and VIP gates; event creation/attendance/blasts; WCW/MCM schedule/voting; Hot Seat host/viewer lifecycle, gifts, comments, questions and bids; notifications; admin settings and moderation.
7. **Production smoke test.** Open the production alias on Android and desktop; check routes, media uploads, refresh persistence, empty/error/loading states, mobile layouts, browser console and network errors. Verify deployment is publicly reachable and not protected by an unintended access gate.
8. **Performance pass.** Split the large deferred city-data bundle (historically ~8 MB minified) and measure initial route loading on a mobile connection.
9. **Release sign-off.** Confirm all critical flows pass, no unresolved high/critical security findings remain, backups/restore path are understood, and the live Paystack account is approved before enabling real-money purchases.

## Important operating rules

- Work only in the new `circle-panda-AI` repository and `Circle Panda Rebuilt` project.
- Never connect the old SekuPanda database or copy the old app UI.
- Never put service-role keys, Paystack secrets, OAuth secrets or user passwords in frontend variables, source control, issue comments or this document.
- A READY Vercel build proves compilation/deployment only; it does not prove the database or user journeys work.
- Do not mark the project 100% complete until every release blocker above has evidence of passing.
