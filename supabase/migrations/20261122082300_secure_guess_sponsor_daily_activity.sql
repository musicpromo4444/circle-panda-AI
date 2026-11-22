-- Make Guess Sponsor a real, server-validated daily challenge.
-- This migration depends on 20261120080500_daily_activity_success_gate.sql,
-- which adds user_daily_activity_attempts.successful and closes direct client writes.
begin;

create table if not exists private.daily_activity_sponsor_questions (
  attempt_id uuid primary key references public.user_daily_activity_attempts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_campaign_id uuid references public.sponsor_campaigns(id) on delete set null,
  target_sponsor_name text not null check (char_length(trim(target_sponsor_name)) between 1 and 160),
  option_sponsor_names text[] not null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint daily_activity_sponsor_options_count
    check (cardinality(option_sponsor_names) between 2 and 4),
  constraint daily_activity_sponsor_target_in_options
    check (target_sponsor_name = any(option_sponsor_names))
);

alter table private.daily_activity_sponsor_questions enable row level security;
revoke all on table private.daily_activity_sponsor_questions from public, anon, authenticated;
comment on table private.daily_activity_sponsor_questions is
  'Private server-side answer key and option snapshot for Guess Sponsor daily activity. Never exposed to client roles.';

-- The previous skill-check migration grandfathered in-flight attempts. Guess
-- Sponsor had no trustworthy answer signal before this migration, so unfinished
-- attempts must not inherit that compatibility flag or old action count.
update public.user_daily_activity_attempts
set successful = false,
    action_count = 0
where activity_key = 'guess_sponsor'
  and completed_at is null;

create or replace function public.reset_daily_sponsor_question_after_attempt_restart()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.activity_key = 'guess_sponsor'
     and new.started_at is distinct from old.started_at then
    delete from private.daily_activity_sponsor_questions q
    where q.attempt_id = new.id
      and q.user_id = new.user_id;
  end if;
  return new;
end
$function$;

drop trigger if exists reset_daily_sponsor_question_after_attempt_restart
  on public.user_daily_activity_attempts;
create trigger reset_daily_sponsor_question_after_attempt_restart
after update of started_at on public.user_daily_activity_attempts
for each row
when (old.started_at is distinct from new.started_at)
execute function public.reset_daily_sponsor_question_after_attempt_restart();

revoke all on function public.reset_daily_sponsor_question_after_attempt_restart() from public, anon, authenticated;

create or replace function public.require_active_sponsor_reveal_for_daily_attempt()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_distinct_sponsors integer;
  v_has_reveal boolean;
begin
  if new.activity_key <> 'guess_sponsor' then
    return new;
  end if;

  if exists (
    select 1
    from public.user_daily_activity_attempts a
    where a.user_id = new.user_id
      and a.cycle_start_date = new.cycle_start_date
      and a.day_number = new.day_number
  ) then
    return new;
  end if;

  select count(distinct lower(trim(c.sponsor_name)))
  into v_distinct_sponsors
  from public.sponsor_campaigns c
  where c.status = 'active'
    and c.starts_at <= now()
    and c.ends_at > now();

  select exists (
    select 1
    from public.sponsor_campaigns c
    where c.status = 'active'
      and c.format = 'sponsor_reveal'
      and c.starts_at <= now()
      and c.ends_at > now()
  ) into v_has_reveal;

  if coalesce(v_distinct_sponsors, 0) < 2 or not v_has_reveal then
    raise exception 'Guess Sponsor is temporarily unavailable. An administrator must publish one active Sponsor Reveal campaign and at least one other active sponsor.';
  end if;

  return new;
end
$function$;

drop trigger if exists require_active_sponsor_reveal_for_daily_attempt
  on public.user_daily_activity_attempts;
create trigger require_active_sponsor_reveal_for_daily_attempt
before insert on public.user_daily_activity_attempts
for each row execute function public.require_active_sponsor_reveal_for_daily_attempt();

revoke all on function public.require_active_sponsor_reveal_for_daily_attempt() from public, anon, authenticated;

