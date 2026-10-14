-- VIP group channels are managed by the platform, not created as ordinary user groups.
create or replace function public.create_chat_group(p_name text,p_description text default '',p_country_restriction text default null,p_is_vip boolean default false)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_group_id uuid;
  v_is_admin boolean:=false;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if length(trim(coalesce(p_name,'')))<2 or length(trim(p_name))>100 then
    raise exception 'Group name must be between 2 and 100 characters';
  end if;
  select exists(select 1 from public.user_roles where user_id=v_user_id and role='admin') into v_is_admin;
  if p_is_vip and not v_is_admin then raise exception 'VIP rooms are managed by Circle Panda administrators'; end if;

  insert into public.chat_groups(creator_id,name,description,country_restriction,is_vip)
  values(v_user_id,trim(p_name),left(coalesce(p_description,''),2000),nullif(trim(coalesce(p_country_restriction,'')),''),p_is_vip)
  returning id into v_group_id;
  insert into public.conversations(conversation_type,context_id,created_by) values('group',v_group_id,v_user_id);
  insert into public.group_members(group_id,user_id,role) values(v_group_id,v_user_id,'creator');
  return v_group_id;
end;
$$;
revoke all on function public.create_chat_group(text,text,text,boolean) from public;
grant execute on function public.create_chat_group(text,text,text,boolean) to authenticated;
