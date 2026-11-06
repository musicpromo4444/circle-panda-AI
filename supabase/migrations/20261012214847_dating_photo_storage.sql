-- Private dating-photo storage. Only the owner or members viewing a published profile can read a photo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dating-profile-photos', 'dating-profile-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dating profile owners upload their photos" on storage.objects;
create policy "dating profile owners upload their photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dating-profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members read photos on published dating profiles" on storage.objects;
create policy "members read photos on published dating profiles"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dating-profile-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.dating_profiles dp
        where dp.is_published = true and dp.photos @> array[storage.objects.name]
      )
    )
  );

drop policy if exists "dating profile owners update their photos" on storage.objects;
create policy "dating profile owners update their photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'dating-profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'dating-profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "dating profile owners delete their photos" on storage.objects;
create policy "dating profile owners delete their photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'dating-profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
