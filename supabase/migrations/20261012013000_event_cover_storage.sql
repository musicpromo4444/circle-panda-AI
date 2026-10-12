-- Public event cover images; writes are scoped to the authenticated user's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event cover images are readable" on storage.objects;
create policy "event cover images are readable"
  on storage.objects for select
  using (bucket_id = 'event-covers');

drop policy if exists "members upload their own event covers" on storage.objects;
create policy "members upload their own event covers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members update their own event covers" on storage.objects;
create policy "members update their own event covers"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'event-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "members delete their own event covers" on storage.objects;
create policy "members delete their own event covers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