create or replace function public.get_daily_sponsor_guess()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_start date;
  v_day integer;
  v_attempt public.user_daily_activity_attempts;
  v_question private.daily_activity_sponsor_questions;
  v_target public.sponsor_campaigns;
  v_options text[];
  v_target_sponsor_name text;
  v_target_is_active boolean;
  v_has_question boolean := false;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;

  select s.cycle_start_date into v_start
  from public.user_daily_activity_state s
  where s.user_id = v_uid
  for update;

  if v_start is null then raise exception 'Open Daily Activities first'; end if;
  v_day := ((now() at time zone 'utc')::date - v_start) + 1;
  if v_day < 1 or v_day > 7 then raise exception 'Your activity cycle needs refreshing'; end if;

  select a.* into v_attempt
  from public.user_daily_activity_attempts a
  where a.user_id = v_uid
    and a.cycle_start_date = v_start
    and a.day_number = v_day
  for update;

  if not found or v_attempt.activity_key <> 'guess_sponsor' then
    raise exception 'Start the assigned Guess Sponsor activity first';
  end if;
  if v_attempt.completed_at is not null then raise exception 'This activity is already completed'; end if;
  if now() - v_attempt.started_at > interval '30 minutes' then raise exception 'This activity attempt expired'; end if;

  select q.* into v_question
  from private.daily_activity_sponsor_questions q
  where q.attempt_id = v_attempt.id
    and q.user_id = v_uid
  for update;
  v_has_question := found;

  if v_has_question and v_question.answered_at is null then
    select exists (
      select 1
      from public.sponsor_campaigns c
      where c.id = v_question.target_campaign_id
        and c.status = 'active'
        and c.format = 'sponsor_reveal'
        and c.starts_at <= now()
        and c.ends_at > now()
    ) into v_target_is_active;

    if not v_target_is_active then
      delete from private.daily_activity_sponsor_questions q
      where q.attempt_id = v_attempt.id and q.user_id = v_uid;
      v_has_question := false;
    end if;
  end if;

  if not v_has_question then
    select c.* into v_target
    from public.sponsor_campaigns c
    where c.status = 'active'
      and c.format = 'sponsor_reveal'
      and c.starts_at <= now()
      and c.ends_at > now()
    order by random()
    limit 1;

    if not found then
      raise exception 'No active Sponsor Reveal campaign is available yet';
    end if;

    v_target_sponsor_name := trim(v_target.sponsor_name);

    select array_agg(choice.sponsor_name order by random())
    into v_options
    from (
      select candidates.sponsor_name
      from (
        select min(trim(c.sponsor_name)) as sponsor_name
        from public.sponsor_campaigns c
        where c.status = 'active'
          and c.starts_at <= now()
          and c.ends_at > now()
        group by lower(trim(c.sponsor_name))
      ) candidates
      order by
        case when lower(candidates.sponsor_name) = lower(v_target_sponsor_name) then 0 else 1 end,
        random()
      limit 4
    ) choice;

    if coalesce(cardinality(v_options), 0) < 2 then
      raise exception 'At least two distinct active sponsors are required for Guess Sponsor';
    end if;

    select choices.sponsor_name into v_target_sponsor_name
    from unnest(v_options) as choices(sponsor_name)
    where lower(trim(choices.sponsor_name)) = lower(trim(v_target.sponsor_name))
    limit 1;

    if v_target_sponsor_name is null then
      raise exception 'The active sponsor choices could not be prepared. Please try again';
    end if;

    insert into private.daily_activity_sponsor_questions (
      attempt_id, user_id, target_campaign_id, target_sponsor_name, option_sponsor_names
    )
    values (
      v_attempt.id, v_uid, v_target.id, v_target_sponsor_name, v_options
    )
    returning * into v_question;
  end if;

  return jsonb_build_object(
    'question', 'Which sponsor is featured today?',
    'options', to_jsonb(v_question.option_sponsor_names),
    'answered', v_question.answered_at is not null,
    'successful', coalesce(v_attempt.successful, false)
  );
end
$function$;

revoke all on function public.get_daily_sponsor_guess() from public, anon, authenticated;
grant execute on function public.get_daily_sponsor_guess() to authenticated;

