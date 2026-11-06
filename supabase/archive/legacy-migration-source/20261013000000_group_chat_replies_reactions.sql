alter table public.messages
  add column if not exists reply_to_message_id uuid null references public.messages(id) on delete set null;

create index if not exists messages_reply_to_message_id_idx
  on public.messages(reply_to_message_id);

create table if not exists public.group_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('heart','laugh','wow','sad','panda','like')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

alter table public.group_message_reactions enable row level security;

drop policy if exists "group members can read message reactions" on public.group_message_reactions;

create policy "group members can read message reactions"
on public.group_message_reactions for select to authenticated
using (
  exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = group_message_reactions.message_id
      and c.conversation_type = 'group'
      and public.is_conversation_member(m.conversation_id, auth.uid())
  )
);

drop policy if exists "group members can add their own message reactions" on public.group_message_reactions;

create policy "group members can add their own message reactions"
on public.group_message_reactions for insert to authenticated
with check (
  auth.uid() = user_id and exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = group_message_reactions.message_id
      and c.conversation_type = 'group'
      and public.is_conversation_member(m.conversation_id, auth.uid())
  )
);

drop policy if exists "users can update their own group message reactions" on public.group_message_reactions;

create policy "users can update their own group message reactions"
on public.group_message_reactions for update to authenticated
using (auth.uid() = user_id and exists (
  select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
  where m.id=group_message_reactions.message_id and c.conversation_type='group'
    and public.is_conversation_member(m.conversation_id,auth.uid())
))
with check (auth.uid() = user_id and exists (
  select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
  where m.id=group_message_reactions.message_id and c.conversation_type='group'
    and public.is_conversation_member(m.conversation_id,auth.uid())
));

drop policy if exists "users can remove their own group message reactions" on public.group_message_reactions;

create policy "users can remove their own group message reactions"
on public.group_message_reactions for delete to authenticated
using (auth.uid() = user_id);
