-- Keep the Circle Panda owner account permanently VIP.
create or replace function public.keep_circle_panda_admin_vip()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if exists (
    select 1
    from auth.users u
    where u.id = new.id
      and lower(coalesce(u.email, '')) = 'circlepandaapp@gmail.com'
  ) then
    new.is_vip := true;
    new.vip_expires_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_circle_panda_admin_vip() from public, anon, authenticated;

drop trigger if exists keep_circle_panda_admin_vip on public.profiles;
create trigger keep_circle_panda_admin_vip
before insert or update of is_vip, vip_expires_at on public.profiles
for each row execute function public.keep_circle_panda_admin_vip();

update public.profiles p
set is_vip = true, vip_expires_at = null, updated_at = now()
from auth.users u
where p.id = u.id
  and lower(coalesce(u.email, '')) = 'circlepandaapp@gmail.com';
