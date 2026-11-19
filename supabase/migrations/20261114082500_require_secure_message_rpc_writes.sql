-- All browser message writes must pass through the security-definer RPCs.
-- send_dm_message enforces conversation membership and blocks; message triggers
-- enforce BC charges. Group writes also pass through send_group_message, while
-- the existing group guard/closure triggers enforce membership, VIP, activation,
-- send settings and closure consistently for every insert path.

do $migration$
begin
  if to_regprocedure('public.send_dm_message(uuid,text,text,text,text)') is null then
    raise exception 'Expected public.send_dm_message(uuid,text,text,text,text) before restricting message inserts';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.messages'::regclass
      and tgname = 'messages_charge_wallet_before_insert'
      and not tgisinternal
  ) then
    raise exception 'Expected the messages wallet-charge trigger before restricting message inserts';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.messages'::regclass
      and tgname = 'messages_guard_group_open'
      and not tgisinternal
  ) then
    raise exception 'Expected the group membership/VIP/settings guard before restricting message inserts';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.messages'::regclass
      and tgname = 'enforce_group_not_closed_on_message_trigger'
      and not tgisinternal
  ) then
    raise exception 'Expected the group-closure guard before restricting message inserts';
  end if;
end;
$migration$;

create or replace function public.send_group_message(
  p_group_id uuid,
  p_body text,
  p_media_type text default null,
  p_media_path text default null,
  p_reply_to_id uuid default null,
  p_view_once boolean default false,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_conversation uuid;
  v_message uuid;
begin
  if v_uid is null then
    raise exception 'Sign in is required';
  end if;

  if length(coalesce(p_body, '')) > 4000 then
    raise exception 'Message is too long';
  end if;

  if length(trim(coalesce(p_body, ''))) = 0
     and coalesce(trim(p_media_path), '') = '' then
    raise exception 'Write a message or attach media';
  end if;

  if p_media_type is not null
     and p_media_type not in ('image', 'video', 'audio') then
    raise exception 'Unsupported group media type';
  end if;

  if p_media_path is not null
     and (p_media_type is null
       or p_media_path not like v_uid::text || '/' || p_group_id::text || '/%') then
    raise exception 'Invalid group media path';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_uid
  ) then
    raise exception 'Join this group before messaging';
  end if;

  if p_idempotency_key is not null then
    select m.id into v_message
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.sender_id = v_uid
      and m.idempotency_key = p_idempotency_key
      and c.conversation_type = 'group'
      and c.context_id = p_group_id
    limit 1;

    if v_message is not null then
      return v_message;
    end if;
  end if;

  if p_reply_to_id is not null and not exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_reply_to_id
      and c.conversation_type = 'group'
      and c.context_id = p_group_id
  ) then
    raise exception 'Reply target is not in this group';
  end if;

  select c.id into v_conversation
  from public.conversations c
  where c.conversation_type = 'group'
    and c.context_id = p_group_id
  limit 1;

  if v_conversation is null then
    raise exception 'Group conversation is unavailable';
  end if;

  -- messages_guard_group_open and enforce_group_not_closed_on_message are
  -- authoritative for group activation, VIP eligibility, admin exceptions,
  -- paused messaging and closure. Keep those rules centralized in the triggers.
  insert into public.messages (
    conversation_id,
    sender_id,
    body,
    media_type,
    media_path,
    view_once,
    reply_to_message_id,
    idempotency_key
  )
  values (
    v_conversation,
    v_uid,
    trim(coalesce(p_body, '')),
    p_media_type,
    p_media_path,
    coalesce(p_view_once, false),
    p_reply_to_id,
    p_idempotency_key
  )
  returning id into v_message;

  return v_message;
end;
$function$;

revoke all on function public.send_group_message(uuid,text,text,text,uuid,boolean,text) from public, anon;
grant execute on function public.send_group_message(uuid,text,text,text,uuid,boolean,text) to authenticated;
grant execute on function public.send_dm_message(uuid,text,text,text,text) to authenticated;

-- The RPCs execute as their trusted owner. Browser roles must not bypass them
-- with direct table inserts, which would skip DM block checks and idempotency.
revoke insert on table public.messages from public, anon, authenticated;
drop policy if exists "conversation members can send messages as themselves" on public.messages;
