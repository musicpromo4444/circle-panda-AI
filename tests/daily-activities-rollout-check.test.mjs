import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../docs/daily-activities-rollout-check.sql', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../docs/DAILY_ACTIVITIES_ROLLOUT.md', import.meta.url), 'utf8');

test('rollout SQL is read-only and contains no data/schema mutations', () => {
  assert.match(sql, /READ-ONLY/i);
  assert.doesNotMatch(sql, /\b(insert|update|delete|alter|drop|create|grant|revoke|truncate)\s+/i);
  assert.match(sql, /select version, name[\s\S]*schema_migrations/i);
});

test('verification checks migration ledger and private answer tables', () => {
  for (const version of ['20261120080500','20261122082300','20261123081000','20261124082300']) assert.ok(sql.includes(version));
  assert.match(sql, /daily_activity_skill_questions/);
  assert.match(sql, /daily_activity_sponsor_questions/);
});

test('verification checks direct client write and RPC ACL posture', () => {
  assert.match(sql, /has_table_privilege\('authenticated',[\s\S]*INSERT/i);
  assert.match(sql, /has_function_privilege\('anon',[\s\S]*EXECUTE/i);
  assert.match(sql, /function_settings/);
});

test('sponsor readiness threshold is explicit and rollout guide includes acceptance tests', () => {
  assert.match(sql, /distinct_active_sponsors[\s\S]*>= 2/i);
  assert.match(guide, /two real test accounts/i);
  assert.match(guide, /wrong answer/i);
  assert.match(guide, /wallet and XP/i);
});
