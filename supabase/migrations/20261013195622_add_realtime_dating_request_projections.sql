
create table if not exists public.dating_requests (
 id uuid primary key references public.message_requests(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending',
 created_at timestamptz not null default now(),
 responded_at timestamptz
);
create index if not exists dating_requests_recipient_status_idx on public.dating_requests(recipient_id,status,created_at desc);
alter table public.dating_requests enable row level security;
drop policy if exists "Dating request participants can read their requests" on public.dating_requests;
create policy "Dating request participants can read their requests" on public.dating_requests for select to authenticated using ((select auth.uid())=sender_id or (select auth.uid())=recipient_id);

create or replace function public.sync_dating_request_projection()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if new.source_type='dating' then
  insert into public.dating_requests(id,sender_id,recipient_id,status,created_at,responded_at)
  values(new.id,new.sender_id,new.recipient_id,new.status,new.created_at,new.responded_at)
  on conflict(id) do update set status=excluded.status,responded_at=excluded.responded_at;
 elsif tg_op='UPDATE' and old.source_type='dating' then
  delete from public.dating_requests where id=old.id;
 end if;
 return new;
end;
$$;
drop trigger if exists sync_dating_request_projection_trigger on public.message_requests;
create trigger sync_dating_request_projection_trigger
after insert or update on public.message_requests
for each row execute function public.sync_dating_request_projection();

insert into public.dating_requests(id,sender_id,recipient_id,status,created_at,responded_at)
select id,sender_id,recipient_id,status,created_at,responded_at from public.message_requests where source_type='dating'
on conflict(id) do update set status=excluded.status,responded_at=excluded.responded_at;

do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dating_requests') then
  alter publication supabase_realtime add table public.dating_requests;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dating_matches') then
  alter publication supabase_realtime add table public.dating_matches;
 end if;
end $$;
