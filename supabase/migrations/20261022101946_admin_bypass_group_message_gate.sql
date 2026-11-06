CREATE OR REPLACE FUNCTION public.guard_group_chat_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_group_id uuid;
  v_member_count bigint;
  v_member_role text;
  v_send_messages boolean := true;
  v_closed_at timestamptz;
  v_is_vip boolean := false;
  v_user_vip boolean := false;
  v_is_admin boolean := false;
begin
  select c.context_id into v_group_id
  from public.conversations c
  where c.id = new.conversation_id and c.conversation_type = 'group';
  if v_group_id is null then return new; end if;

  select g.closed_at, coalesce(g.is_vip,false) into v_closed_at, v_is_vip
  from public.chat_groups g where g.id=v_group_id;
  if v_closed_at is not null then raise exception 'This group has been closed by its owner'; end if;

  if v_is_vip then
    select coalesce(p.is_vip,false) and (p.vip_expires_at is null or p.vip_expires_at > now())
      into v_user_vip from public.profiles p where p.id=new.sender_id;
    select exists(select 1 from public.user_roles r where r.user_id=new.sender_id and r.role='admin')
      into v_is_admin;
    if not coalesce(v_user_vip,false) and not coalesce(v_is_admin,false) then
      raise exception 'Active VIP membership is required to send messages in this room';
    end if;
  end if;

  select count(*) into v_member_count from public.group_members gm where gm.group_id=v_group_id;
  select exists(select 1 from public.user_roles r where r.user_id=new.sender_id and r.role='admin')
    into v_is_admin;
  if not coalesce(v_is_vip,false) and not coalesce(v_is_admin,false) and v_member_count<3 then
    raise exception 'This group opens when it has at least 3 members';
  end if;

  select gm.role into v_member_role
  from public.group_members gm where gm.group_id=v_group_id and gm.user_id=new.sender_id;
  if v_member_role is null then raise exception 'Only group members can send messages'; end if;

  select coalesce(gs.send_messages,true) into v_send_messages
  from public.group_settings gs where gs.group_id=v_group_id;
  if not coalesce(v_send_messages,true) and v_member_role not in ('creator','admin') and not coalesce(v_is_admin,false) then
    raise exception 'Group admins have turned off member messaging';
  end if;

  return new;
end;
$function$;
