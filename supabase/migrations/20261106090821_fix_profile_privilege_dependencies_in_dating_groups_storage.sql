-- Preserve private profile columns while allowing RLS policies to evaluate safely.
-- SECURITY DEFINER predicates live in the non-exposed private schema; clients do not
-- receive SELECT privileges on public.profiles or access to dates of birth.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_published_dating_profile_adult(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.dating_profiles dp
      join public.profiles p on p.id = dp.user_id
      where dp.user_id = p_user_id
        and dp.is_published = true
        and p.date_of_birth is not null
        and p.date_of_birth <= (current_date - interval '18 years')::date
    );
$function$;

create or replace function private.can_join_group_as_current_user(p_group_id uuid, p_role text)
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
      join public.profiles p on p.id = auth.uid()
      where g.id = p_group_id
        and (
          (g.creator_id = auth.uid() and p_role = 'creator')
          or (
            p_role = 'member'
            and (
              not g.is_vip
              or (
                coalesce(p.is_vip, false)
                and (p.vip_expires_at is null or p.vip_expires_at > now())
              )
            )
            and (g.country_restriction is null or g.country_restriction = p.country)
          )
        )
    );
$function$;

create or replace function private.current_user_is_active_vip()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_vip, false)
        and (p.vip_expires_at is null or p.vip_expires_at > now())
    );
$function$;

revoke all on function private.is_published_dating_profile_adult(uuid) from public, anon;
revoke all on function private.can_join_group_as_current_user(uuid, text) from public, anon;
revoke all on function private.current_user_is_active_vip() from public, anon;
grant execute on function private.is_published_dating_profile_adult(uuid) to authenticated;
grant execute on function private.can_join_group_as_current_user(uuid, text) to authenticated;
grant execute on function private.current_user_is_active_vip() to authenticated;

drop policy if exists "published adult dating profiles readable" on public.dating_profiles;
create policy "published adult dating profiles readable"
on public.dating_profiles
for select to authenticated
using (
  (select auth.uid()) = user_id
  or (is_published and private.is_published_dating_profile_adult(user_id))
);

drop policy if exists "users can join eligible groups as themselves" on public.group_members;
create policy "users can join eligible groups as themselves"
on public.group_members
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and private.can_join_group_as_current_user(group_id, role)
);

drop policy if exists "active members upload their own group media" on storage.objects;
create policy "active members upload their own group media"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'group-media'
  and (storage.foldername(name))[1] = (auth.uid())::text
  and exists (
    select 1
    from public.group_members gm
    join public.chat_groups g on g.id = gm.group_id
    where gm.user_id = auth.uid()
      and gm.group_id::text = (storage.foldername(objects.name))[2]
      and g.closed_at is null
      and (
        not coalesce(g.is_vip, false)
        or private.current_user_is_active_vip()
        or exists (
          select 1 from public.user_roles r
          where r.user_id = auth.uid() and r.role = 'admin'
        )
      )
  )
);

drop policy if exists "group members can read authorized group media" on storage.objects;
create policy "group members can read authorized group media"
on storage.objects
for select to authenticated
using (
  bucket_id = 'group-media'
  and exists (
    select 1
    from public.group_members gm
    join public.chat_groups g on g.id = gm.group_id
    where gm.user_id = auth.uid()
      and gm.group_id::text = (storage.foldername(objects.name))[2]
      and (
        not coalesce(g.is_vip, false)
        or private.current_user_is_active_vip()
        or exists (
          select 1 from public.user_roles r
          where r.user_id = auth.uid() and r.role = 'admin'
        )
      )
  )
  and exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.media_path = objects.name
      and c.conversation_type = 'group'
      and c.context_id::text = (storage.foldername(objects.name))[2]
      and (
        not coalesce(m.view_once, false)
        or exists (
          select 1
          from public.group_media_views v
          where v.message_id = m.id
            and v.user_id = auth.uid()
            and v.opened_at > now() - interval '30 seconds'
        )
      )
  )
);
