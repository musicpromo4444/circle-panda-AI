
create or replace function public.request_dating_match_secure(p_recipient_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 v_uid uuid := auth.uid();
 v_profile_id uuid;
 v_existing uuid;
 v_thread uuid;
 v_result jsonb;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if p_recipient_id is null or p_recipient_id=v_uid then raise exception 'You cannot send a Dating request to yourself'; end if;
 if not exists(select 1 from public.profiles p where p.id=v_uid and p.date_of_birth is not null and p.date_of_birth <= (current_date - interval '18 years')::date) then
   raise exception 'Dating is available only to adults aged 18 and over';
 end if;
 if not exists(select 1 from public.profiles p where p.id=p_recipient_id and p.date_of_birth is not null and p.date_of_birth <= (current_date - interval '18 years')::date) then
   raise exception 'That Dating profile is not available to your account';
 end if;
 if not exists(select 1 from public.dating_profiles d where d.user_id=v_uid and d.is_published) then
   raise exception 'Publish your Dating profile before sending requests';
 end if;
 select id into v_profile_id from public.dating_profiles where user_id=p_recipient_id and is_published limit 1;
 if v_profile_id is null then raise exception 'That Dating profile is not available'; end if;
 select id into v_existing from public.message_requests
 where sender_id=p_recipient_id and recipient_id=v_uid and source_type='dating'
 and source_id=(select id from public.dating_profiles where user_id=v_uid and is_published limit 1)
 and status='pending' limit 1;
 if v_existing is not null then
   v_result := public.respond_direct_message_request_secure(v_existing,true);
   v_thread := (v_result->>'thread_id')::uuid;
   return jsonb_build_object('status','matched','request_id',v_existing,'thread_id',v_thread);
 end if;
 select thread_id into v_thread from public.dating_matches
 where status='matched' and ((user_a=least(v_uid,p_recipient_id) and user_b=greatest(v_uid,p_recipient_id)))
 limit 1;
 if v_thread is not null then
   return jsonb_build_object('status','matched','thread_id',v_thread);
 end if;
 v_existing := public.send_message_request(p_recipient_id,'dating',v_profile_id,'I would like to connect with you on Circle Panda Dating 💗');
 return jsonb_build_object('status','pending','request_id',v_existing);
end;
$$;
revoke all on function public.request_dating_match_secure(uuid) from public,anon;
grant execute on function public.request_dating_match_secure(uuid) to authenticated;
