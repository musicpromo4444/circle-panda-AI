import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261120080500_daily_activity_success_gate.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/components/DailyActivitiesFeature.tsx', import.meta.url), 'utf8');

test('existing attempts are preserved while new attempts begin unsuccessful', () => {
  assert.match(migration, /add column if not exists successful boolean not null default true/i);
  assert.match(migration, /alter column successful set default false/i);
});

test('only a server-confirmed correct skill answer marks an attempt successful', () => {
  assert.match(migration, /successful\s*=\s*case[\s\S]*?coalesce\(successful, false\)\s+or\s+v_correct/i);
  assert.match(migration, /p_activity_key in \('panda_cup_shuffle', 'panda_target', 'panda_puzzle'\)/i);
  assert.match(migration, /'correct', v_correct/i);
});

test('daily BC completion rejects an unsolved skill-check attempt server-side', () => {
  assert.match(
    migration,
    /if v_key in \('panda_cup_shuffle', 'panda_target', 'panda_puzzle'\)\s+and not coalesce\(v_attempt\.successful, false\) then\s+raise exception/i
  );
  assert.match(migration, /update public\.wallet_accounts[\s\S]*bc_balance = bc_balance \+ v_reward/i);
});

test('attempt rows remain readable by authenticated owners but not directly writable by clients', () => {
  assert.match(migration, /revoke all on table public\.user_daily_activity_attempts from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.user_daily_activity_attempts to authenticated/i);
  assert.match(migration, /user_daily_activity_attempts[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
});

test('frontend offers retry, not reward claim, after an incorrect answer', () => {
  assert.match(component, /requiresCorrectAnswer=\['panda_cup_shuffle','panda_target','panda_puzzle'\]/);
  assert.match(component, /requiresCorrectAnswer && result\.correct!==true/);
  assert.match(component, /setGameStep\(4\);setBusy\(false\);return;/);
  assert.match(component, /gameStep===4\?<>/);
  assert.match(component, /Try another choice/);
  assert.match(component, /complete_daily_activity/);
});
