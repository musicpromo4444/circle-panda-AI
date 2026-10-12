-- Schedule MCM on Monday and WCW on Wednesday at 10:00 in the creator's local timezone.
alter table public.profiles add column if not exists timezone text;
alter table public.crush_posts add column if not exists scheduled_for timestamptz;
update public.crush_posts set scheduled_for=created_at where scheduled_for is null;
alter table public.crush_posts alter column scheduled_for set default now();
create index if not exists crush_posts_scheduled_for_idx on public.crush_posts(scheduled_for,week_start desc);

create or replace function public.schedule_crush_post()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_timezone text;
  v_local timestamp;
  v_target_date date;
  v_target_dow integer;
begin
  select p.timezone into v_timezone from public.profiles p where p.id=new.user_id;
  if coalesce(v_timezone,'')='' or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then
    v_timezone := 'UTC';
  end if;
  v_local := now() at time zone v_timezone;
  v_target_dow := case when new.crush_type='mcm' then 1 else 3 end;
  v_target_date := v_local::date + ((v_target_dow - extract(isodow from v_local)::integer + 7) % 7);
  if v_target_date=v_local::date and v_local::time >= time '10:00' then
    v_target_date := v_target_date + 7;
  end if;
  new.scheduled_for := (v_target_date + time '10:00') at time zone v_timezone;
  new.week_start := date_trunc('week', new.scheduled_for at time zone v_timezone)::date;
  return new;
end;
$$;
drop trigger if exists schedule_crush_post_before_insert on public.crush_posts;
create trigger schedule_crush_post_before_insert before insert on public.crush_posts
for each row execute function public.schedule_crush_post();

drop policy if exists "Authenticated users can view crush posts" on public.crush_posts;
create policy "Authenticated users can view crush posts" on public.crush_posts for select to authenticated
using (scheduled_for <= now() or auth.uid()=user_id);

create or replace function public.cast_crush_vote(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_post public.crush_posts%rowtype; v_votes integer; v_count integer; v_timezone text; v_week_start timestamptz;
begin
  if v_user is null then raise exception 'Sign in to vote'; end if;
  select * into v_post from public.crush_posts where id=p_post_id;
  if not found then raise exception 'Crush post not found'; end if;
  if v_post.user_id=v_user then raise exception 'You cannot vote for your own crush post'; end if;
  if v_post.scheduled_for > now() then raise exception 'This crush card is not live yet'; end if;
  select p.timezone into v_timezone from public.profiles p where p.id=v_user;
  if coalesce(v_timezone,'')='' or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then v_timezone:='UTC'; end if;
  v_week_start := date_trunc('week',now() at time zone v_timezone) at time zone v_timezone;
  if v_post.week_start <> date_trunc('week',now() at time zone v_timezone)::date then raise exception 'Voting for this week has closed'; end if;
  if exists(select 1 from public.crush_votes where post_id=p_post_id and user_id=v_user) then
    return jsonb_build_object('voted',true,'already_voted',true);
  end if;
  select count(*) into v_votes from public.crush_votes cv where cv.user_id=v_user and cv.created_at >= v_week_start and cv.created_at < v_week_start + interval '7 days';
  if v_votes >= 3 then raise exception 'Your 3 free weekly crush votes are used. Extra BC/ad voting is not available yet.'; end if;
  insert into public.crush_votes(post_id,user_id) values(p_post_id,v_user);
  select count(*) into v_count from public.crush_votes where post_id=p_post_id;
  return jsonb_build_object('voted',true,'free_votes_used',v_votes+1,'post_votes',v_count);
end;
$$;
revoke all on function public.cast_crush_vote(uuid) from public, anon;
grant execute on function public.cast_crush_vote(uuid) to authenticated;
