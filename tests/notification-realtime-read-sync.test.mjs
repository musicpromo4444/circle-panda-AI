import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('notification read updates synchronize through the owner-filtered Realtime stream', () => {
  const app = read('src/App.tsx');
  const publication = read('supabase/migrations/20261106092801_add_notifications_to_realtime.sql');
  const security = read('supabase/migrations/20261115074835_secure_notification_read_state.sql');

  assert.ok(app.includes("event: 'UPDATE',"));
  assert.ok(app.includes("filter: 'user_id=eq.' + userId"));
  assert.ok(app.includes('const updated = payload.new as NotificationRow & { user_id: string };'));
  assert.ok(app.includes('if (updated.user_id !== userId || !updated.id) return;'));
  assert.ok(app.includes('async function refreshNotificationUnreadCount()'));
  assert.ok(app.includes('requestId !== notificationUnreadSync.current'));
  assert.ok(app.includes("if (status === 'SUBSCRIBED') void refreshNotificationUnreadCount();"));
  assert.ok(app.includes(".eq('user_id', session.user.id)\n      .is('read_at', null)"));

  assert.ok(publication.includes('alter publication supabase_realtime add table public.notifications;'));
  assert.ok(security.includes('grant select on table public.notifications to authenticated;'));
  assert.ok(security.includes('grant update (read_at) on table public.notifications to authenticated;'));
  assert.ok(security.includes('security invoker'));
  assert.ok(security.includes('grant execute on function public.mark_notifications_read(uuid) to authenticated;'));
});
