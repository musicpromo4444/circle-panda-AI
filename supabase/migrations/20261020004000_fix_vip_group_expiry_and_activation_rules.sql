-- Active VIP expiry and VIP-room activation rules must be enforced in the backend.
create or replace function public.ensure_vip_group(p_scope text, p_country text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin uuid;
  v_group uuid;
  v_scope text := lower(trim(coalesce(p_scope,'')));
  v_country text := nullif(trim(coalesce(p_country,'')),'');
  v_profile_country text;
  v_is_vip boolean := false;
  v_is_admin boolean := false;
  v_name text;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;

  select coalesce(p.is_vip,false) and (p.vip_expires_at is null or p.vip_expires_at > now()), p.country
    into v_is_vip, v_profile_country
  from public.profiles p where p.id=v_uid;

  select exists(select 1 from public.user_roles r where r.user_id=v_uid and r.role='admin')
    into v_is_admin;

  if not coalesce(v_is_vip,false) and not coalesce(v_is_admin,false) then
    raise exception 'Active VIP membership is required to enter VIP groups';
  end if;

  if v_scope not in ('worldwide','country') then raise exception 'Choose a valid VIP room'; end if;
  if v_scope='country' and v_country is null then raise exception 'Complete your profile country before opening the country VIP room'; end if;
  if v_scope='country' and not coalesce(v_is_admin,false) and lower(v_country)<>lower(coalesce(v_profile_country,'')) then
    raise exception 'Country VIP access is limited to your saved profile country';
  end if;

  if v_scope='worldwide' then
    select id into v_group from public.chat_groups where is_vip=true and vip_scope='worldwide' and closed_at is null limit 1;
  else
    select id into v_group from public.chat_groups where is_vip=true and vip_scope='country' and country_restriction=v_country and closed_at is null limit 1;
  end if;

  if v_group is null then
    select user_id into v_admin from public.user_roles where role='admin' order by user_id limit 1;
    if v_admin is null then raise exception 'The admin account must be configured before VIP rooms can be opened'; end if;
    v_name:=case when v_scope='worldwide' then 'Worldwide VIP Group' else v_country||' VIP Group' end;
    insert into public.chat_groups(creator_id,name,description,about,limitations,country_restriction,is_vip,vip_scope)
    values(v_admin,v_name,'A private Circle Panda VIP community.','A dedicated VIP room for members.','VIP members only.',case when v_scope='country' then v_country else null end,true,v_scope)
    returning id into v_group;
    insert into public.conversations(conversation_type,context_id,created_by) values('group',v_group,v_admin);
    insert into public.group_members(group_id,user_id,role) values(v_group,v_admin,'creator') on conflict(group_id,user_id) do nothing;
    insert into public.group_settings(group_id) values(v_group) on conflict(group_id) do nothing;
  end if;

  insert into public.group_members(group_id,user_id,role) values(v_group,v_uid,'member')
    on conflict(group_id,user_id) do nothing;
  return v_group;
end;
$function$;

create or replace function public.open_group_chat(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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
  if not v_is_vip and v_member_count<3 then raise exception 'This group opens when it has at least 3 members'; end if;

  select c.id into v_conversation_id
  from public.conversations c
  where c.conversation_type='group' and c.context_id=p_group_id
  limit 1;
  if v_conversation_id is null then raise exception 'Group chat is not ready'; end if;
  return v_conversation_id;
end;
$function$;

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
  v_is_vip boolean := false;
begin
  select c.context_id into v_group_id
  from public.conversations c
  where c.id = new.conversation_id and c.conversation_type = 'group';
  if v_group_id is null then return new; end if;

  select g.closed_at, coalesce(g.is_vip,false) into v_closed_at, v_is_vip
  from public.chat_groups g where g.id=v_group_id;
  if v_closed_at is not null then raise exception 'This group has been closed by its owner'; end if;

  select count(*) into v_member_count from public.group_members gm where gm.group_id=v_group_id;
  if not coalesce(v_is_vip,false) and v_member_count<3 then
    raise exception 'This group opens when it has at least 3 members';
  end if;

  select gm.role into v_member_role
  from public.group_members gm where gm.group_id=v_group_id and gm.user_id=new.sender_id;
  if v_member_role is null then raise exception 'Only group members can send messages'; end if;

  select coalesce(gs.send_messages,true) into v_send_messages
  from public.group_settings gs where gs.group_id=v_group_id;
  if not coalesce(v_send_messages,true) and v_member_role not in ('creator','admin') then
    raise exception 'Group admins have turned off member messaging';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_group_chat_open() from public, anon, authenticated;
revoke all on function public.ensure_vip_group(text,text) from public, anon;
grant execute on function public.ensure_vip_group(text,text) to authenticated;
revoke all on function public.open_group_chat(uuid) from public, anon;
grant execute on function public.open_group_chat(uuid) to authenticated;
