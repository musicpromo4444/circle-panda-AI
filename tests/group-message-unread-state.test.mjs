import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('group unread summary is invoker-scoped and counts only messages after membership read time', () => {
  const migration = read('supabase/migrations/20261117080355_group_message_unread_summary.sql');

  assert.match(migration, /returns table\s*\(\s*group_id uuid,\s*unread_count bigint\s*\)/i);
  assert.match(migration, /language sql\s+stable\s+security invoker\s+set search_path = ''/i);
  assert.match(migration, /from public\.conversation_members cm[\s\S]*join public\.conversations c[\s\S]*c\.conversation_type = 'group'/i);
  assert.match(migration, /join public\.messages m[\s\S]*m\.conversation_id = cm\.conversation_id/i);
  assert.match(migration, /cm\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /m\.sender_id <> \(select auth\.uid\(\)\)/i);
  assert.match(migration, /m\.created_at > coalesce\(cm\.last_read_at, cm\.joined_at\)/i);
  assert.match(migration, /group by c\.context_id/i);
  assert.match(migration, /revoke all on function public\.get_group_unread_summary\(\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_group_unread_summary\(\) to authenticated/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test('group directory loads real unread counts and marks a group read only through the existing RPC', () => {
  const app = read('src/App.tsx');
  const openChatStart = app.indexOf('async function openChat');
  const openMediaStart = app.indexOf('async function openGroupMedia', openChatStart);
  assert.ok(openChatStart >= 0 && openMediaStart > openChatStart, 'openChat handler should exist');
  const openChat = app.slice(openChatStart, openMediaStart);

  assert.match(app, /type GroupUnreadSummaryRow/);
  assert.match(app, /rpc\(['"]get_group_unread_summary['"]\)/);
  assert.match(app, /groupUnreadCounts\[group\.id\]/);
  assert.match(app, /totalUnreadGroupMessages/);
  assert.match(openChat, /rpc\(['"]mark_conversation_read['"]/);
  assert.match(openChat, /order\(['"]created_at['"],\s*\{\s*ascending:\s*false\s*\}\)\.limit\(200\)/);
  assert.match(openChat, /as ChatMessage\[\]\)\.reverse\(\)/);
  assert.ok(openChat.indexOf('if (messagesError)') < openChat.indexOf("rpc('mark_conversation_read'"), 'read marker must follow successful message loading');
  assert.match(app, /event: 'INSERT', schema: 'public', table: 'messages'/);
  assert.match(app, /event: 'UPDATE', schema: 'public', table: 'conversation_members'/);
  assert.match(app, /document\.visibilityState === 'visible'/);
  assert.match(app, /document\.hasFocus\(\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange', markVisibleGroupRead\)/);
  assert.match(app, /window\.addEventListener\('focus', markVisibleGroupRead\)/);
  assert.doesNotMatch(app, /from\(['"]conversation_members['"]\)\.update\s*\(/);
});
