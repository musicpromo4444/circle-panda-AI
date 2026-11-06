-- Private media storage for normal Circle Panda groups.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'group-media',
  'group-media',
  false,
  52428800,
  array[
    'image/jpeg','image/png','image/webp',
    'video/mp4','video/webm',
    'audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav'
  ]
)
on conflict(id) do update set
  public=false,
  file_size_limit=52428800,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "group members can read group media" on storage.objects;
create policy "group members can read group media"
on storage.objects for select to authenticated
using (
  bucket_id='group-media'
  and exists (
    select 1 from public.group_members gm
    where gm.user_id=auth.uid()
      and gm.group_id::text=(storage.foldername(name))[2]
  )
);

drop policy if exists "members upload their own group media" on storage.objects;
create policy "members upload their own group media"
on storage.objects for insert to authenticated
with check (
  bucket_id='group-media'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists (
    select 1 from public.group_members gm
    where gm.user_id=auth.uid()
      and gm.group_id::text=(storage.foldername(name))[2]
  )
);

drop policy if exists "users delete their own group media" on storage.objects;
create policy "users delete their own group media"
on storage.objects for delete to authenticated
using (
  bucket_id='group-media'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists (
    select 1 from public.group_members gm
    where gm.user_id=auth.uid()
      and gm.group_id::text=(storage.foldername(name))[2]
  )
);
