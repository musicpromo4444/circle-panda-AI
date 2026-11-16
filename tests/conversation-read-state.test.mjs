import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('conversation read markers are limited to the signed-in member and one column', () => {
  const migration = read('supabase/migrations/20261116080451_persist_direct_message_read_state.sql');

  assert.match(migration, /alter table public\.conversation_members enable row level security/i);
  assert.match(migration, /revoke all on table public\.conversation_members from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.conversation_members to authenticated/i);
  assert.match(migration, /grant update \(last_read_at\) on table public\.conversation_members to authenticated/i);
  assert.match(migration, /for update\s+to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /v_user_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /set last_read_at = pg_catalog\.now\(\)[\s\S]*where conversation_id = p_conversation_id\s+and user_id = v_user_id/i);
  assert.match(migration, /revoke all on function public\.mark_conversation_read\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.mark_conversation_read\(uuid\) to authenticated/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.conversation_members/i);
});

test('DM inbox calculates unread state from persisted read markers and syncs it through Realtime', () => {
  const app = read('src/App.tsx');

  assert.match(app, /select\('conversation_id,user_id,joined_at,last_read_at'\)/);
  assert.match(app, /rpc\(['"]mark_conversation_read['"]/);
  assert.match(app, /Date\.parse\(readAt\)/);
  assert.match(app, /Date\.parse\(item\.created_at\)/);
  assert.match(app, /event: 'UPDATE'[\s\S]*table: 'conversation_members'/);
  assert.match(app, /event: 'INSERT'[\s\S]*table: 'messages'/);
  assert.match(app, /New messages/);
  assert.doesNotMatch(app, /lastMessageSender/);
  assert.doesNotMatch(app, /from\(['"]conversation_members['"]\)\.update\s*\(/);
});
