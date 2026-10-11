create or replace function public.validate_message_request_source()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_sender_birth_date date;
  v_recipient_birth_date date;
begin
  if new.source_type = 'dating' then
    select p.date_of_birth into v_sender_birth_date from public.profiles p where p.id = new.sender_id;
    select p.date_of_birth into v_recipient_birth_date from public.profiles p where p.id = new.recipient_id;
    if v_sender_birth_date is null or v_sender_birth_date > (current_date - interval '18 years')::date
      or v_recipient_birth_date is null or v_recipient_birth_date > (current_date - interval '18 years')::date then
      raise exception 'Dating message requests are limited to adults aged 18 or older';
    end if;
    if new.source_id is null or not exists (
      select 1 from public.dating_profiles dp
      where dp.id = new.source_id and dp.user_id = new.recipient_id and dp.is_published
    ) then raise exception 'That dating profile is not available'; end if;
  elsif new.source_type = 'event' then
    if new.source_id is null or not exists (
      select 1 from public.events e
      where e.id = new.source_id and e.creator_id = new.recipient_id and e.is_published
    ) then raise exception 'That event is not available'; end if;
  elsif new.source_type = 'feed' then
    if new.source_id is null or not exists (
      select 1 from public.feed_posts fp where fp.id = new.source_id and fp.author_id = new.recipient_id
    ) then raise exception 'That post is not available'; end if;
  end if;
  return new;
end;
$$;

create or replace function public.send_post_message_request(p_post_id uuid, p_greeting text default '')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_sender_id uuid := auth.uid();
  v_author_id uuid;
begin
  if v_sender_id is null then raise exception 'Sign in is required'; end if;
  select fp.author_id into v_author_id from public.feed_posts fp where fp.id = p_post_id;
  if not found then raise exception 'That post is not available'; end if;
  if v_author_id = v_sender_id then raise exception 'You cannot message yourself'; end if;
  return public.send_message_request(v_author_id, 'feed', p_post_id,
    coalesce(nullif(left(p_greeting,1000),''),'Hi! I saw your post and would like to connect.'));
end;
$$;
revoke all on function public.send_post_message_request(uuid,text) from public;
grant execute on function public.send_post_message_request(uuid,text) to authenticated;
