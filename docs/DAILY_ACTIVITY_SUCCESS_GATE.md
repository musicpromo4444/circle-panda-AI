# Daily activity correct-answer gate

## Behavior

The three skill-check activities — Panda Cup Shuffle, Panda Target, and Panda Puzzle — now require a correct answer before their configured daily BC reward can be claimed.

- The database chooses the target and returns the result from `record_daily_activity_action`.
- A correct answer is persisted on the user's current attempt in `user_daily_activity_attempts.successful`.
- A wrong answer leaves the attempt unsuccessful. The UI shows the server result and offers another choice; it does not show the reward-claim action.
- `complete_daily_activity` independently checks the persisted success flag before writing the completion, wallet transaction, or XP award. A modified client cannot bypass this check.
- Existing in-flight attempts are grandfathered as successful during the additive migration. New attempts default to unsuccessful. This avoids stranding sessions created before rollout while ensuring all new rounds are checked.
- The existing 20-action attempt limit and 30-minute attempt recovery remain in force. When an expired attempt is restarted, the server resets both `action_count` and `successful=false`, so a correct answer from an old round cannot carry into a fresh attempt. The frontend offers a restart action only after the server reports expiration.

The change does not alter Coin Drop, Panda Slots, sponsor playback verification, the daily schedule, reward amounts, or the BC wallet ledger.

## Database security

The migration keeps the existing owner-scoped SELECT RLS policy on `user_daily_activity_attempts`, revokes direct browser table writes from `PUBLIC`, `anon`, and `authenticated`, and leaves writes to the existing authenticated workflow RPCs. Both modified functions retain `SECURITY DEFINER`, an explicit `auth.uid()` check, and an empty search path; all application relations are schema-qualified.

## Rollout order

1. Deploy the frontend from the feature branch after review.
2. Apply `20261120080500_daily_activity_success_gate` to project `chcyncvieekjousgzlrg`.
3. Verify the column default, function definitions/grants, and RLS/privilege snapshot.
4. Test one wrong answer, one correct answer, a direct RPC reward attempt after a wrong answer, and a successful BC ledger credit using two provisioned authenticated test accounts or a dedicated test account.

The migration is committed but intentionally not applied to the live project from this development branch. Applying it before the matching frontend is deployed would leave older clients showing a claim action that the server correctly rejects.

## References

- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
