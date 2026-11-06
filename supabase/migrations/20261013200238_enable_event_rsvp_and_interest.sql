
create or replace function public.toggle_event_rsvp_secure(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_status text; v_attending boolean; v_interested boolean; v_attendee_count integer; v_interested_count integer;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.events where id=p_event_id and is_published=true) then raise exception 'Event not found or unavailable'; end if;
 select status into v_status from public.event_attendees where event_id=p_event_id and user_id=v_uid for update;
 if v_status='attending' then
  delete from public.event_attendees where event_id=p_event_id and user_id=v_uid;
 else
  insert into public.event_attendees(event_id,user_id,status) values(p_event_id,v_uid,'attending')
  on conflict(event_id,user_id) do update set status='attending';
 end if;
 select exists(select 1 from public.event_attendees where event_id=p_event_id and user_id=v_uid and status='attending') into v_attending;
 select exists(select 1 from public.event_attendees where event_id=p_event_id and user_id=v_uid and status='interested') into v_interested;
 select count(*)::integer into v_attendee_count from public.event_attendees where event_id=p_event_id and status='attending';
 select count(*)::integer into v_interested_count from public.event_attendees where event_id=p_event_id and status='interested';
 return jsonb_build_object('attending',v_attending,'interested',v_interested,'attendee_count',v_attendee_count,'interested_count',v_interested_count,'response_count',v_attendee_count+v_interested_count);
end;
$$;

create or replace function public.toggle_event_interest_secure(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_status text; v_attending boolean; v_interested boolean; v_attendee_count integer; v_interested_count integer;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.events where id=p_event_id and is_published=true) then raise exception 'Event not found or unavailable'; end if;
 select status into v_status from public.event_attendees where event_id=p_event_id and user_id=v_uid for update;
 if v_status='interested' then
  delete from public.event_attendees where event_id=p_event_id and user_id=v_uid;
 elsif v_status='attending' then
  raise exception 'You are already attending this event';
 else
  insert into public.event_attendees(event_id,user_id,status) values(p_event_id,v_uid,'interested')
  on conflict(event_id,user_id) do update set status='interested';
 end if;
 select exists(select 1 from public.event_attendees where event_id=p_event_id and user_id=v_uid and status='attending') into v_attending;
 select exists(select 1 from public.event_attendees where event_id=p_event_id and user_id=v_uid and status='interested') into v_interested;
 select count(*)::integer into v_attendee_count from public.event_attendees where event_id=p_event_id and status='attending';
 select count(*)::integer into v_interested_count from public.event_attendees where event_id=p_event_id and status='interested';
 return jsonb_build_object('attending',v_attending,'interested',v_interested,'attendee_count',v_attendee_count,'interested_count',v_interested_count,'response_count',v_attendee_count+v_interested_count);
end;
$$;

revoke all on function public.toggle_event_rsvp_secure(uuid) from public,anon;
grant execute on function public.toggle_event_rsvp_secure(uuid) to authenticated;
revoke all on function public.toggle_event_interest_secure(uuid) from public,anon;
grant execute on function public.toggle_event_interest_secure(uuid) to authenticated;
