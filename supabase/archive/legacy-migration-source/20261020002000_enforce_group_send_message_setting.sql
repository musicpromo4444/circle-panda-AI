-- Enforce the saved "Allow members to send messages" group setting in the
-- database trigger, not only in the UI. Admins/creators can still moderate.
create or replace function public.guard_group_chat_open()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_group_id uuid;
  v_member_count bigint;
  v_member_role text;
  v_send_messages boolean := true;
  v_closed_at timestamptz;
begin
  select c.context_id into v_group_id
  from public.conversations c
  where c.id = new.conversation_id
    and c.conversation_type = 'group';

  if v_group_id is null then
    return new;
  end if;

  select g.closed_at into v_closed_at
  from public.chat_groups g
  where g.id = v_group_id;

  if v_closed_at is not null then
    raise exception 'This group has been closed by its owner';
  end if;

  select count(*) into v_member_count
  from public.group_members gm
  where gm.group_id = v_group_id;

  if v_member_count < 3 then
    raise exception 'This group opens when it has at least 3 members';
  end if;

  select gm.role into v_member_role
  from public.group_members gm
  where gm.group_id = v_group_id and gm.user_id = new.sender_id;

  if v_member_role is null then
    raise exception 'Only group members can send messages';
  end if;

  select coalesce(gs.send_messages, true) into v_send_messages
  from public.group_settings gs
  where gs.group_id = v_group_id;

  if not coalesce(v_send_messages, true) and v_member_role not in ('creator','admin') then
    raise exception 'Group admins have turned off member messaging';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_group_chat_open() from public, anon, authenticated;
