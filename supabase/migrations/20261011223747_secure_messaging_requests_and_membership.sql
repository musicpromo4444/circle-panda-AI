-- Secure private conversation membership and make message-request transitions atomic.
drop policy if exists "users can add themselves to conversation" on public.conversation_members;
revoke insert, update, delete on table public.conversation_members from authenticated;

drop policy if exists "users can send requests as themselves" on public.message_requests;
drop policy if exists "recipients can respond to requests" on public.message_requests;
revoke insert, update, delete on table public.message_requests from authenticated;

drop policy if exists "users can join groups as themselves" on public.group_members;
create policy "users can join eligible groups as themselves" on public.group_members
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.chat_groups g
    join public.profiles p on p.id = auth.uid()
    where g.id = group_id
      and (
        (g.creator_id = auth.uid() and role = 'creator')
        or (
          role = 'member'
          and (not g.is_vip or p.is_vip)
          and (g.country_restriction is null or g.country_restriction = p.country)
        )
      )
  )
);

create or replace function public.send_message_request(
  p_recipient_id uuid,
  p_source_type text,
  p_source_id uuid default null,
  p_greeting text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid := auth.uid();
  v_request_id uuid;
begin
  if v_sender_id is null then
    raise exception 'Sign in is required';
  end if;
  if p_recipient_id is null or p_recipient_id = v_sender_id then
    raise exception 'You cannot send a message request to yourself';
  end if;
  if p_source_type not in ('dating','event','group','feed','profile','wcw','mcm') then
    raise exception 'Unsupported message request source';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_recipient_id) then
    raise exception 'Recipient was not found';
  end if;
  if exists (
    select 1 from public.message_requests mr
    where mr.sender_id = v_sender_id and mr.recipient_id = p_recipient_id
      and mr.status = 'pending'
  ) then
    raise exception 'You already have a pending request to this person';
  end if;

  insert into public.message_requests(sender_id, recipient_id, source_type, source_id, greeting)
  values (v_sender_id, p_recipient_id, p_source_type, p_source_id, left(coalesce(p_greeting,''), 1000))
  returning id into v_request_id;

  insert into public.notifications(user_id, actor_id, notification_type, title, body, target_type, target_id)
  values (p_recipient_id, v_sender_id, 'message_request', 'New message request',
    left(coalesce(p_greeting,''), 240), 'message_request', v_request_id);

  return v_request_id;
end;
$$;

create or replace function public.respond_message_request(
  p_request_id uuid,
  p_accept boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid := auth.uid();
  v_sender_id uuid;
  v_status text;
  v_conversation_id uuid;
begin
  if v_recipient_id is null then
    raise exception 'Sign in is required';
  end if;

  select mr.sender_id, mr.status, mr.conversation_id
  into v_sender_id, v_status, v_conversation_id
  from public.message_requests mr
  where mr.id = p_request_id and mr.recipient_id = v_recipient_id
  for update;

  if not found then
    raise exception 'Message request was not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'This message request has already been handled';
  end if;

  if not p_accept then
    update public.message_requests
      set status = 'declined', responded_at = now()
      where id = p_request_id;
    insert into public.notifications(user_id, actor_id, notification_type, title, body, target_type, target_id)
    values (v_sender_id, v_recipient_id, 'message_request_declined', 'Message request declined',
      'Your message request was declined.', 'message_request', p_request_id);
    return null;
  end if;

  insert into public.conversations(conversation_type, created_by)
  values ('direct', v_recipient_id)
  returning id into v_conversation_id;

  insert into public.conversation_members(conversation_id, user_id)
  values (v_conversation_id, v_sender_id), (v_conversation_id, v_recipient_id);

  update public.message_requests
    set status = 'accepted', responded_at = now(), conversation_id = v_conversation_id
    where id = p_request_id;

  insert into public.notifications(user_id, actor_id, notification_type, title, body, target_type, target_id)
  values (v_sender_id, v_recipient_id, 'message_request_accepted', 'Message request accepted',
    'Your request was accepted. You can start chatting now.', 'conversation', v_conversation_id);

  return v_conversation_id;
end;
$$;

revoke all on function public.send_message_request(uuid, text, uuid, text) from public;
revoke all on function public.respond_message_request(uuid, boolean) from public;
grant execute on function public.send_message_request(uuid, text, uuid, text) to authenticated;
grant execute on function public.respond_message_request(uuid, boolean) to authenticated;
