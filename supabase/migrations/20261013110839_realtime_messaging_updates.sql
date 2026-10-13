-- Enable realtime updates for messaging and inbox state.
-- Idempotent: only add tables not already present in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_requests'
  ) then
    alter publication supabase_realtime add table public.message_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_message_reactions'
  ) then
    alter publication supabase_realtime add table public.group_message_reactions;
  end if;
end $$;
