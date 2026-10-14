-- VIP group rooms are system-created, VIP-only and exempt from the normal 3-member threshold.
create unique index if not exists chat_groups_one_worldwide_vip
  on public.chat_groups(vip_scope) where is_vip=true and vip_scope='worldwide';
create unique index if not exists chat_groups_one_country_vip
  on public.chat_groups(country_restriction) where is_vip=true and vip_scope='country' and country_restriction is not null;

create or replace function public.ensure_vip_group(p_scope text,p_country text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_admin uuid;
  v_group uuid;
  v_scope text:=lower(trim(coalesce(p_scope,'')));
  v_country text:=nullif(trim(coalesce(p_country,'')),'');
  v_is_vip boolean:=false;
  v_name text;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  select coalesce(is_vip,false) into v_is_vip from public.profiles where id=v_uid;
  if not coalesce(v_is_vip,false) and not exists(select 1 from public.user_roles where user_id=v_uid and role='admin') then
    raise exception 'VIP membership is required to enter VIP groups';
  end if;
  if v_scope not in ('worldwide','country') then raise exception 'Choose a valid VIP room'; end if;
  if v_scope='country' and v_country is null then raise exception 'Complete your profile country before opening the country VIP room'; end if;

  if v_scope='worldwide' then
    select id into v_group from public.chat_groups where is_vip=true and vip_scope='worldwide' limit 1;
  else
    select id into v_group from public.chat_groups where is_vip=true and vip_scope='country' and country_restriction=v_country limit 1;
  end if;

  if v_group is null then
    select user_id into v_admin from public.user_roles where role='admin' limit 1;
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
$$;
revoke all on function public.ensure_vip_group(text,text) from public;
grant execute on function public.ensure_vip_group(text,text) to authenticated;

create or replace function public.open_group_chat(p_group_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_conversation_id uuid;
  v_member_count bigint;
  v_is_vip boolean:=false;
  v_user_vip boolean:=false;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  select coalesce(is_vip,false) into v_is_vip from public.chat_groups where id=p_group_id;
  if not found then raise exception 'Group not found'; end if;
  select coalesce(is_vip,false) into v_user_vip from public.profiles where id=v_user_id;
  if v_is_vip and not coalesce(v_user_vip,false) and not exists(select 1 from public.user_roles where user_id=v_user_id and role='admin') then
    raise exception 'VIP membership is required to enter this room';
  end if;
  if not exists(select 1 from public.group_members gm where gm.group_id=p_group_id and gm.user_id=v_user_id) then
    raise exception 'Join this group before opening its chat';
  end if;
  select count(*) into v_member_count from public.group_members gm where gm.group_id=p_group_id;
  if not v_is_vip and v_member_count<3 then raise exception 'This group opens when it has at least 3 members'; end if;
  select c.id into v_conversation_id from public.conversations c where c.conversation_type='group' and c.context_id=p_group_id limit 1;
  if v_conversation_id is null then raise exception 'Group chat is not ready'; end if;
  return v_conversation_id;
end;
$$;
revoke all on function public.open_group_chat(uuid) from public;
grant execute on function public.open_group_chat(uuid) to authenticated;
