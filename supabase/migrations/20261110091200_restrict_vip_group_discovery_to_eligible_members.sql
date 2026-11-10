-- Keep VIP group metadata and membership private to active VIPs in the matching scope and administrators.
-- Ordinary groups remain discoverable by signed-in users so their member counts and join flow continue to work.

create or replace function private.can_view_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.chat_groups g
      where g.id = p_group_id
        and (
          not coalesce(g.is_vip, false)
          or exists (
            select 1
            from public.user_roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          )
          or (
            exists (
              select 1
              from public.profiles p
              where p.id = auth.uid()
                and coalesce(p.is_vip, false)
                and (p.vip_expires_at is null or p.vip_expires_at > now())
            )
            and case
              when g.vip_scope = 'worldwide' then true
              when g.vip_scope = 'country' then
                g.country_restriction is not null
                and lower(btrim(g.country_restriction)) = lower(btrim(coalesce((
                  select p.country from public.profiles p where p.id = auth.uid()
                ), '')))
              else
                g.country_restriction is null
                or lower(btrim(g.country_restriction)) = lower(btrim(coalesce((
                  select p.country from public.profiles p where p.id = auth.uid()
                ), '')))
            end
          )
        )
    );
$function$;

revoke all on function private.can_view_group(uuid) from public;
revoke all on function private.can_view_group(uuid) from anon;
grant execute on function private.can_view_group(uuid) to authenticated;

drop policy if exists "groups readable by signed-in users" on public.chat_groups;
create policy "eligible users can discover groups"
on public.chat_groups
for select
to authenticated
using (private.can_view_group(id));

drop policy if exists "members can see group membership" on public.group_members;
create policy "eligible users can view group membership"
on public.group_members
for select
to authenticated
using (private.can_view_group(group_id));
