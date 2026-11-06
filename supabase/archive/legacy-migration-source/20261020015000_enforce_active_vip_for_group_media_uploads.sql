-- Prevent expired VIP memberships from uploading new files into VIP rooms.
drop policy if exists "members upload their own group media" on storage.objects;
create policy "active members upload their own group media"
on storage.objects for insert to authenticated
with check (
  bucket_id='group-media'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists (
    select 1 from public.group_members gm
    join public.chat_groups g on g.id=gm.group_id
    left join public.profiles p on p.id=auth.uid()
    where gm.user_id=auth.uid()
      and gm.group_id::text=(storage.foldername(objects.name))[2]
      and g.closed_at is null
      and (
        not coalesce(g.is_vip,false)
        or (
          (coalesce(p.is_vip,false) and (p.vip_expires_at is null or p.vip_expires_at>now()))
          or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin')
        )
      )
  )
);
