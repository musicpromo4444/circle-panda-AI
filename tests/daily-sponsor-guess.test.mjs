import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261122082300_secure_guess_sponsor_daily_activity.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/components/DailyActivitiesFeature.tsx', import.meta.url), 'utf8');

function functionBody(name) {
  const start = migration.indexOf('create or replace function public.' + name + '(');
  if (start < 0) return '';
  const end = migration.indexOf('$function$;', start);
  return end < 0 ? '' : migration.slice(start, end + '$function$;'.length);
}

test('sponsor answer key is stored in a private, RLS-enabled table with no client grants', () => {
  assert.match(migration, /create table if not exists private\.daily_activity_sponsor_questions/i);
  assert.match(migration, /alter table private\.daily_activity_sponsor_questions enable row level security/i);
  assert.match(migration, /revoke all on table private\.daily_activity_sponsor_questions from public, anon, authenticated/i);
  assert.match(migration, /target_campaign_id uuid references public\.sponsor_campaigns/i);
  assert.match(migration, /target_sponsor_name text not null/i);
});

test('a new attempt requires a live Sponsor Reveal campaign and two distinct active sponsors', () => {
  const guard = functionBody('require_active_sponsor_reveal_for_daily_attempt');
  assert.ok(guard, 'attempt insert guard must exist');
  assert.match(guard, /c\.status = 'active'[\s\S]*?c\.starts_at <= now\(\)[\s\S]*?c\.ends_at > now\(\)/i);
  assert.match(guard, /c\.format = 'sponsor_reveal'/i);
  assert.match(guard, /count\(distinct lower\(trim\(c\.sponsor_name\)\)\)/i);
  assert.match(guard, /at least one other active sponsor/i);
});

test('the choices RPC returns options and answer state but never the target key', () => {
  const getGuess = functionBody('get_daily_sponsor_guess');
  assert.ok(getGuess, 'get_daily_sponsor_guess must exist');
  assert.match(getGuess, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(getGuess, /auth\.uid\(\)/i);
  assert.match(getGuess, /'options', to_jsonb\(v_question\.option_sponsor_names\)/i);
  assert.match(getGuess, /'answered', v_question\.answered_at is not null/i);
  assert.doesNotMatch(getGuess, /'target_campaign_id'\s*,|'target_sponsor_name'\s*,/i);
});

test('one submitted choice is checked against the private target and persisted server-side', () => {
  const submit = functionBody('submit_daily_sponsor_guess');
  assert.ok(submit, 'submit_daily_sponsor_guess must exist');
  assert.match(submit, /v_question\.answered_at is not null/i);
  assert.match(submit, /unnest\(v_question\.option_sponsor_names\)/i);
  assert.match(submit, /v_correct := lower\(trim\(p_sponsor_name\)\) = lower\(trim\(v_question\.target_sponsor_name\)\)/i);
  assert.match(submit, /set answered_at = now\(\)/i);
  assert.match(submit, /successful = v_correct/i);
  assert.match(submit, /'correct', v_correct/i);
});

test('the completion trigger blocks BC completion after a wrong or missing sponsor answer', () => {
  const guard = functionBody('enforce_daily_sponsor_guess_success');
  assert.ok(guard, 'completion guard must exist');
  assert.match(migration, /before insert on public\.user_daily_activity_completions/i);
  assert.match(guard, /new\.activity_key <> 'guess_sponsor'/i);
  assert.match(guard, /not coalesce\(v_success, false\)/i);
  assert.match(guard, /Identify the featured sponsor correctly before claiming this BC reward/i);
});

test('public RPC execution is limited to authenticated users', () => {
  assert.match(migration, /revoke all on function public\.get_daily_sponsor_guess\(\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_daily_sponsor_guess\(\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.submit_daily_sponsor_guess\(text\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.submit_daily_sponsor_guess\(text\) to authenticated/i);
});

test('frontend loads server-provided sponsor choices and submits through the secure RPC', () => {
  assert.match(component, /rpc\('get_daily_sponsor_guess'\)/i);
  assert.match(component, /rpc\('submit_daily_sponsor_guess',\{p_sponsor_name:choice\}\)/i);
  assert.match(component, /sponsorOptions\.map\(choice/);
  assert.doesNotMatch(component, /Sponsor option A|Sponsor option B|Sponsor option C/);
});

test('wrong sponsor guesses never show the BC claim path or a retry that permits brute force', () => {
  assert.match(component, /setGameStep\(result\.correct===true\?1:5\)/);
  assert.match(component, /gameStep===5\?/);
  assert.match(component, /one sponsor guess/i);
  assert.match(component, /No BC was awarded/i);
});
