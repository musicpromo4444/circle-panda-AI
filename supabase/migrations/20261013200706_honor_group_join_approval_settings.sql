
create or replace function public.join_group(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_count integer; v_vip boolean; v_activated timestamptz; v_approve boolean; v_country text; v_restriction text; v_request uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.chat_groups where id=p_group_id) then raise exception 'Group not found'; end if;
 if exists(select 1 from public.group_members where group_id=p_group_id and user_id=v_uid) then
  select activated_at into v_activated from public.chat_groups where id=p_group_id;
  return jsonb_build_object('status',case when v_activated is null then 'waiting' else 'active' end,'activated_at',v_activated);
 end if;
 select is_vip,country_restriction into v_vip,v_restriction from public.chat_groups where id=p_group_id;
 select country into v_country from public.profiles where id=v_uid;
 if coalesce(v_restriction,'')<>'' and lower(v_restriction)<>lower(coalesce(v_country,'')) then raise exception 'This group is restricted to members in %',v_restriction; end if;
 if coalesce(v_vip,false) and not exists(select 1 from public.profiles where id=v_uid and is_vip=true and (vip_expires_at is null or vip_expires_at>now())) then raise exception 'VIP membership is required for this group'; end if;
 select coalesce(approve_new_members,false) into v_approve from public.group_settings where group_id=p_group_id;
 if coalesce(v_approve,false) then
  insert into public.group_join_requests(group_id,user_id,status) values(p_group_id,v_uid,'pending')
  on conflict(group_id,user_id) where status='pending' do update set created_at=now()
  returning id into v_request;
  return jsonb_build_object('status','pending','request_id',v_request);
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
