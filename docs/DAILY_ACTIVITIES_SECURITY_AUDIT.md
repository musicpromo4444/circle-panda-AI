# Daily Activities security release gate

This supplemental audit is a read-only SQL checklist for the new Circle Panda project (`chcyncvieekjousgzlrg`). It is not a UI feature, so it uses a documented SQL-runner integration contract: an authorized operator runs it in the Supabase SQL editor after deploying the matching frontend and applying migrations in order. No browser API or privileged secret is involved.

## Expected evidence

- Attempts table: anon/authenticated must not have INSERT, UPDATE, DELETE, or TRUNCATE.
- Private answer-key tables: browser roles must have no table privileges. The audit also works before those tables exist and reports `table_exists=false`.
- Required RPCs: existence, intended authenticated EXECUTE, no anon/PUBLIC EXECUTE, and security settings are surfaced.
- Private schema: browser-role USAGE is surfaced.
- Guess Sponsor: readiness requires at least two active campaigns and at least two distinct sponsor names.

The SQL intentionally reports values instead of asserting pass/fail inside SQL. Operators must compare the evidence with the expected posture. Do not apply migrations or alter grants through this checker.

## Rollout order

1. Deploy frontend that uses the secure RPC contract.
2. Apply reviewed migrations in timestamp order in the new project only.
3. Run this audit and the existing read-only rollout checker.
4. Use approved test accounts to exercise correct/wrong answers, duplicate attempts, expiration, direct reward-RPC rejection and wallet/XP ledger.
5. Enable Sponsor Guess only when genuine campaigns meet the readiness query.

## Current known live state (inspected 2026-11-28)

The project is healthy; the migration ledger contains 158 entries, latest `20261117080355`. The four Daily Activities security migrations discussed in the rollout are not applied. Attempts-table direct client writes remain available, and no Sponsor Reveal campaigns are present. The answer-key-table section of this audit is designed to report missing tables safely before and after migration.

## References

- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
