create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = p_user_id
  );
$$;
revoke all on function public.is_conversation_member(uuid, uuid) from public;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

drop policy if exists "members can view conversations" on public.conversations;
create policy "members can view conversations" on public.conversations for select to authenticated using (public.is_conversation_member(id, auth.uid()));
drop policy if exists "members can view conversation members" on public.conversation_members;
create policy "members can view conversation members" on public.conversation_members for select to authenticated using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "members can read messages" on public.messages;
create policy "members can read messages" on public.messages for select to authenticated using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "conversation members can send messages as themselves" on public.messages;
create policy "conversation members can send messages as themselves" on public.messages for insert to authenticated with check (auth.uid() = sender_id and public.is_conversation_member(conversation_id, auth.uid()));
