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

The rebuilt database is online and healthy. The live schema includes the core social, messaging, wallet, dating, groups, events, WCW/MCM, Hot Seat, moderation, and daily-activity systems. RLS is enabled across the application tables, and security-sensitive writes are handled through transactional RPCs with signed-in, ownership, membership, or admin checks as appropriate.

The owner account `circlepandaapp@gmail.com` is configured as an administrator and permanent VIP in the rebuild project. The three registered Supabase Edge Functions are `create-panda-account`, `initialize-coin-purchase`, and `paystack-webhook`.

The latest verified application-code deployment for commit `4c7b9043ed7e54866a4e59c5558e2565cf12927c` reached **READY** and is aliased to:

- https://circle-panda-ai.vercel.app

The large all-countries city-data bundle has been replaced by country-scoped lazy chunks, and secondary feature panels are lazy-loaded; the main JavaScript chunk is now 426.07 KB minified (121.45 KB gzip). The live database also includes migrations `20261106083427_fix_crush_vote_timezone_and_concurrency.sql` and `20261106084052_fix_event_blast_monthly_timezone.sql`, aligning WCW/MCM vote quotas and monthly free Event Blast eligibility to the user's profile timezone while serializing concurrent claims.\n\nThe production build is not, by itself, proof that all user journeys or payment integrations have passed acceptance testing. All six BC coin packages still need owner-set NGN prices before checkout can be tested. Paystack credentials and signed-webhook testing, Google/Apple OAuth credentials, a verifiable rewarded-ad callback, leaked-password protection, and authenticated two-account plus mobile/desktop smoke tests remain launch gates. See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) for the evidence-based checklist.

## Local development

1. Copy `.env.example` to `.env.local` and set the Supabase URL and publishable/anon key.
2. Run `npm install`.
3. Run `npm run dev`.
4. Run `npm run build` to type-check and create a production build.

GitHub Actions runs the production build on pushes and pull requests.
