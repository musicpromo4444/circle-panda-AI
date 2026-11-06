-- Prevent direct storage reads of group view-once media until the current user has
-- claimed a view. The claim window matches the short signed-URL lifetime.
drop policy if exists "group members can read group media" on storage.objects;
create policy "group members can read authorized group media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'group-media'
  and exists (
    select 1
    from public.group_members gm
    where gm.user_id = auth.uid()
      and gm.group_id::text = (storage.foldername(objects.name))[2]
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
