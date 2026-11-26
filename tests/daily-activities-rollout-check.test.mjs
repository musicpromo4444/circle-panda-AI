import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../docs/daily-activities-rollout-check.sql', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../docs/DAILY_ACTIVITIES_ROLLOUT.md', import.meta.url), 'utf8');

test('rollout SQL is read-only and contains no data/schema mutations', () => {
  assert.ok(sql.toLowerCase().includes('read-only'));
  const executable = sql.split('\\n').filter(line => !line.trim().startsWith('--')).join('\\n');
  assert.equal(/\\b(insert|update|delete|alter|drop|create|grant|revoke|truncate)\\s+/i.test(executable), false);
  assert.ok(sql.includes('select version, name'));
  assert.ok(sql.includes('schema_migrations'));
});

test('verification checks migration ledger and private answer tables', () => {
  for (const version of ['20261120080500','20261122082300','20261123081000','20261124082300']) assert.ok(sql.includes(version));
  assert.ok(sql.includes('daily_activity_skill_questions'));
  assert.ok(sql.includes('daily_activity_sponsor_questions'));
});

test('verification checks direct client write and RPC ACL posture', () => {
  assert.ok(sql.includes("has_table_privilege('authenticated'"));
  assert.ok(sql.includes("has_function_privilege('anon'"));
  assert.ok(sql.includes('function_settings'));
});

test('sponsor readiness threshold is explicit and rollout guide includes acceptance tests', () => {
  assert.ok(sql.includes('distinct_active_sponsors'));
  assert.ok(sql.includes('>= 2'));
  assert.ok(guide.toLowerCase().includes('two real test accounts'));
  assert.ok(guide.toLowerCase().includes('wrong answer'));
  assert.ok(guide.toLowerCase().includes('wallet and xp'));
});
