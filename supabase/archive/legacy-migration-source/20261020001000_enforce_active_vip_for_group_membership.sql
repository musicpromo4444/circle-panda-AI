-- Direct group_members inserts must not bypass the active VIP expiry check.
drop policy if exists "users can join eligible groups as themselves" on public.group_members;
create policy "users can join eligible groups as themselves"
on public.group_members
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chat_groups g
    join public.profiles p on p.id = auth.uid()
    where g.id = group_members.group_id
      and (
        (g.creator_id = auth.uid() and group_members.role = 'creator')
        or (
          group_members.role = 'member'
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
  )
);
