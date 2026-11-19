-- Group unread counts reuse the persisted conversation read marker.
-- The function is SECURITY INVOKER so the caller's RLS policies on
-- conversation_members, conversations and messages remain authoritative.
create or replace function public.get_group_unread_summary()
returns table (
  group_id uuid,
  unread_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    c.context_id as group_id,
    count(m.id)::bigint as unread_count
  from public.conversation_members cm
  join public.conversations c
    on c.id = cm.conversation_id
   and c.conversation_type = 'group'
   and c.context_id is not null
  join public.messages m
    on m.conversation_id = cm.conversation_id
   and m.sender_id <> (select auth.uid())
   and m.created_at > coalesce(cm.last_read_at, cm.joined_at)
  where cm.user_id = (select auth.uid())
  group by c.context_id;
$function$;

revoke all on function public.get_group_unread_summary() from public, anon, authenticated;
grant execute on function public.get_group_unread_summary() to authenticated;

comment on function public.get_group_unread_summary() is
  'Returns unread message counts only for group conversations the caller belongs to; respects underlying RLS.';
