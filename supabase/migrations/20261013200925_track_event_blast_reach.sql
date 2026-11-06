
alter table public.events add column if not exists reach_count integer not null default 0;
create or replace function public.add_event_blast_reach()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if new.status='active' then
  update public.events set reach_count=reach_count+new.unique_reach where id=new.event_id;
 end if;
 return new;
end;
$$;
drop trigger if exists add_event_blast_reach_trigger on public.event_blasts;
create trigger add_event_blast_reach_trigger after insert on public.event_blasts
for each row execute function public.add_event_blast_reach();

create or replace function public.get_events_for_user()
returns setof jsonb language sql stable security definer set search_path = ''
as $$
 select jsonb_build_object(
  'id',e.id,'creator_id',e.creator_id,'title',e.title,'description',e.description,'location',coalesce(e.venue_name,e.venue),
  'starts_at',e.starts_at,'ends_at',e.ends_at,'category',coalesce(e.category,'Meetup'),
  'entry_fee_amount',e.entry_fee_amount,'entry_fee_currency',e.entry_fee_currency,
  'viewer_going',exists(select 1 from public.event_attendees a where a.event_id=e.id and a.user_id=auth.uid() and a.status='attending'),
  'viewer_interested',exists(select 1 from public.event_attendees a where a.event_id=e.id and a.user_id=auth.uid() and a.status='interested'),
  'attendee_count',(select count(*) from public.event_attendees a where a.event_id=e.id and a.status='attending'),
  'interested_count',(select count(*) from public.event_attendees a where a.event_id=e.id and a.status='interested'),
  'response_count',(select count(*) from public.event_attendees a where a.event_id=e.id),
  'reach_count',coalesce(e.reach_count,0),'reach_scope',e.reach_scope,'reach_country',e.reach_country,'reach_state',e.reach_state,
  'reach_city',e.reach_city,'reach_area',e.reach_area,'duration_minutes',e.duration_minutes,
  'cover_url',e.cover_url,'venue_name',e.venue_name,'address_line',e.address_line,'country',e.country,
  'state_province',e.state_province,'city',e.city,'area',e.area,'latitude',e.latitude,'longitude',e.longitude
 )
 from public.events e where e.is_published=true
 order by e.starts_at asc;
$$;
