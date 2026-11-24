import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261124082300_lock_daily_skill_challenge_answers.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/components/DailyActivitiesFeature.tsx', import.meta.url), 'utf8');

function functionSql(name) {
  const start = migration.indexOf('create or replace function public.' + name);
  assert.notEqual(start, -1, 'missing function ' + name);
  const end = migration.indexOf('$function$;', start);
  assert.notEqual(end, -1, 'unterminated function ' + name);
  return migration.slice(start, end + '$function$;'.length);
}

test('skill answer keys live in a private RLS-protected table with no client grants', () => {
  assert.match(migration, /create table if not exists private\.daily_activity_skill_questions/i);
  assert.match(migration, /alter table private\.daily_activity_skill_questions enable row level security/i);
  assert.match(migration, /revoke all on table private\.daily_activity_skill_questions from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(migration, /grant\s+\w+\s+on\s+table\s+private\.daily_activity_skill_questions\s+to\s+(public|anon|authenticated|service_role)/i);
});

test('the rollout resets unfinished grandfathered skill attempts before issuing private targets', () => {
  assert.match(migration, /set started_at = now\(\),\s*action_count = 0,\s*successful = false[\s\S]*?a\.completed_at is null[\s\S]*?a\.activity_key in \('panda_cup_shuffle', 'panda_target', 'panda_puzzle'\)/i);
  assert.match(migration, /insert into private\.daily_activity_skill_questions[\s\S]*?on conflict \(attempt_id\) do nothing/i);
});

test('start creates one hidden target per attempt and reports only answer state', () => {
  const sql = functionSql('start_daily_activity');
  assert.match(sql, /select \* into v_question[\s\S]*?for update/i);
  assert.match(sql, /insert into private\.daily_activity_skill_questions/i);
  assert.match(sql, /'challenge_answered', v_challenge_answered/i);
  assert.match(sql, /'challenge_successful', v_challenge_successful/i);
  assert.doesNotMatch(sql, /'target_key'\s*,\s*v_question\.target_key/i);
  assert.doesNotMatch(sql, /'target'\s*,\s*v_question\.target_key/i);
});

test('an expired unanswered skill round gets a new target, but a submitted answer is preserved', () => {
  const sql = functionSql('start_daily_activity');
  assert.match(sql, /if v_question\.attempt_id is not null and v_question\.answered_at is not null then[\s\S]*?set started_at = now\(\)[\s\S]*?else[\s\S]*?action_count = 0, successful = false[\s\S]*?delete from private\.daily_activity_skill_questions/i);
});

test('skill answer validation reads the stored target rather than generating a new random target', () => {
  const sql = functionSql('record_daily_activity_action');
  const skillBranch = sql.slice(sql.indexOf("if p_activity_key in ('panda_cup_shuffle'"), sql.indexOf('\n  if v_attempt.action_count >= 20'));
  assert.match(skillBranch, /v_correct := p_action = v_question\.target_key/i);
  assert.doesNotMatch(skillBranch, /random\s*\(/i);
});

test('only one valid answer is accepted for each skill attempt', () => {
  const sql = functionSql('record_daily_activity_action');
  assert.match(sql, /if v_question\.answered_at is not null or coalesce\(v_attempt\.action_count, 0\) >= 1 then/i);
  assert.match(sql, /answered_at = now\(\),\s*is_correct = v_correct/i);
  assert.match(sql, /set action_count = 1,\s*successful = v_correct/i);
  assert.match(sql, /'can_retry', false/i);
});

test('incorrect-answer responses never disclose the stored target', () => {
  const sql = functionSql('record_daily_activity_action');
  assert.match(sql, /Not quite\. Your one answer for today has been used/i);
  assert.doesNotMatch(sql, /The target was|token was under|matching piece was/i);
  assert.doesNotMatch(sql, /v_outcome[^;]*v_question\.target_key/i);
});

test('BC completion requires both the persisted success flag and a correct private answer record', () => {
  const sql = functionSql('complete_daily_activity');
  assert.match(sql, /not coalesce\(v_attempt\.successful, false\) or not exists/i);
  assert.match(sql, /q\.answered_at is not null[\s\S]*?q\.is_correct = true/i);
  assert.match(sql, /update public\.wallet_accounts[\s\S]*bc_balance = bc_balance \+ v_reward/i);
  assert.match(sql, /insert into public\.wallet_transactions/i);
});

test('frontend fails closed until the secure challenge response is available', () => {
  assert.match(component, /typeof startState\.challenge_answered!=='boolean' \|\| typeof startState\.challenge_successful!=='boolean'/);
  assert.match(component, /result\.answered!==true/);
});

test('frontend locks an incorrect answer for the rest of the daily cycle', () => {
  assert.match(component, /setGameStep\(5\);setBusy\(false\);return;/);
  assert.match(component, /This daily challenge allows one answer per cycle/);
  assert.doesNotMatch(component, /setGameStep\(4\)/);
  assert.doesNotMatch(component, /Try another choice/);
});

test('frontend restores the server-recorded answer state when a member reopens a challenge', () => {
  assert.match(component, /startState\.challenge_answered===true/);
  assert.match(component, /startState\.challenge_successful===true/);
  assert.match(component, /skillAnswered \? \(skillSuccessful \? 1 : 5\) : 0/);
});
