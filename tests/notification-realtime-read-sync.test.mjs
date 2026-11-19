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

  assert.match(app, /event: 'UPDATE',[\\s\\S]*?table: 'notifications',[\\s\\S]*?filter: 'user_id=eq\\.' \\+ userId/);
  assert.match(app, /const updated = payload\\.new as NotificationRow & \\{ user_id: string \\}/);
  assert.match(app, /if \\(updated\\.user_id !== userId \\|\\| !updated\\.id\\) return/);
  assert.match(app, /setNotifications\\(rows => rows\\.map\\(row => row\\.id === updated\\.id/);
  assert.match(app, /async function refreshNotificationUnreadCount\\(\\)/);
  assert.match(app, /requestId !== notificationUnreadSync\\.current/);
  assert.match(app, /if \\(status === 'SUBSCRIBED'\\) void refreshNotificationUnreadCount\\(\\)/);

  assert.match(publication, /alter publication supabase_realtime add table public\\.notifications/i);
  assert.match(security, /grant select on table public\\.notifications to authenticated/i);
  assert.match(security, /grant update \\(read_at\\) on table public\\.notifications to authenticated/i);
  assert.match(security, /security invoker/i);
  assert.match(security, /grant execute on function public\\.mark_notifications_read\\(uuid\\) to authenticated/i);
});
