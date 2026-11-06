create or replace function public.join_chat_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_group public.chat_groups%rowtype;
  v_is_vip boolean := false;
  v_is_admin boolean := false;
  v_country text;
begin
  if v_user_id is null then
    raise exception 'Sign in is required';
  end if;

  select * into v_group
  from public.chat_groups g
  where g.id = p_group_id;
  if not found then
    raise exception 'Group was not found';
  end if;

  select
    coalesce(p.is_vip,false) and (p.vip_expires_at is null or p.vip_expires_at > now()),
    p.country
  into v_is_vip, v_country
  from public.profiles p
  where p.id = v_user_id;

  select exists(
    select 1 from public.user_roles r
    where r.user_id = v_user_id and r.role = 'admin'
  ) into v_is_admin;

  if coalesce(v_group.is_vip,false) and not coalesce(v_is_vip,false) and not coalesce(v_is_admin,false) then
    raise exception 'Active VIP membership is required for this group';
  end if;

  if v_group.country_restriction is not null
     and lower(trim(v_group.country_restriction)) <> lower(trim(coalesce(v_country,'')))
     and not coalesce(v_is_admin,false) then
    raise exception 'This group is restricted to another country';
  end if;

  insert into public.group_members(group_id,user_id,role)
  values (p_group_id,v_user_id,'member')
  on conflict (group_id,user_id) do nothing;

  return true;
end;
$function$;
