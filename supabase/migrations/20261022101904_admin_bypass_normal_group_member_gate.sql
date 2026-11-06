CREATE OR REPLACE FUNCTION public.open_group_chat(p_group_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_member_count bigint;
  v_is_vip boolean := false;
  v_user_vip boolean := false;
  v_is_admin boolean := false;
  v_closed_at timestamptz;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;

  select coalesce(g.is_vip,false), g.closed_at
    into v_is_vip, v_closed_at
  from public.chat_groups g where g.id=p_group_id;
  if not found then raise exception 'Group not found'; end if;
  if v_closed_at is not null then raise exception 'This group has been closed by its owner'; end if;

  select coalesce(p.is_vip,false) and (p.vip_expires_at is null or p.vip_expires_at > now())
    into v_user_vip from public.profiles p where p.id=v_user_id;
  select exists(select 1 from public.user_roles r where r.user_id=v_user_id and r.role='admin')
    into v_is_admin;

  if v_is_vip and not coalesce(v_user_vip,false) and not coalesce(v_is_admin,false) then
    raise exception 'Active VIP membership is required to enter this room';
  end if;
  if not exists(select 1 from public.group_members gm where gm.group_id=p_group_id and gm.user_id=v_user_id) then
    raise exception 'Join this group before opening its chat';
  end if;

  select count(*) into v_member_count from public.group_members gm where gm.group_id=p_group_id;
  if not v_is_vip and not coalesce(v_is_admin,false) and v_member_count<3 then
    raise exception 'This group opens when it has at least 3 members';
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  where c.conversation_type='group' and c.context_id=p_group_id
  limit 1;
  if v_conversation_id is null then raise exception 'Group chat is not ready'; end if;
  return v_conversation_id;
end;
$function$;
