import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261123081000_secure_sponsor_campaign_admin_workflow.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const adminSection = app.split('<section id="admin-sponsors"')[1]?.split('<section id="admin-moderation"')[0] ?? '';

function functionBody() {
  const start = migration.indexOf('create or replace function public.admin_manage_sponsor_campaign(');
  const end = migration.indexOf('$function$;', start);
  return start < 0 || end < 0 ? '' : migration.slice(start, end + '$function$;'.length);
}

const rpc = functionBody();

test('campaign management RPC is a tightly configured SECURITY DEFINER function', () => {
  assert.ok(rpc, 'admin_manage_sponsor_campaign must exist');
  assert.match(rpc, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.admin_manage_sponsor_campaign\([\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.admin_manage_sponsor_campaign\([\s\S]*?to authenticated/i);
});

test('the RPC derives the actor from auth.uid and rejects non-admin accounts', () => {
  assert.match(rpc, /v_uid uuid := auth\.uid\(\)/i);
  assert.match(rpc, /if v_uid is null then[\s\S]*?Sign in is required/i);
  assert.match(rpc, /from public\.user_roles r[\s\S]*?r\.user_id = v_uid[\s\S]*?r\.role = 'admin'/i);
  assert.match(rpc, /Administrator access required/i);
  assert.match(rpc, /created_by,[\s\S]*?v_uid/i);
  assert.doesNotMatch(rpc, /p_created_by|p_user_id/i);
});

test('campaign creation accepts only formats supported by the live database constraint', () => {
  for (const format of ['direct_sponsor', 'native', 'sponsor_reveal', 'banner', 'interstitial', 'playable', 'rewarded']) {
    assert.ok(rpc.includes(`'${format}'`), `missing supported format ${format}`);
    assert.ok(adminSection.includes(`value="${format}"`), `admin form must expose ${format}`);
  }
  for (const invalid of ['feed_card', 'rewarded_video', 'event_sponsor']) {
    assert.ok(!adminSection.includes(`value="${invalid}"`), `legacy invalid format ${invalid} must be removed`);
  }
});

test('campaign input is validated on the server, including HTTPS destinations and bounded countries', () => {
  assert.match(rpc, /char_length\(btrim\(p_sponsor_name\)\) not between 1 and 160/i);
  assert.match(rpc, /char_length\(btrim\(p_campaign_name\)\) not between 1 and 160/i);
  assert.match(rpc, /char_length\(btrim\(coalesce\(p_description, ''\)\)\) not between 1 and 2000/i);
  assert.match(rpc, /v_target_url !~\* '\^https:\/\/\[\^\[:space:\]\]\+\$'/i);
  assert.match(rpc, /cardinality\(v_countries\) not between 1 and 20/i);
  assert.match(rpc, /p_budget_naira <= 0[\s\S]*?p_cpm_naira <= 0/i);
  assert.match(rpc, /p_target_impressions < 1/i);
  assert.match(rpc, /p_ends_at <= p_starts_at/i);
});

test('campaign creator identity and initial draft status are server-controlled', () => {
  assert.match(rpc, /insert into public\.sponsor_campaigns[\s\S]*?created_by[\s\S]*?v_uid/i);
  assert.match(rpc, /p_starts_at,[\s\S]*?p_ends_at,[\s\S]*?p_budget_naira,[\s\S]*?p_cpm_naira,[\s\S]*?p_target_impressions,[\s\S]*?v_uid/i);
  assert.match(rpc, /'draft',[\s\S]*?p_starts_at/i);
  assert.match(rpc, /A new sponsor campaign must be created as a draft/i);
});

test('status changes enforce a one-way campaign lifecycle and reject expired reactivation', () => {
  assert.match(rpc, /v_campaign\.status = 'draft' and p_status = 'active'/i);
  assert.match(rpc, /v_campaign\.status = 'active' and p_status in \('paused', 'completed'\)/i);
  assert.match(rpc, /v_campaign\.status = 'paused' and p_status in \('active', 'completed'\)/i);
  assert.match(rpc, /v_campaign\.ends_at <= now\(\)/i);
  assert.match(rpc, /v_campaign\.target_impressions <= v_campaign\.impressions/i);
  assert.match(rpc, /sponsor campaign status transition is not allowed/i);
  assert.match(adminSection, /campaign\.status==='draft'[\s\S]*?value="active"/i);
  assert.match(adminSection, /campaign\.status==='active'[\s\S]*?value="paused"[\s\S]*?value="completed"/i);
  assert.match(adminSection, /campaign\.status==='paused'[\s\S]*?value="active"[\s\S]*?value="completed"/i);
  assert.doesNotMatch(adminSection, /value="cancelled"/i);
});

test('campaign creation and lifecycle changes write administrator audit entries', () => {
  assert.match(rpc, /insert into public\.admin_audit_log[\s\S]*?'sponsor_campaign_created'/i);
  assert.match(rpc, /'sponsor_campaign_status_changed'/i);
  assert.match(rpc, /jsonb_build_object\([\s\S]*?'campaign_name'[\s\S]*?'format'/i);
});

test('direct browser campaign mutations are revoked while authenticated reads remain', () => {
  assert.match(migration, /revoke insert, update, delete on table public\.sponsor_campaigns from anon, authenticated/i);
  assert.match(migration, /grant select on table public\.sponsor_campaigns to authenticated/i);
  assert.doesNotMatch(app, /from\('sponsor_campaigns'\)\.(insert|update|delete)/i);
});

test('admin frontend creates and changes status through the audited RPC', () => {
  assert.match(app, /rpc\('admin_manage_sponsor_campaign',\s*\{[\s\S]*?p_action:'create'/i);
  assert.match(app, /p_action:'set_status',p_campaign_id:id,p_status:status/i);
  assert.doesNotMatch(app, /auth\.getUser\(\)[\s\S]{0,500}created_by:userData\.user\.id/i);
  assert.match(adminSection, /Sponsor Reveal sponsors/i);
});

test('admin form starts with a database-valid format and explains Guess Sponsor readiness', () => {
  assert.match(app, /format:'native'/i);
  assert.match(adminSection, /Sponsor Reveal \(Guess Sponsor\)/i);
  assert.match(adminSection, /at least two distinct active Sponsor Reveal sponsors/i);
});
