
create or replace function public.send_message_request(
 p_recipient_id uuid,p_source_type text,p_source_id uuid default null,p_greeting text default ''
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_sender_id uuid:=auth.uid(); v_request_id uuid;
begin
 if v_sender_id is null then raise exception 'Sign in is required'; end if;
 if p_recipient_id is null or p_recipient_id=v_sender_id then raise exception 'You cannot send a message request to yourself'; end if;
 if p_source_type not in ('dating','event','group','feed','profile','wcw','mcm','confession') then raise exception 'Unsupported message request source'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_recipient_id) then raise exception 'Recipient was not found'; end if;
 if exists(select 1 from public.user_blocks b where (b.blocker_id=v_sender_id and b.blocked_id=p_recipient_id) or (b.blocker_id=p_recipient_id and b.blocked_id=v_sender_id)) then
  raise exception 'Messaging is unavailable for this person';
 end if;
 if exists(select 1 from public.message_requests mr where mr.sender_id=v_sender_id and mr.recipient_id=p_recipient_id and mr.status='pending') then
  raise exception 'You already have a pending request to this person';
 end if;
 insert into public.message_requests(sender_id,recipient_id,source_type,source_id,greeting)
 values(v_sender_id,p_recipient_id,p_source_type,p_source_id,left(coalesce(p_greeting,''),1000))
 returning id into v_request_id;
 insert into public.notifications(user_id,actor_id,notification_type,title,body,target_type,target_id)
 values(p_recipient_id,v_sender_id,'message_request','New message request',left(coalesce(p_greeting,''),240),'message_request',v_request_id);
 return v_request_id;
end;
$$;

create or replace function public.respond_direct_message_request_secure(p_request_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_source text; v_sender uuid; v_recipient uuid; v_thread uuid; v_match_id uuid;
begin
 select source_type,sender_id,recipient_id into v_source,v_sender,v_recipient
 from public.message_requests where id=p_request_id and recipient_id=auth.uid() and status='pending' for update;
 if not found then raise exception 'Message request was not found or has already been handled'; end if;
 if exists(select 1 from public.user_blocks b where (b.blocker_id=v_sender and b.blocked_id=v_recipient) or (b.blocker_id=v_recipient and b.blocked_id=v_sender)) and p_accept then
  raise exception 'Messaging is unavailable for this person';
 end if;
 v_thread:=public.respond_message_request(p_request_id,p_accept);
 if not p_accept then return jsonb_build_object('thread_id',null,'status','declined'); end if;
 if v_source='dating' then
  update public.conversations set conversation_type='dating' where id=v_thread;
  insert into public.dating_matches(user_a,user_b,thread_id,status,free_until)
  values(least(v_sender,v_recipient),greatest(v_sender,v_recipient),v_thread,'matched',now()+interval '72 hours')
  on conflict(user_a,user_b) do update set thread_id=excluded.thread_id,status='matched',updated_at=now()
  returning id into v_match_id;
 end if;
 return jsonb_build_object('thread_id',v_thread,'status',case when v_source='dating' then 'matched' else 'accepted' end);
end;
$$;

create or replace function public.mark_message_request_notifications_read(p_request_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 update public.notifications set read_at=coalesce(read_at,now())
 where user_id=auth.uid() and notification_type='message_request'
   and target_type='message_request' and target_id=p_request_id;
 return true;
end;
$$;

revoke all on function public.mark_message_request_notifications_read(uuid) from public,anon;
grant execute on function public.mark_message_request_notifications_read(uuid) to authenticated;
