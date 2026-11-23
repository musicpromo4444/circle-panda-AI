# Sponsor campaign administration

## Purpose

The Admin dashboard now creates and changes sponsor campaign status through the audited `admin_manage_sponsor_campaign` RPC. The browser no longer writes directly to `public.sponsor_campaigns`.

## Supported campaign formats

The form uses the database constraint's exact values:

- `direct_sponsor`
- `native`
- `sponsor_reveal`
- `banner`
- `interstitial`
- `playable`
- `rewarded`

The previous UI values `feed_card`, `rewarded_video`, and `event_sponsor` did not match the database constraint and have been removed.

## Campaign lifecycle

- Creation always produces a `draft`.
- `draft -> active`
- `active -> paused` or `active -> completed`
- `paused -> active` or `paused -> completed`
- `completed` is terminal.
- An expired campaign or a campaign that has already reached its impression target cannot be reactivated.

Every successful create or status change writes an `admin_audit_log` record. The RPC derives the actor from `auth.uid()`; it never trusts a client-supplied `created_by` value.

## Validation and security

- Requires a signed-in account with an explicit `user_roles.role = 'admin'` row.
- Uses `SECURITY DEFINER` with an empty search path and an explicit administrator check.
- RPC execution is granted only to `authenticated`; `PUBLIC`, `anon`, and `service_role` are revoked.
- Direct INSERT, UPDATE, and DELETE privileges on `sponsor_campaigns` are revoked from browser roles. Authenticated SELECT remains available under the existing RLS policies.
- Campaign names are limited to 160 characters; descriptions to 2,000; countries to 1–20 values of at most 80 characters each.
- Budget, CPM, and target impressions must be positive; the end time must follow the start time.
- Optional destination URLs must use HTTPS.

The existing RLS policies continue to expose only currently active campaigns to ordinary signed-in members and all campaign rows to administrators.

## Guess Sponsor dependency

Guess Sponsor needs at least two distinct active `sponsor_reveal` sponsors whose schedules include the current time. Creating a campaign does not automatically activate it. Administrators must publish separate real sponsor records and activate them. No campaign names or answer data are seeded by this change.

## Rollout

This migration is additive and is committed after the two pending daily-activity migrations. Roll out in this order:

1. Deploy the matching Circle Panda frontend from the feature branch.
2. Apply `20261120080500_daily_activity_success_gate`.
3. Apply `20261122082300_secure_guess_sponsor_daily_activity`.
4. Apply `20261123081000_secure_sponsor_campaign_admin_workflow`.
5. Verify the admin role can create a draft, activate, pause, reactivate, and complete campaigns; verify a non-admin cannot invoke the RPC.
6. Publish at least two distinct active Sponsor Reveal campaigns before testing Guess Sponsor.

The live database was inspected on 2026-11-23 and has 158 migrations through `20261117080355`. These three feature-branch migrations remain unapplied until the matching frontend rollout is approved.

## References

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
