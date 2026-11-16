-- Persist each member's direct-message read marker.
-- RLS scopes updates to the caller's own membership row, and column-level
-- privileges prevent changing conversation membership or role fields.
alter table public.conversation_members enable row level security;

revoke all on table public.conversation_members from public, anon, authenticated;
revoke all (conversation_id, user_id, joined_at, last_read_at)
  on table public.conversation_members from public, anon, authenticated;

grant select on table public.conversation_members to authenticated;
grant update (last_read_at) on table public.conversation_members to authenticated;

drop policy if exists "users can update own conversation read marker"
  on public.conversation_members;

create policy "users can update own conversation read marker"
  on public.conversation_members
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- SECURITY INVOKER keeps the caller's column grants and RLS policy in force.
-- The client cannot provide a timestamp; the database records the read time.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_updated boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.conversation_members
  set last_read_at = pg_catalog.now()
  where conversation_id = p_conversation_id
    and user_id = v_user_id
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$function$;

revoke all on function public.mark_conversation_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- The composite primary key is sufficient for Postgres Changes. Add the
-- membership table to Realtime only if it is not already published.
do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Expected the supabase_realtime publication';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_members'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_members';
  end if;
end;
$migration$;
