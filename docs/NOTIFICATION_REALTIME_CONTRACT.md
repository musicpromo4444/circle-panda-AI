# Notification read-state Realtime contract

Circle Panda keeps notification content server-authored. Browser clients can read only their own notification rows and can change only the `read_at` marker through the authenticated `mark_notifications_read(uuid)` RPC.

## Backend contract

- `20261106092801_add_notifications_to_realtime.sql` adds `public.notifications` to the `supabase_realtime` publication. The publication currently includes UPDATE events.
- `20261115074835_secure_notification_read_state.sql` grants authenticated SELECT and column-level UPDATE on `read_at` only. It revokes direct INSERT, DELETE, and table-wide UPDATE.
- The RPC is `SECURITY INVOKER`, uses an empty search path, derives the user from `auth.uid()`, and is executable by authenticated users only.
- RLS policies scope SELECT and UPDATE to `user_id = auth.uid()`.
- The client subscribes to INSERT and UPDATE events with a `user_id=eq.<authenticated-user-id>` filter. The callback checks the returned owner ID again before changing local state. RLS remains the authorization boundary; the client-side filter is not treated as authorization.
- UPDATE events refresh the exact unread count from Postgres. A monotonically increasing request token prevents an older count response from overwriting a newer result. Re-subscribing also refreshes the count to recover from a missed read-state event.

## Payload and replica identity

The UI consumes the UPDATE event's new row only; it does not depend on old-row values. The live table currently uses the default replica identity, so this flow does not require changing it to FULL or publishing extra old-row data.

## Verification performed

Read-only checks against project `chcyncvieekjousgzlrg` on 2026-11-19 confirmed:

- `notifications` is in `supabase_realtime` and the publication has `pubupdate = true`.
- Authenticated SELECT is allowed; table-wide UPDATE is denied; UPDATE on `read_at` is allowed.
- The two owner-scoped RLS policies exist for SELECT and UPDATE.
- `mark_notifications_read(uuid)` is SECURITY INVOKER with an empty search path; authenticated EXECUTE is allowed and anonymous EXECUTE is denied.

Automated source-contract coverage is in `tests/notification-realtime-read-sync.test.mjs`. A two-account browser test is still required to verify the WebSocket behavior end to end.