create or replace function public.submit_daily_sponsor_guess(p_sponsor_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_start date;
  v_day integer;
  v_attempt public.user_daily_activity_attempts;
  v_question private.daily_activity_sponsor_questions;
  v_target_is_active boolean;
  v_correct boolean;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  if p_sponsor_name is null or char_length(trim(p_sponsor_name)) not between 1 and 160 then
    raise exception 'Choose one of the listed sponsor options';
  end if;

  select s.cycle_start_date into v_start
  from public.user_daily_activity_state s
  where s.user_id = v_uid
  for update;

  if v_start is null then raise exception 'Open Daily Activities first'; end if;
  v_day := ((now() at time zone 'utc')::date - v_start) + 1;
  if v_day < 1 or v_day > 7 then raise exception 'Your activity cycle needs refreshing'; end if;

  select a.* into v_attempt
  from public.user_daily_activity_attempts a
  where a.user_id = v_uid
    and a.cycle_start_date = v_start
    and a.day_number = v_day
  for update;

  if not found or v_attempt.activity_key <> 'guess_sponsor' then
    raise exception 'Start the assigned Guess Sponsor activity first';
  end if;
  if v_attempt.completed_at is not null then raise exception 'This activity is already completed'; end if;
  if now() - v_attempt.started_at > interval '30 minutes' then raise exception 'This activity attempt expired'; end if;
  if v_attempt.action_count >= 20 then raise exception 'Activity action limit reached'; end if;

  select q.* into v_question
  from private.daily_activity_sponsor_questions q
  where q.attempt_id = v_attempt.id
    and q.user_id = v_uid
  for update;

  if not found then raise exception 'Load the sponsor choices before submitting a guess'; end if;
  if v_question.answered_at is not null then raise exception 'A sponsor guess has already been submitted for this round'; end if;
  if not exists (
    select 1
    from unnest(v_question.option_sponsor_names) as choices(sponsor_name)
    where lower(trim(choices.sponsor_name)) = lower(trim(p_sponsor_name))
  ) then
    raise exception 'Choose one of the listed sponsor options';
  end if;

  select exists (
    select 1
    from public.sponsor_campaigns c
    where c.id = v_question.target_campaign_id
      and c.status = 'active'
      and c.format = 'sponsor_reveal'
      and c.starts_at <= now()
      and c.ends_at > now()
  ) into v_target_is_active;

  if not v_target_is_active then
    raise exception 'The featured sponsor campaign is no longer active. Reopen the activity to refresh its choices';
  end if;

  v_correct := lower(trim(p_sponsor_name)) = lower(trim(v_question.target_sponsor_name));

  update private.daily_activity_sponsor_questions q
  set answered_at = now()
  where q.attempt_id = v_attempt.id
    and q.user_id = v_uid;

  update public.user_daily_activity_attempts a
  set action_count = a.action_count + 1,
      successful = v_correct
  where a.id = v_attempt.id
    and a.user_id = v_uid;

  return jsonb_build_object(
    'correct', v_correct,
    'outcome', case
      when v_correct then 'Correct! You identified the featured sponsor. Complete the activity to claim its BC reward.'
      else 'That is not the featured sponsor. Your one guess has been used; no BC was awarded.'
    end
  );
end
$function$;

revoke all on function public.submit_daily_sponsor_guess(text) from public, anon, authenticated;
grant execute on function public.submit_daily_sponsor_guess(text) to authenticated;

create or replace function public.enforce_daily_sponsor_guess_success()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_success boolean;
begin
  if new.activity_key <> 'guess_sponsor' then
    return new;
  end if;

  select coalesce(a.successful, false) into v_success
  from public.user_daily_activity_attempts a
  where a.user_id = new.user_id
    and a.cycle_start_date = new.cycle_start_date
    and a.day_number = new.day_number
    and a.activity_key = 'guess_sponsor';

  if not coalesce(v_success, false) then
    raise exception 'Identify the featured sponsor correctly before claiming this BC reward';
  end if;

  return new;
end
$function$;

drop trigger if exists enforce_daily_sponsor_guess_success
  on public.user_daily_activity_completions;
create trigger enforce_daily_sponsor_guess_success
before insert on public.user_daily_activity_completions
for each row execute function public.enforce_daily_sponsor_guess_success();

revoke all on function public.enforce_daily_sponsor_guess_success() from public, anon, authenticated;

comment on function public.get_daily_sponsor_guess() is
  'Returns active sponsor choices for the authenticated user without exposing the private answer key.';
comment on function public.submit_daily_sponsor_guess(text) is
  'Records one authenticated sponsor guess and persists server-validated attempt success without crediting BC.';

commit;
