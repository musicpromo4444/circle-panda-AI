-- Enforce adult-only dating discovery at the database boundary.
create or replace function public.enforce_published_dating_age()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_birth_date date;
begin
  if new.is_published then
    select p.date_of_birth into v_birth_date
    from public.profiles p where p.id = new.user_id;
    if v_birth_date is null or v_birth_date > (current_date - interval '18 years')::date then
      raise exception 'Dating profiles can only be published by users aged 18 or older';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists dating_profile_adult_guard on public.dating_profiles;
create trigger dating_profile_adult_guard
before insert or update of user_id, is_published on public.dating_profiles
for each row execute function public.enforce_published_dating_age();

drop policy if exists "published dating profiles readable" on public.dating_profiles;
create policy "published adult dating profiles readable" on public.dating_profiles
for select to authenticated
using (
  auth.uid() = user_id
  or (
    is_published
    and exists (
      select 1 from public.profiles p
      where p.id = user_id
        and p.date_of_birth is not null
        and p.date_of_birth <= (current_date - interval '18 years')::date
    )
  )
);

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
  end if;
  return new;
end;
$$;

drop trigger if exists validate_message_request_source_before_insert on public.message_requests;
create trigger validate_message_request_source_before_insert
before insert on public.message_requests
for each row execute function public.validate_message_request_source();
