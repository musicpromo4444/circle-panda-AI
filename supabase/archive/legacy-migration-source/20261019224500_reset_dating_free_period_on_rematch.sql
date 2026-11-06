-- Start a fresh configurable free-chat period whenever a Dating request is accepted.
-- Re-matching resets both confirmations and the mutual photo reveal.
create or replace function public.respond_direct_message_request_secure(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_source text;
  v_sender uuid;
  v_recipient uuid;
  v_thread uuid;
  v_match_id uuid;
  v_free_hours bigint := 72;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;

  select source_type, sender_id, recipient_id
    into v_source, v_sender, v_recipient
  from public.message_requests
  where id = p_request_id
    and recipient_id = auth.uid()
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Message request was not found or has already been handled';
  end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_sender and b.blocked_id = v_recipient)
       or (b.blocker_id = v_recipient and b.blocked_id = v_sender)
  ) and p_accept then
    raise exception 'Messaging is unavailable for this person';
  end if;

  v_thread := public.respond_message_request(p_request_id, p_accept);

  if not p_accept then
    return jsonb_build_object('thread_id', null, 'status', 'declined');
  end if;

  if v_source = 'dating' then
    update public.conversations
    set conversation_type = 'dating'
    where id = v_thread;

    select es.numeric_value into v_free_hours
    from public.economy_settings es
    where es.setting_key = 'dating_free_hours';
    v_free_hours := greatest(0, coalesce(v_free_hours, 72));

    insert into public.dating_matches(
      user_a, user_b, thread_id, status, free_until,
      user_a_confirmed, user_b_confirmed, photos_revealed
    )
    values (
      least(v_sender, v_recipient),
      greatest(v_sender, v_recipient),
      v_thread,
      'matched',
      now() + make_interval(hours => v_free_hours::double precision),
      false,
      false,
      false
    )
    on conflict (user_a, user_b) do update
      set thread_id = excluded.thread_id,
          status = 'matched',
          free_until = excluded.free_until,
          user_a_confirmed = false,
          user_b_confirmed = false,
          photos_revealed = false,
          updated_at = now()
    returning id into v_match_id;
  end if;

  return jsonb_build_object(
    'thread_id', v_thread,
    'status', case when v_source = 'dating' then 'matched' else 'accepted' end,
    'match_id', v_match_id
  );
end;
$function$;

revoke all on function public.respond_direct_message_request_secure(uuid, boolean) from public, anon;
grant execute on function public.respond_direct_message_request_secure(uuid, boolean) to authenticated;
