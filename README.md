# Circle Panda AI Rebuild

A rebuild of Circle Panda using React, TypeScript, Vite, and Supabase.

## Project boundaries

- Work only in this repository and the `Circle Panda Rebuilt` Supabase project.
- This rebuild is separate from the old SekuPanda application and database.
- Never commit Supabase service-role keys, Paystack secrets, OAuth secrets, or user passwords.
- Database schema changes belong in `supabase/migrations/` and must be applied only to the rebuild project.

## Supabase project

- Project ref: `chcyncvieekjousgzlrg`
- Region: `eu-west-1`
- API URL: `https://chcyncvieekjousgzlrg.supabase.co`

## Current status

The rebuilt database is online and healthy. The live schema includes the core social, messaging, wallet, dating, groups, events, WCW/MCM, Hot Seat, moderation, and daily-activity systems. RLS is enabled on all 78 public base tables, and security-sensitive writes are handled through transactional RPCs with signed-in, ownership, membership, or admin checks as appropriate.

The owner account `circlepandaapp@gmail.com` is an administrator and permanent VIP in the rebuild project (`profiles.is_vip=true`, `profiles.vip_expires_at=NULL`). The three registered Supabase Edge Functions are `create-panda-account`, `initialize-coin-purchase`, and `paystack-webhook`.

The latest verified production application commit before the current CI guardrail update is `b2cb72f01e6e0fdefa726a32b5fc7def58267b8b`; its deployment reached **READY** and is aliased to:

- https://circle-panda-ai.vercel.app

The large all-countries city-data bundle has been replaced by country-scoped lazy chunks, and secondary feature panels are lazy-loaded; the main JavaScript chunk was 426.07 KB minified (121.45 KB gzip) in the last recorded build. The live database and repository have **153/153** migration versions reconciled. The notification inbox uses user-scoped reads and Realtime updates. Anonymous confession reads use the privacy-safe `feed_posts_public` view.

The production build is not, by itself, proof that all user journeys or payment integrations have passed acceptance testing. All six BC coin packages still need owner-set NGN prices before checkout can be tested. Paystack credentials and signed-webhook testing, Google/Apple OAuth credentials, a verifiable rewarded-ad callback, leaked-password protection, and authenticated two-account plus mobile/desktop smoke tests remain launch gates. See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) for the evidence-based checklist.

## Local development

1. Copy `.env.example` to `.env.local` and set the Supabase URL and publishable/anon key.
2. Run `npm install`.
3. Run `npm test` for release/security contract checks.
4. Run `npm run dev`.
5. Run `npm run build` to type-check and create a production build.

GitHub Actions runs the release/security contract tests and production build on pushes and pull requests.
