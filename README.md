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

The rebuilt database is online and healthy. All 78 public base tables have RLS enabled. The live migration ledger and committed repository migrations reconcile exactly at **153/153**. Storage has four buckets and 14 policies; 22 tables are published to Realtime, including notifications.

The owner account `circlepandaapp@gmail.com` remains an administrator and permanent VIP (`profiles.is_vip=true`, `profiles.vip_expires_at=NULL`). The three registered Supabase Edge Functions are `create-panda-account`, `initialize-coin-purchase`, and `paystack-webhook`.

The latest production deployment is `dpl_EtuR6RyFd8wUvdFkCeJQHHJZgphX`, built from commit `2f7a5fea92122ba2389841f6f0312d543b2c33dd`, and is **READY** with the verified alias:

- https://circle-panda-ai.vercel.app

The large all-countries city-data bundle has been replaced by country-scoped deferred chunks. The latest build's main JavaScript chunk is 429.92 KB minified (122.51 KB gzip). Secondary feature panels are lazy-loaded. GitHub Actions now runs eight release/security contract tests and the production build.

The production build is not, by itself, proof that all user journeys or payment integrations have passed acceptance testing. All six BC coin packages still need owner-set NGN prices before checkout can be tested. Paystack credentials and signed-webhook testing, Google/Apple OAuth credentials, a verifiable rewarded-ad callback, leaked-password protection, authenticated two-account tests, and browser/Android/desktop smoke tests remain launch gates. See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) and [BUILD_PROGRESS.md](BUILD_PROGRESS.md).

## Local development

1. Copy `.env.example` to `.env.local` and set the Supabase URL and publishable/anon key.
2. Run `npm install`.
3. Run `npm test` for release/security contract checks.
4. Run `npm run dev`.
5. Run `npm run build` to type-check and create a production build.

GitHub Actions runs the release/security contract tests and production build on pushes and pull requests.
