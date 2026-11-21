import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261120080500_daily_activity_success_gate.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/components/DailyActivitiesFeature.tsx', import.meta.url), 'utf8');

test('expired attempts clear the persisted success bit before a fresh round', () => {
  const startFunction = migration.match(/create or replace function public\\.start_daily_activity\\([\\s\\S]*?\\$function\\$;/i)?.[0] ?? '';
  assert.ok(startFunction, 'start_daily_activity override must be present');
  assert.match(startFunction, /now\\(\\)\\s*-\\s*v_attempt\\.started_at\\s*>\\s*interval '30 minutes'/i);
  assert.match(startFunction, /set started_at = now\\(\\),\\s*action_count = 0,\\s*successful = false/i);
  assert.match(startFunction, /security definer[\\s\\S]*?set search_path = ''/i);
});

test('expired skill-check submissions show a restart action instead of a stale claim action', () => {
  assert.match(component, /setAttemptExpired\\(expired && \\[?'panda_cup_shuffle'[\\s\\S]*?'panda_puzzle'\\]?\\.includes\\(selected\\.activity_key\\)\\)/);
  assert.match(component, /attemptExpired\\?<>[\\s\\S]*?Round expired[\\s\\S]*?restartExpiredActivity/);
  assert.match(component, /Start a fresh round/);
});

test('restart uses the authenticated activity-start RPC and resets local round state', () => {
  assert.match(component, /async function restartExpiredActivity\\(\\)/);
  assert.match(component, /rpc\\('start_daily_activity',\\{p_activity_key:selected\\.activity_key\\}\\)/);
  assert.match(component, /setAttemptExpired\\(false\\);\\s*setGameStep\\(0\\);\\s*setGameResult\\(''\\)/);
});

test('BC completion remains independently gated by the persisted success flag', () => {
  assert.match(migration, /if v_key in \\('panda_cup_shuffle', 'panda_target', 'panda_puzzle'\\)\\s+and not coalesce\\(v_attempt\\.successful, false\\) then/i);
  assert.match(migration, /update public\\.wallet_accounts[\\s\\S]*?bc_balance = bc_balance \\+ v_reward/i);
});
