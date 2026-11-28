import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../docs/daily-activities-security-audit.sql', import.meta.url), 'utf8');

test('security audit is read-only', () => {
  assert.match(sql, /READ-ONLY/i);
  const executable = sql.split(String.fromCharCode(10)).filter(line => !line.trim().startsWith('--')).join(String.fromCharCode(10));
  const mutationStatement = /^\s*(insert\s+into|update\s+[\w.]+\s+set|delete\s+from|alter\s+(table|function)|drop\s+|create\s+|grant\s+|revoke\s+|truncate\s+[\w.]+)\b/im;
  assert.equal(mutationStatement.test(executable), false, 'SQL contains a mutation statement');
});

test('attempt write audit includes anon/authenticated and destructive privileges', () => {
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      assert.ok(sql.includes(`has_table_privilege('${role}'`));
      assert.ok(sql.includes(`'${privilege}'`));
    }
  }
});

test('private answer-key audit covers both tables and both browser roles', () => {
  for (const table of ['daily_activity_skill_questions', 'daily_activity_sponsor_questions']) assert.ok(sql.includes(table));
  for (const role of ['anon', 'authenticated']) assert.ok(sql.includes(`('${role}')`));
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) assert.ok(sql.includes(privilege));
});

test('private answer table checks remain safe before migrations create the tables', () => {
  assert.ok(sql.includes('left join pg_class c'));
  assert.ok(sql.includes('table_exists'));
  assert.ok(sql.includes('coalesce(has_table_privilege(role_name, c.oid'));
  assert.ok(sql.includes('c.oid is null'));
});

test('RPC audit exposes missing functions, anon/public execute, and search path settings', () => {
  for (const fn of ['start_daily_activity','record_daily_activity_action','complete_daily_activity','get_daily_sponsor_guess','submit_daily_sponsor_guess','admin_manage_sponsor_campaign']) assert.ok(sql.includes(fn));
  assert.ok(sql.includes('p.oid is null'));
  assert.ok(sql.includes('security_definer'));
  assert.ok(sql.includes('anon_execute'));
  assert.ok(sql.includes('public_execute'));
  assert.ok(sql.includes('function_settings'));
  assert.ok(sql.includes('empty_search_path'));
  assert.ok(sql.includes("p.proconfig @> array['search_path=\"\"']"));
});

test('sponsor readiness requires two distinct sponsors and two active campaigns', () => {
  assert.ok(sql.includes('count(*) >= 2'));
  assert.ok(sql.includes('count(distinct lower(trim(sponsor_name))) >= 2'));
  assert.ok(sql.includes("format = 'sponsor_reveal'"));
});
