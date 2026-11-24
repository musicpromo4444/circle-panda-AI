begin;

-- Skill-check answers must be fixed for the lifetime of a round and kept
-- outside the exposed public schema. The browser receives choices only; it
-- never receives the selected target.
create table if not exists private.daily_activity_skill_questions (
  attempt_id uuid primary key
    references public.user_daily_activity_attempts(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  activity_key text not null
    check (activity_key in ('panda_cup_shuffle', 'panda_target', 'panda_puzzle')),
  target_key text not null,
  selected_key text,
  answered_at timestamptz,
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  constraint daily_activity_skill_target_check check (
    (activity_key = 'panda_cup_shuffle' and target_key in ('Left cup', 'Middle cup', 'Right cup'))
    or (activity_key = 'panda_target' and target_key in ('Target left', 'Bullseye', 'Target right'))
    or (activity_key = 'panda_puzzle' and target_key in ('Panda face', 'Golden coin', 'Green bamboo'))
  ),
  constraint daily_activity_skill_selection_check check (
    selected_key is null
    or (activity_key = 'panda_cup_shuffle' and selected_key in ('Left cup', 'Middle cup', 'Right cup'))
    or (activity_key = 'panda_target' and selected_key in ('Target left', 'Bullseye', 'Target right'))
    or (activity_key = 'panda_puzzle' and selected_key in ('Panda face', 'Golden coin', 'Green bamboo'))
  ),
  constraint daily_activity_skill_answer_state_check check (
    (answered_at is null and selected_key is null and is_correct = false)
    or (answered_at is not null and selected_key is not null and is_correct = (selected_key = target_key))
  )
);

alter table private.daily_activity_skill_questions enable row level security;
revoke all on table private.daily_activity_skill_questions from public, anon, authenticated, service_role;

comment on table private.daily_activity_skill_questions is
  'Private server-side answer keys for daily skill challenges. No browser role has table privileges or RLS policies.';

-- The previous migration temporarily preserved in-flight skill attempts. Reset
-- only unfinished attempts in the current user cycle so no old client-side or
-- grandfathered success flag can be used to claim a reward.
update public.user_daily_activity_attempts a
set started_at = now(),
    action_count = 0,
    successful = false
from public.user_daily_activity_state s
where s.user_id = a.user_id
  and s.cycle_start_date = a.cycle_start_date
  and a.completed_at is null
  and a.activity_key in ('panda_cup_shuffle', 'panda_target', 'panda_puzzle');

insert into private.daily_activity_skill_questions (
  attempt_id, user_id, activity_key, target_key
)
select
  a.id,
  a.user_id,
  a.activity_key,
  case a.activity_key
    when 'panda_cup_shuffle' then
      (array['Left cup', 'Middle cup', 'Right cup'])[1 + floor(random() * 3)::integer]
    when 'panda_target' then
      (array['Target left', 'Bullseye', 'Target right'])[1 + floor(random() * 3)::integer]
    when 'panda_puzzle' then
      (array['Panda face', 'Golden coin', 'Green bamboo'])[1 + floor(random() * 3)::integer]
  end
from public.user_daily_activity_attempts a
join public.user_daily_activity_state s
  on s.user_id = a.user_id
 and s.cycle_start_date = a.cycle_start_date
where a.completed_at is null
  and a.activity_key in ('panda_cup_shuffle', 'panda_target', 'panda_puzzle')
on conflict (attempt_id) do nothing;

create or replace function public.start_daily_activity(p_activity_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_start date;
  v_today date := (now() at time zone 'utc')::date;
  v_day integer;
  v_key text;
  v_schedule_enabled boolean;
  v_activity_enabled boolean;
  v_ad_only boolean;
  v_attempt public.user_daily_activity_attempts;
  v_question private.daily_activity_skill_questions%rowtype;
  v_is_skill boolean := false;
  v_challenge_answered boolean := false;
  v_challenge_successful boolean := false;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  if p_activity_key is null then raise exception 'An activity key is required'; end if;

  insert into public.user_daily_activity_state(user_id, cycle_start_date)
  values (v_uid, v_today)
  on conflict (user_id) do nothing;

  select cycle_start_date into v_start
  from public.user_daily_activity_state
  where user_id = v_uid
  for update;

  if v_today < v_start or v_today >= v_start + 7 then
    update public.user_daily_activity_state
    set cycle_start_date = v_today, updated_at = now()
    where user_id = v_uid
    returning cycle_start_date into v_start;
  end if;

  v_day := (v_today - v_start) + 1;

  select s.activity_key, s.enabled, c.enabled, c.is_ad_only
  into v_key, v_schedule_enabled, v_activity_enabled, v_ad_only
  from public.daily_activity_schedule s
  join public.daily_activity_catalog c using (activity_key)
  where s.day_number = v_day;

  if v_key is null or v_key <> p_activity_key then
    raise exception 'Start the activity assigned for today';
  end if;
  if not coalesce(v_schedule_enabled, false) or not coalesce(v_activity_enabled, false) then
    raise exception 'Today’s activity is disabled by the administrator';
  end if;
  if coalesce(v_ad_only, false) then
    raise exception 'Sponsored activity requires verified ad playback';
  end if;
  if exists (
    select 1 from public.user_daily_activity_completions
    where user_id = v_uid and cycle_start_date = v_start and day_number = v_day
  ) then
    raise exception 'Today’s activity is already completed';
  end if;

  insert into public.user_daily_activity_attempts(user_id, cycle_start_date, day_number, activity_key)
  values (v_uid, v_start, v_day, v_key)
  on conflict (user_id, cycle_start_date, day_number) do nothing;

  select * into v_attempt
  from public.user_daily_activity_attempts
  where user_id = v_uid and cycle_start_date = v_start and day_number = v_day
  for update;

  if v_attempt.completed_at is not null then
    raise exception 'Today’s activity is already completed';
  end if;

  v_is_skill := v_key in ('panda_cup_shuffle', 'panda_target', 'panda_puzzle');

  if v_is_skill then
    select * into v_question
    from private.daily_activity_skill_questions q
    where q.attempt_id = v_attempt.id and q.user_id = v_uid
    for update;

    if now() - v_attempt.started_at > interval '30 minutes' then
      if v_question.attempt_id is not null and v_question.answered_at is not null then
        -- Preserve a submitted answer (right or wrong); only refresh the
        -- completion window so a correct answer is not lost after inactivity.
        update public.user_daily_activity_attempts
        set started_at = now()
        where id = v_attempt.id
        returning * into v_attempt;
      else
        -- An unanswered expired round may be restarted with a new hidden target.
        update public.user_daily_activity_attempts
        set started_at = now(), action_count = 0, successful = false
        where id = v_attempt.id
        returning * into v_attempt;

        delete from private.daily_activity_skill_questions
        where attempt_id = v_attempt.id and user_id = v_uid;
        v_question := null;
      end if;
    end if;

    if v_question.attempt_id is null then
      insert into private.daily_activity_skill_questions (
        attempt_id, user_id, activity_key, target_key
      )
      values (
        v_attempt.id,
        v_uid,
        v_key,
        case v_key
          when 'panda_cup_shuffle' then
            (array['Left cup', 'Middle cup', 'Right cup'])[1 + floor(random() * 3)::integer]
          when 'panda_target' then
            (array['Target left', 'Bullseye', 'Target right'])[1 + floor(random() * 3)::integer]
          when 'panda_puzzle' then
            (array['Panda face', 'Golden coin', 'Green bamboo'])[1 + floor(random() * 3)::integer]
        end
      )
      returning * into v_question;
    end if;

    v_challenge_answered := v_question.answered_at is not null;
    v_challenge_successful := v_question.is_correct;
  elsif now() - v_attempt.started_at > interval '30 minutes' and v_key <> 'coin_drop' then
    update public.user_daily_activity_attempts
    set started_at = now(), action_count = 0, successful = false
    where id = v_attempt.id
    returning * into v_attempt;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'started_at', v_attempt.started_at,
    'activity_key', v_attempt.activity_key,
    'day_number', v_day,
    'challenge_answered', v_challenge_answered,
    'challenge_successful', v_challenge_successful
  );
end
$function$;

create or replace function public.record_daily_activity_action(p_activity_key text, p_action text)
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
  v_question private.daily_activity_skill_questions%rowtype;
  v_outcome text := 'Action recorded.';
  v_target text;
  v_correct boolean := false;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  if p_activity_key is null then raise exception 'An activity key is required'; end if;
  if p_action is null or length(trim(p_action)) < 1 or length(p_action) > 80 then
    raise exception 'Invalid activity action';
  end if;

  select cycle_start_date into v_start
  from public.user_daily_activity_state
  where user_id = v_uid
  for update;

  if v_start is null then raise exception 'Open Daily Activities first'; end if;
  v_day := ((now() at time zone 'utc')::date - v_start) + 1;
  if v_day < 1 or v_day > 7 then raise exception 'Your activity cycle needs refreshing'; end if;

  select * into v_attempt
  from public.user_daily_activity_attempts
  where user_id = v_uid
    and cycle_start_date = v_start
    and day_number = v_day
  for update;

  if v_attempt.id is null or v_attempt.activity_key <> p_activity_key then
    raise exception 'Start the assigned activity first';
  end if;
  if v_attempt.completed_at is not null then raise exception 'This activity is already completed'; end if;
  if now() - v_attempt.started_at > interval '30 minutes' then raise exception 'This activity attempt expired'; end if;

  if p_activity_key in ('panda_cup_shuffle', 'panda_target', 'panda_puzzle') then
    select * into v_question
    from private.daily_activity_skill_questions q
    where q.attempt_id = v_attempt.id and q.user_id = v_uid
    for update;

    if v_question.attempt_id is null then
      raise exception 'The challenge could not be loaded. Restart the activity.';
    end if;
    if v_question.answered_at is not null or coalesce(v_attempt.action_count, 0) >= 1 then
      raise exception 'This daily challenge already has an answer. You can try again in your next activity cycle.';
    end if;

    if not (
      (p_activity_key = 'panda_cup_shuffle' and p_action in ('Left cup', 'Middle cup', 'Right cup'))
      or (p_activity_key = 'panda_target' and p_action in ('Target left', 'Bullseye', 'Target right'))
      or (p_activity_key = 'panda_puzzle' and p_action in ('Panda face', 'Golden coin', 'Green bamboo'))
    ) then
      raise exception 'Choose one of the displayed challenge options';
    end if;

    v_correct := p_action = v_question.target_key;
    v_outcome := case
      when v_correct then
        case p_activity_key
          when 'panda_cup_shuffle' then 'You found the panda token! Great work.'
          when 'panda_target' then 'Bullseye! You hit the correct target.'
          else 'Puzzle solved! You found the matching piece.'
        end
      else
        'Not quite. Your one answer for today has been used. Come back for the next daily challenge.'
    end;

    update private.daily_activity_skill_questions
    set selected_key = p_action,
        answered_at = now(),
        is_correct = v_correct
    where attempt_id = v_attempt.id and user_id = v_uid;

    update public.user_daily_activity_attempts
    set action_count = 1,
        successful = v_correct
    where id = v_attempt.id
    returning * into v_attempt;

    return jsonb_build_object(
      'action_count', v_attempt.action_count,
      'activity_key', v_attempt.activity_key,
      'outcome', v_outcome,
      'correct', v_correct,
      'answered', true,
      'can_retry', false
    );
  end if;

  if v_attempt.action_count >= 20 then raise exception 'Activity action limit reached'; end if;

  if p_action = 'start_round' then
    case p_activity_key
      when 'wheel_spin' then
        v_target := (array['Golden Panda', 'Bamboo Boost', 'Lucky Lantern', 'Silver Paw'])[1 + floor(random() * 4)::int];
        v_outcome := 'The wheel landed on ' || v_target || '.';
      when 'secret_reveal' then
        v_outcome := (array[
          'Your prompt: leave a kind comment on a confession.',
          'Your prompt: send someone an encouraging message.',
          'Your prompt: share a positive thought.',
          'Your prompt: celebrate someone in your circle.'
        ])[1 + floor(random() * 4)::int];
      when 'guess_sponsor' then
        v_outcome := 'Look at the featured sponsor banner, then choose the matching option.';
      else
        v_outcome := 'Your round is ready. Make your move.';
    end case;
  elsif p_activity_key = 'lucky_cards' then
    v_target := (array['Golden Panda', 'Bamboo Boost', 'Lucky Lantern'])[1 + floor(random() * 3)::int];
    v_outcome := 'Your card revealed: ' || v_target || '.';
  elsif p_activity_key = 'mystery_box' then
    v_target := (array['Golden Gift', 'Panda Badge', 'Lucky Bamboo', 'Mystery Icon'])[1 + floor(random() * 4)::int];
    v_outcome := 'Your mystery box revealed: ' || v_target || '.';
  elsif p_activity_key = 'guess_sponsor' then
    v_outcome := 'Your sponsor choice has been recorded.';
  end if;

  update public.user_daily_activity_attempts
  set action_count = action_count + 1
  where id = v_attempt.id
  returning * into v_attempt;

  return jsonb_build_object(
    'action_count', v_attempt.action_count,
    'activity_key', v_attempt.activity_key,
    'outcome', v_outcome,
    'correct', false
  );
end
$function$;

create or replace function public.complete_daily_activity(p_activity_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_start date;
  v_today date := (now() at time zone 'utc')::date;
  v_day integer;
  v_key text;
  v_reward bigint;
  v_schedule_enabled boolean;
  v_activity_enabled boolean;
  v_ad_only boolean;
  v_balance bigint;
  v_completion_id uuid;
  v_attempt public.user_daily_activity_attempts;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
  if p_activity_key is null then raise exception 'An activity key is required'; end if;

  insert into public.user_daily_activity_state(user_id, cycle_start_date)
  values (v_uid, v_today)
  on conflict (user_id) do nothing;

  select cycle_start_date into v_start
  from public.user_daily_activity_state
  where user_id = v_uid
  for update;

  if v_today < v_start or v_today >= v_start + 7 then
    update public.user_daily_activity_state
    set cycle_start_date = v_today, updated_at = now()
    where user_id = v_uid
    returning cycle_start_date into v_start;
  end if;

  v_day := (v_today - v_start) + 1;
  if v_day < 1 or v_day > 7 then raise exception 'Your 7-day activity cycle is not active'; end if;

  if exists (
    select 1 from public.user_daily_activity_completions
    where user_id = v_uid and cycle_start_date = v_start and day_number = v_day
  ) then
    raise exception 'Today activity is already completed';
  end if;

  select s.activity_key, s.reward_bc, s.enabled, c.enabled, c.is_ad_only
  into v_key, v_reward, v_schedule_enabled, v_activity_enabled, v_ad_only
  from public.daily_activity_schedule s
  join public.daily_activity_catalog c using (activity_key)
  where s.day_number = v_day;

  if v_key is null or v_key <> p_activity_key then raise exception 'Complete the activity assigned for today'; end if;
  if not coalesce(v_schedule_enabled, false) or not coalesce(v_activity_enabled, false) then
    raise exception 'Today activity is disabled by the administrator';
  end if;
  if coalesce(v_ad_only, false) then raise exception 'Sponsored activity rewards require verified ad completion'; end if;

  select * into v_attempt
  from public.user_daily_activity_attempts
  where user_id = v_uid and cycle_start_date = v_start and day_number = v_day
  for update;

  if v_attempt.id is null or v_attempt.activity_key <> v_key then
    raise exception 'Start today activity before completing it';
  end if;
  if v_attempt.completed_at is not null then raise exception 'This activity attempt has already been used'; end if;

  if v_key in ('panda_cup_shuffle', 'panda_target', 'panda_puzzle') then
    if not coalesce(v_attempt.successful, false) or not exists (
      select 1
      from private.daily_activity_skill_questions q
      where q.attempt_id = v_attempt.id
        and q.user_id = v_uid
        and q.answered_at is not null
        and q.is_correct = true
    ) then
      raise exception 'Solve the daily challenge correctly before claiming its BC reward';
    end if;
  end if;

  if v_key not in ('coin_drop', 'panda_slots') and now() - v_attempt.started_at > interval '30 minutes' then
    raise exception 'This activity attempt expired. Reopen the activity to refresh its completion window.';
  end if;
  if v_key in ('coin_drop', 'panda_slots') and now() - v_attempt.started_at < interval '55 seconds' then
    raise exception 'Complete the activity round before claiming its reward';
  end if;
  if v_key not in ('coin_drop', 'panda_slots') and now() - v_attempt.started_at < interval '3 seconds' then
    raise exception 'Complete the activity round before claiming its reward';
  end if;
  if v_key not in ('coin_drop', 'panda_slots') and coalesce(v_attempt.action_count, 0) < 1 then
    raise exception 'Play the activity round before claiming its reward';
  end if;

  if v_key = 'coin_drop' and not exists (
    select 1 from public.daily_coin_drop_sessions d
    where d.user_id = v_uid and d.cycle_start_date = v_start and d.day_number = v_day
      and d.completed_at is not null and d.active = false
  ) then
    raise exception 'Finish the full Coin Drop round before claiming the activity reward';
  end if;
  if v_key = 'panda_slots' and not exists (
    select 1 from public.daily_panda_slots_sessions d
    where d.user_id = v_uid and d.cycle_start_date = v_start and d.day_number = v_day
      and d.completed_at is not null
  ) then
    raise exception 'Finish the full Panda Slots round before claiming the activity reward';
  end if;

  v_reward := greatest(0, coalesce(v_reward, 0));
  update public.user_daily_activity_attempts set completed_at = now() where id = v_attempt.id;
  insert into public.user_daily_activity_completions(user_id, cycle_start_date, day_number, activity_key, reward_bc)
  values (v_uid, v_start, v_day, v_key, v_reward)
  returning id into v_completion_id;

  insert into public.wallet_accounts(user_id, bc_balance)
  values (v_uid, 0)
  on conflict (user_id) do nothing;

  update public.wallet_accounts
  set bc_balance = bc_balance + v_reward, updated_at = now()
  where user_id = v_uid
  returning bc_balance into v_balance;

  insert into public.wallet_transactions(user_id, currency, amount, reason, reference_id)
  values (v_uid, 'BC', v_reward, 'reward:daily_activity:' || v_key, v_completion_id);

  perform public.award_xp_for_activity(v_uid, 'daily_activity', null);

  return jsonb_build_object(
    'success', true,
    'day_number', v_day,
    'activity_key', v_key,
    'reward_bc', v_reward,
    'bc_balance', v_balance
  );
end
$function$;

revoke all on function public.start_daily_activity(text) from public, anon, authenticated, service_role;
grant execute on function public.start_daily_activity(text) to authenticated;

revoke all on function public.record_daily_activity_action(text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_daily_activity_action(text, text) to authenticated;

revoke all on function public.complete_daily_activity(text) from public, anon, authenticated, service_role;
grant execute on function public.complete_daily_activity(text) to authenticated;

commit;
