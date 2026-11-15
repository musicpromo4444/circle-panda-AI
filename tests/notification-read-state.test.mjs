import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('notification table exposes only owner reads and read_at updates to browser users', () => {
  const migration = read('supabase/migrations/20261115084500_secure_notification_read_state.sql');

  assert.match(migration, /revoke all on table public\.notifications from public, anon, authenticated/i);
  assert.match(migration, /revoke all\s*\([\s\S]*?\) on table public\.notifications from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.notifications to authenticated/i);
  assert.match(migration, /grant update \(read_at\) on table public\.notifications to authenticated/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /v_user_id := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /where user_id = v_user_id[\s\S]*and read_at is null/i);
  assert.match(migration, /revoke all on function public\.mark_notifications_read\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.mark_notifications_read\(uuid\) to authenticated/i);
});

test('notification inbox confirms server-side read updates instead of optimistic direct table writes', () => {
  const app = read('src/App.tsx');

  assert.match(app, /rpc\(['"]mark_notifications_read['"]/);
  assert.match(app, /p_notification_id: notification\.id/);
  assert.match(app, /p_notification_id: null/);
  assert.match(app, /const updatedCount = Number\(data \?\? 0\)/);
  assert.match(app, /if \(updatedCount === 0\) \{\s*await loadNotifications\(\)/);
  assert.doesNotMatch(app, /from\(['"]notifications['"]\)\s*\.update\(\{\s*read_at/);
});
