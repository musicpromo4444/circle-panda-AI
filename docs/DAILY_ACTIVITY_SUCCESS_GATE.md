# Daily activity reward validation

## Skill-check activities

Panda Cup Shuffle, Panda Target, and Panda Puzzle require a correct answer before their configured daily BC reward can be claimed.

- The database chooses the target and returns the result from `record_daily_activity_action`.
- A correct answer is persisted on the user's current attempt in `user_daily_activity_attempts.successful`.
- A wrong answer leaves the attempt unsuccessful. The UI offers another choice; it does not show the reward-claim action.
- `complete_daily_activity` independently checks the persisted success flag before writing the completion, wallet transaction, or XP award.
- Existing in-flight attempts are grandfathered during the additive migration; new attempts default to unsuccessful.
- The existing 20-action limit and 30-minute recovery remain in force. An expired attempt resets both `action_count` and `successful=false`.

## Guess Sponsor

Guess Sponsor now uses real sponsor-campaign records rather than placeholder choices.

- An eligible answer is selected from an active `sponsor_campaigns` row whose format is `sponsor_reveal`, whose status is `active`, and whose start/end window contains the current time.
- The answer options are distinct sponsor names from active sponsor campaigns. At least two distinct active sponsor names and one active Sponsor Reveal campaign are required.
- The answer key and option snapshot are stored in `private.daily_activity_sponsor_questions`. Client roles have no table privileges; RLS is enabled with no client policies.
- `get_daily_sponsor_guess()` is an authenticated `SECURITY DEFINER` RPC with an empty search path. It returns the question and choices, never the target campaign or correct sponsor.
- `submit_daily_sponsor_guess(text)` accepts one choice per attempt. It verifies that the choice belongs to the returned options and that the target Sponsor Reveal campaign is still active. The server persists `successful=true` only for the correct sponsor.
- A wrong guess consumes the one guess and earns no BC. Reopening an answered attempt restores the correct state: a successful answer can still be claimed; an incorrect answer cannot be retried.
- A trigger on `user_daily_activity_completions` independently blocks Guess Sponsor completion unless the current attempt has `successful=true`. The wallet transaction and BC credit remain in the existing `complete_daily_activity` workflow.
- The attempt-insert guard prevents starting Guess Sponsor when there is no active Sponsor Reveal campaign or fewer than two distinct active sponsors. It does not interfere with an already-existing attempt.

The live project was inspected before implementation and currently has **zero sponsor campaigns**. Guess Sponsor therefore remains unavailable until an admin publishes one active Sponsor Reveal campaign and at least one other active sponsor campaign. No sponsor names or answers are fabricated.

## Database security

The first migration, `20261120080500_daily_activity_success_gate`, adds the persisted success flag and closes direct browser writes on attempt rows. The follow-up migration, `20261122082300_secure_guess_sponsor_daily_activity`, depends on that column.

The private answer table has RLS enabled and no client policies, with all table privileges revoked from `PUBLIC`, `anon`, and `authenticated`. The two public RPCs explicitly require `auth.uid()`, use `SECURITY DEFINER` with `set search_path = ''`, and grant execution only to `authenticated`. Trigger functions are not directly executable by client roles.

## Rollout order

1. Review and deploy the matching frontend from the feature branch.
2. Apply `20261120080500_daily_activity_success_gate` first.
3. Apply `20261122082300_secure_guess_sponsor_daily_activity` second.
4. Publish one active Sponsor Reveal campaign and at least one other distinct active sponsor campaign.
5. Verify the options RPC does not reveal the answer key, a wrong guess cannot claim BC, a correct guess can claim once, and wallet/XP ledger writes occur only after the existing completion RPC succeeds.

Both migrations are committed to the feature branch and intentionally remain unapplied to the live project until the matching frontend rollout is reviewed.

## References

- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
