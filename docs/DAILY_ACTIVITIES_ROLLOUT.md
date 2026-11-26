# Daily Activities rollout verification (read-only)

Run this script in the Supabase SQL editor against **Circle Panda Rebuilt** only (`chcyncvieekjousgzlrg`) after the matching frontend is deployed and the four pending migrations are applied in timestamp order.

It is intentionally read-only. It does not modify data, permissions, schema, wallets, campaign rows, or migration history.

## Checks

1. Required migration ledger entries.
2. Skill attempt `successful` column.
3. Private skill and sponsor answer-key tables.
4. Authenticated table-write privileges (must be absent).
5. Authenticated RPC execute grants and anonymous grants (must be absent).
6. Sponsor Reveal campaign readiness (two distinct eligible sponsors required).

Each query returns evidence rows; any missing migration, missing object, unexpected grant, or insufficient sponsor readiness should be treated as a rollout blocker. The script cannot substitute for authenticated acceptance tests.

## After checks

Use two real test accounts (admin and member) to exercise: one-answer skill games; correct/wrong answer; duplicate submissions; expired-round reopen; Guess Sponsor correct/wrong; direct completion RPC rejection after wrong answer; wallet and XP ledger verification; campaign lifecycle and non-admin denial. Avoid production BC claims while testing—use approved test accounts and confirm the test environment before reward testing.
