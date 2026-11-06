create or replace function public.admin_list_vip_members()
returns table(user_id uuid, email text, display_name text, username text, is_vip boolean, vip_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;
  return query
    select u.id, u.email::text, p.display_name, p.username, coalesce(p.is_vip,false), p.vip_expires_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by coalesce(p.is_vip,false) desc, lower(coalesce(p.display_name,p.username,u.email)) asc
    limit 200;
end;
$$;

create or replace function public.admin_set_user_vip(
  p_user_id uuid,
  p_active boolean,
  p_expires_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target_email text;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles r where r.user_id = v_actor and r.role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;
  select lower(coalesce(u.email,'')) into v_target_email from auth.users u where u.id = p_user_id;
  if v_target_email is null then raise exception 'User not found'; end if;
  if v_target_email = 'circlepandaapp@gmail.com' and (not p_active or p_expires_at is not null) then
    raise exception 'The Circle Panda owner account must retain permanent VIP access';
  end if;
  if p_active and p_expires_at is not null and p_expires_at <= now() then
    raise exception 'VIP expiry must be in the future';
  end if;
  update public.profiles
  set is_vip = p_active,
      vip_expires_at = case when p_active then p_expires_at else null end,
      updated_at = now()
  where id = p_user_id;
  if not found then raise exception 'User profile not found'; end if;
  return true;
end;
$$;

revoke all on function public.admin_list_vip_members() from public, anon;
grant execute on function public.admin_list_vip_members() to authenticated;
revoke all on function public.admin_set_user_vip(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.admin_set_user_vip(uuid, boolean, timestamptz) to authenticated;
