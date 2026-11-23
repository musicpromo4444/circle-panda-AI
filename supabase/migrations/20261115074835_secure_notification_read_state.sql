-- Keep notification payloads server-authored. Signed-in users may read their
-- own rows and change only the read marker; all other writes remain server-side.
revoke all on table public.notifications from public, anon, authenticated;
revoke all (
  id,
  user_id,
  actor_id,
  notification_type,
  title,
  body,
  target_type,
  target_id,
  read_at,
  created_at
) on table public.notifications from public, anon, authenticated;

grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- SECURITY INVOKER is deliberate: the function runs with the caller's
-- privileges and remains subject to the existing notifications RLS policies.
create or replace function public.mark_notifications_read(p_notification_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_updated integer;
  v_user_id uuid;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.notifications
  set read_at = pg_catalog.now()
  where user_id = v_user_id
    and read_at is null
    and (p_notification_id is null or id = p_notification_id);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$;

revoke all on function public.mark_notifications_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
