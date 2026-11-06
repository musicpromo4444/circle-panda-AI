
create unique index if not exists messages_sender_idempotency_key_idx
 on public.messages(sender_id,idempotency_key) where idempotency_key is not null;

create or replace function public.create_group(
 p_name text,p_about text default '',p_limitations text default null,p_country_restriction text default null,
 p_is_vip boolean default false,p_vip_scope text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
 v_id:=public.create_chat_group(p_name,p_about,p_country_restriction,p_is_vip);
 update public.chat_groups set about=left(coalesce(p_about,''),2000),limitations=left(coalesce(p_limitations,''),2000),vip_scope=p_vip_scope where id=v_id;
 insert into public.group_settings(group_id) values(v_id) on conflict(group_id) do nothing;
 return v_id;
end;
$$;

create or replace function public.join_group(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_count integer; v_vip boolean; v_activated timestamptz;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.chat_groups where id=p_group_id) then raise exception 'Group not found'; end if;
 select is_vip into v_vip from public.chat_groups where id=p_group_id;
 if coalesce(v_vip,false) and not exists(select 1 from public.profiles where id=v_uid and is_vip=true) then
  raise exception 'VIP membership is required for this group';
 end if;
 perform public.join_chat_group(p_group_id);
 select count(*)::integer into v_count from public.group_members where group_id=p_group_id;
 if v_count>=3 or coalesce(v_vip,false) then
  update public.chat_groups set activated_at=coalesce(activated_at,now()) where id=p_group_id returning activated_at into v_activated;
  return jsonb_build_object('status','active','activated_at',v_activated,'member_count',v_count);
 end if;
 return jsonb_build_object('status','waiting','activated_at',null,'member_count',v_count);
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if exists(select 1 from public.chat_groups where id=p_group_id and creator_id=auth.uid()) then
  raise exception 'The group creator must transfer ownership before leaving';
 end if;
 delete from public.group_members where group_id=p_group_id and user_id=auth.uid();
 return found;
end;
$$;

create or replace function public.send_group_message(p_group_id uuid,p_body text,p_idempotency_key text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_conversation uuid; v_message uuid; v_count integer; v_vip boolean; v_open timestamptz;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(trim(coalesce(p_body,'')))<1 or length(p_body)>4000 then raise exception 'Message must be between 1 and 4000 characters'; end if;
 if p_idempotency_key is not null then
  select id into v_message from public.messages where sender_id=v_uid and idempotency_key=p_idempotency_key limit 1;
  if v_message is not null then return v_message; end if;
 end if;
 if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=v_uid) then raise exception 'Join this group before messaging'; end if;
 select is_vip,activated_at into v_vip,v_open from public.chat_groups where id=p_group_id;
 select count(*)::integer into v_count from public.group_members where group_id=p_group_id;
 if not coalesce(v_vip,false) and (v_count<3 or v_open is null) then raise exception 'This group opens when it has three members'; end if;
 if exists(select 1 from public.group_settings where group_id=p_group_id and send_messages=false) then raise exception 'Group admins have paused messages'; end if;
 select id into v_conversation from public.conversations where conversation_type='group' and context_id=p_group_id limit 1;
 if v_conversation is null then raise exception 'Group conversation is unavailable'; end if;
 insert into public.messages(conversation_id,sender_id,body,idempotency_key)
 values(v_conversation,v_uid,trim(p_body),p_idempotency_key) returning id into v_message;
 return v_message;
end;
$$;

create or replace function public.update_group_info(p_group_id uuid,p_name text,p_topic text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.chat_groups g where g.id=p_group_id and g.creator_id=auth.uid()) then
  raise exception 'Only the group creator can edit group information';
 end if;
 if length(trim(coalesce(p_name,'')))<2 then raise exception 'Group name is too short'; end if;
 update public.chat_groups set name=left(trim(p_name),100),about=left(coalesce(p_topic,''),2000),description=left(coalesce(p_topic,''),2000) where id=p_group_id;
 return true;
end;
$$;

create or replace function public.update_group_settings(
 p_group_id uuid,p_edit_group_info text,p_send_messages boolean,p_approve_new_members boolean
) returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.group_members gm where gm.group_id=p_group_id and gm.user_id=auth.uid() and gm.role in ('creator','admin')) then
  raise exception 'Group admin access is required';
 end if;
 if p_edit_group_info not in ('admins','admins_members') then raise exception 'Invalid group info permission'; end if;
 insert into public.group_settings(group_id,edit_group_info,send_messages,approve_new_members,updated_at)
 values(p_group_id,p_edit_group_info,p_send_messages,p_approve_new_members,now())
 on conflict(group_id) do update set edit_group_info=excluded.edit_group_info,send_messages=excluded.send_messages,approve_new_members=excluded.approve_new_members,updated_at=now();
 return true;
end;
$$;

revoke all on function public.create_group(text,text,text,text,boolean,text) from public,anon;
grant execute on function public.create_group(text,text,text,text,boolean,text) to authenticated;
revoke all on function public.join_group(uuid) from public,anon;
grant execute on function public.join_group(uuid) to authenticated;
revoke all on function public.leave_group(uuid) from public,anon;
grant execute on function public.leave_group(uuid) to authenticated;
revoke all on function public.send_group_message(uuid,text,text) from public,anon;
grant execute on function public.send_group_message(uuid,text,text) to authenticated;
revoke all on function public.update_group_info(uuid,text,text) from public,anon;
grant execute on function public.update_group_info(uuid,text,text) to authenticated;
revoke all on function public.update_group_settings(uuid,text,boolean,boolean) from public,anon;
grant execute on function public.update_group_settings(uuid,text,boolean,boolean) to authenticated;
