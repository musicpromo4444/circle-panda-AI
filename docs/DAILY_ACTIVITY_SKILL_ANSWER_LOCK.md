# Daily skill challenge answer lock

## Scope

Panda Cup Shuffle, Panda Target, and Panda Puzzle now use a fixed server-selected answer for each daily attempt. The answer key is stored in `private.daily_activity_skill_questions`; the browser receives only the activity choices and the server's answered/success state.

## Why this is required

The earlier action RPC selected a new random target every time a member clicked. It also returned the selected target in the incorrect-answer message and allowed repeated guesses. That made the challenge predictable and allowed repeated submissions to turn a low-probability guess into an almost certain BC reward.

## Server behavior

- A target is generated once when the daily attempt starts and persisted by `attempt_id`.
- The private table has RLS enabled, no policies, and no grants to `PUBLIC`, `anon`, `authenticated`, or `service_role`.
- The action RPC locks the attempt and its private question, validates the submitted option against the activity's allowed choices, and records exactly one answer.
- A wrong answer is terminal for that daily cycle. It does not reveal the target, does not set the success flag, and cannot be retried by reopening the modal or calling the RPC again.
- A correct answer sets both the attempt success flag and the private answer record. The completion RPC checks both before it credits BC and XP.
- An expired unanswered attempt can be restarted with a new target. An answer already submitted (correct or incorrect) is preserved; restarting only refreshes the completion window and never grants another guess.
- The rollout resets unfinished skill attempts in the current cycle once, clearing any grandfathered success state from the earlier migration. Completed attempts are not changed.

## Frontend contract

`start_daily_activity` returns `challenge_answered` and `challenge_successful` for the three skill activities. The component fails closed if those fields are missing, so an older backend cannot accidentally run the former repeat-guess flow.

`record_daily_activity_action` returns `answered: true`, `correct`, `outcome`, and `can_retry: false`. The UI shows the claim action only after a correct server response. An incorrect answer displays the terminal daily-cycle state and no reward action.

## Migration and rollout

This migration depends on the success flag created by `20261120080500_daily_activity_success_gate` and must follow the sponsor and admin migrations on the same feature branch.

Apply the pending migrations in this order, only after the matching frontend rollout is approved:

1. `20261120080500_daily_activity_success_gate`
2. `20261122082300_secure_guess_sponsor_daily_activity`
3. `20261123081000_secure_sponsor_campaign_admin_workflow`
4. `20261124082300_lock_daily_skill_challenge_answers`

The live database was inspected on 2026-11-24 and still has 158 applied migrations through `20261117080355`. None of these four feature migrations was applied in this session. The live attempts table still permits direct browser writes until the first migration is applied; do not describe this feature as live-protected yet.

## Acceptance tests

Use authenticated test accounts after rollout:

- Start each of the three skill activities and confirm the target is not present in the RPC response or any exposed table.
- Submit a wrong answer and verify a second answer is rejected, including from a second tab and a direct RPC call.
- Verify the wrong response does not reveal the target and no BC or XP is credited.
- Submit a correct answer and verify only one completion, one wallet transaction, and the configured BC/XP award.
- Expire an unanswered round and confirm a new target is issued.
- Expire an answered round and confirm the same result is restored without a second guess.
- Verify the UI blocks the challenge while the secure response fields are missing.

## Supabase security references

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Securing your data](https://supabase.com/docs/guides/database/secure-data)
