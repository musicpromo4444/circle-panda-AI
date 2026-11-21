-- Keep daily activity rewards server-validated: skill-check games must be solved
-- before complete_daily_activity can credit BC.
begin;

-- Existing in-flight attempts are grandfathered so this additive rollout does not
-- strand users who started before the new success flag existed. New attempts start false.
alter table public.user_daily_activity_attempts
  add column if not exists successful boolean not null default true;
alter table public.user_daily_activity_attempts
  alter column successful set default false;

comment on column public.user_daily_activity_attempts.successful is
  'Server-recorded success for daily skill-check activities; clients cannot write attempt rows.';

-- Attempt state is writable only through the authenticated SECURITY DEFINER
-- workflow functions below. Keep the existing owner-scoped SELECT policy.
revoke all on table public.user_daily_activity_attempts from public, anon, authenticated;
grant select on table public.user_daily_activity_attempts to authenticated;

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
  v_outcome text := 'Action recorded.';
  v_target text;
  v_correct boolean := false;
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;
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
  elsif p_activity_key = 'panda_cup_shuffle' then
    v_target := (array['Left cup', 'Middle cup', 'Right cup'])[1 + floor(random() * 3)::int];
    v_correct := p_action = v_target;
    v_outcome := case
      when v_correct then 'You found the panda token under the ' || v_target || '!'
      else 'The panda token was under the ' || v_target || '. Try another cup.'
    end;
  elsif p_activity_key = 'lucky_cards' then
    v_target := (array['Golden Panda', 'Bamboo Boost', 'Lucky Lantern'])[1 + floor(random() * 3)::int];
    v_outcome := 'Your card revealed: ' || v_target || '.';
  elsif p_activity_key = 'mystery_box' then
    v_target := (array['Golden Gift', 'Panda Badge', 'Lucky Bamboo', 'Mystery Icon'])[1 + floor(random() * 4)::int];
    v_outcome := 'Your mystery box revealed: ' || v_target || '.';
  elsif p_activity_key = 'panda_target' then
    v_target := (array['Target left', 'Bullseye', 'Target right'])[1 + floor(random() * 3)::int];
    v_correct := p_action = v_target;
    v_outcome := case
      when v_correct then 'Bullseye! You hit the target.'
      else 'The target was ' || v_target || '. Try another target.'
    end;
  elsif p_activity_key = 'panda_puzzle' then
    v_target := (array['Panda face', 'Golden coin', 'Green bamboo'])[1 + floor(random() * 3)::int];
    v_correct := p_action = v_target;
    v_outcome := case
      when v_correct then 'Puzzle solved! You found the right piece.'
      else 'The matching piece was ' || v_target || '. Try another piece.'
    end;
  elsif p_activity_key = 'guess_sponsor' then
    v_outcome := 'Your sponsor choice has been recorded.';
  end if;

  update public.user_daily_activity_attempts
  set action_count = action_count + 1,
      successful = case
        when p_activity_key in ('panda_cup_shuffle', 'panda_target', 'panda_puzzle')
          then coalesce(successful, false) or v_correct
        else successful
      end
  where id = v_attempt.id
  returning * into v_attempt;

  return jsonb_build_object(
    'action_count', v_attempt.action_count,
    'activity_key', v_attempt.activity_key,
    'outcome', v_outcome,
    'correct', v_correct
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
  if v_key not in ('coin_drop', 'panda_slots') and now() - v_attempt.started_at > interval '30 minutes' then
    raise exception 'This activity attempt expired. Start the activity again.';
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
  if v_key in ('panda_cup_shuffle', 'panda_target', 'panda_puzzle')
     and not coalesce(v_attempt.successful, false) then
    raise exception 'Solve the daily challenge correctly before claiming its BC reward';
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


-- An expired attempt is a new round, not a continuation of the old one.
-- Clear the persisted success bit as well as the action count before allowing retry.
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
begin
  if v_uid is null then raise exception 'Sign in is required'; end if;

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

  if now() - v_attempt.started_at > interval '30 minutes' and v_key <> 'coin_drop' then
    update public.user_daily_activity_attempts
    set started_at = now(),
        action_count = 0,
        successful = false
    where id = v_attempt.id
    returning * into v_attempt;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'started_at', v_attempt.started_at,
    'activity_key', v_attempt.activity_key,
    'day_number', v_day
  );
end
$function$;

revoke all on function public.start_daily_activity(text) from public, anon;
grant execute on function public.start_daily_activity(text) to authenticated;

revoke all on function public.record_daily_activity_action(text, text) from public, anon;
grant execute on function public.record_daily_activity_action(text, text) to authenticated;
revoke all on function public.complete_daily_activity(text) from public, anon;
grant execute on function public.complete_daily_activity(text) to authenticated;

commit;
