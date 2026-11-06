-- Keep the Circle Panda owner permanently VIP and prevent ordinary users from
-- setting their own VIP flag or expiry through the broadly-scoped profile update policy.
create or replace function public.keep_circle_panda_admin_vip()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_is_owner_account boolean := false;
  v_actor uuid := auth.uid();
  v_actor_is_admin boolean := false;
begin
  select exists (
    select 1
    from auth.users u
    where u.id = new.id
      and lower(coalesce(u.email, '')) = 'circlepandaapp@gmail.com'
  ) into v_is_owner_account;

  if v_is_owner_account then
    new.is_vip := true;
    new.vip_expires_at := null;
    return new;
  end if;

  if v_actor is not null then
    select exists (
      select 1
      from public.user_roles r
      where r.user_id = v_actor and r.role = 'admin'
    ) into v_actor_is_admin;
  end if;

  if tg_op = 'INSERT' then
    if (coalesce(new.is_vip, false) or new.vip_expires_at is not null)
       and not coalesce(v_actor_is_admin, false) then
      raise exception 'VIP membership is managed by Circle Panda administrators';
    end if;
  elsif (new.is_vip is distinct from old.is_vip
      or new.vip_expires_at is distinct from old.vip_expires_at)
      and not coalesce(v_actor_is_admin, false) then
    raise exception 'VIP membership is managed by Circle Panda administrators';
  end if;

  return new;
end;
$function$;
