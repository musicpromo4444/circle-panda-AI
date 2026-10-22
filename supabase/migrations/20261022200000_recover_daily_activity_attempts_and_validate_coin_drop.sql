-- Recovery hardening for daily activities.
-- Live SQL migration applied to the new Circle Panda Supabase project on 2026-10-22.
-- Keep abandoned non-Coin-Drop attempts recoverable and require a finished server-side
-- Coin Drop session before its separate activity reward can be paid.

create or replace function public.start_daily_activity(p_activity_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_start date; v_today date:=(now() at time zone 'utc')::date; v_day integer;
v_key text; v_schedule_enabled boolean; v_activity_enabled boolean; v_ad_only boolean; v_attempt public.user_daily_activity_attempts;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 insert into public.user_daily_activity_state(user_id,cycle_start_date) values(v_uid,v_today) on conflict(user_id) do nothing;
 select cycle_start_date into v_start from public.user_daily_activity_state where user_id=v_uid for update;
 if v_today < v_start or v_today >= v_start+7 then
  update public.user_daily_activity_state set cycle_start_date=v_today,updated_at=now() where user_id=v_uid returning cycle_start_date into v_start;
 end if;
 v_day:=(v_today-v_start)+1;
 select s.activity_key,s.enabled,c.enabled,c.is_ad_only into v_key,v_schedule_enabled,v_activity_enabled,v_ad_only
 from public.daily_activity_schedule s join public.daily_activity_catalog c using(activity_key) where s.day_number=v_day;
 if v_key is null or v_key<>p_activity_key then raise exception 'Start the activity assigned for today'; end if;
 if not coalesce(v_schedule_enabled,false) or not coalesce(v_activity_enabled,false) then raise exception 'Today activity is disabled by the administrator'; end if;
 if coalesce(v_ad_only,false) then raise exception 'Sponsored activity requires verified ad playback'; end if;
 if exists(select 1 from public.user_daily_activity_completions where user_id=v_uid and cycle_start_date=v_start and day_number=v_day) then raise exception 'Today activity is already completed'; end if;
 insert into public.user_daily_activity_attempts(user_id,cycle_start_date,day_number,activity_key)
 values(v_uid,v_start,v_day,v_key) on conflict(user_id,cycle_start_date,day_number) do nothing;
 select * into v_attempt from public.user_daily_activity_attempts where user_id=v_uid and cycle_start_date=v_start and day_number=v_day for update;
 if v_attempt.completed_at is not null then raise exception 'Today activity is already completed'; end if;
 if now()-v_attempt.started_at > interval '30 minutes' and v_key <> 'coin_drop' then
  update public.user_daily_activity_attempts set started_at=now(),action_count=0 where id=v_attempt.id returning * into v_attempt;
 end if;
 return jsonb_build_object('attempt_id',v_attempt.id,'started_at',v_attempt.started_at,'activity_key',v_attempt.activity_key,'day_number',v_day);
end $$;

create or replace function public.complete_daily_activity(p_activity_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_start date; v_today date:=(now() at time zone 'utc')::date; v_day integer;
v_key text; v_reward bigint; v_schedule_enabled boolean; v_activity_enabled boolean; v_ad_only boolean; v_balance bigint; v_completion_id uuid; v_attempt public.user_daily_activity_attempts;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 insert into public.user_daily_activity_state(user_id,cycle_start_date) values(v_uid,v_today) on conflict(user_id) do nothing;
 select cycle_start_date into v_start from public.user_daily_activity_state where user_id=v_uid for update;
 if v_today < v_start or v_today >= v_start+7 then update public.user_daily_activity_state set cycle_start_date=v_today,updated_at=now() where user_id=v_uid returning cycle_start_date into v_start; end if;
 v_day:=(v_today-v_start)+1;
 if v_day<1 or v_day>7 then raise exception 'Your 7-day activity cycle is not active'; end if;
 if exists(select 1 from public.user_daily_activity_completions where user_id=v_uid and cycle_start_date=v_start and day_number=v_day) then raise exception 'Today activity is already completed'; end if;
 select s.activity_key,s.reward_bc,s.enabled,c.enabled,c.is_ad_only into v_key,v_reward,v_schedule_enabled,v_activity_enabled,v_ad_only from public.daily_activity_schedule s join public.daily_activity_catalog c using(activity_key) where s.day_number=v_day;
 if v_key is null or v_key<>p_activity_key then raise exception 'Complete the activity assigned for today'; end if;
 if not coalesce(v_schedule_enabled,false) or not coalesce(v_activity_enabled,false) then raise exception 'Today activity is disabled by the administrator'; end if;
 if coalesce(v_ad_only,false) then raise exception 'Sponsored activity rewards require verified ad completion'; end if;
 select * into v_attempt from public.user_daily_activity_attempts where user_id=v_uid and cycle_start_date=v_start and day_number=v_day for update;
 if v_attempt.id is null or v_attempt.activity_key<>v_key then raise exception 'Start today activity before completing it'; end if;
 if v_attempt.completed_at is not null then raise exception 'This activity attempt has already been used'; end if;
 if v_key <> 'coin_drop' and now()-v_attempt.started_at > interval '30 minutes' then raise exception 'This activity attempt expired. Start the activity again.'; end if;
 if v_key in ('coin_drop','panda_slots') and now()-v_attempt.started_at < interval '55 seconds' then raise exception 'Complete the activity round before claiming its reward'; end if;
 if v_key not in ('coin_drop','panda_slots') and now()-v_attempt.started_at < interval '3 seconds' then raise exception 'Complete the activity round before claiming its reward'; end if;
 if v_key not in ('coin_drop','panda_slots') and coalesce(v_attempt.action_count,0)<1 then raise exception 'Play the activity round before claiming its reward'; end if;
 if v_key='coin_drop' and not exists(select 1 from public.daily_coin_drop_sessions d where d.user_id=v_uid and d.cycle_start_date=v_start and d.day_number=v_day and d.completed_at is not null and d.active=false) then raise exception 'Finish the full Coin Drop round before claiming the activity reward'; end if;
 v_reward:=greatest(0,coalesce(v_reward,0));
 update public.user_daily_activity_attempts set completed_at=now() where id=v_attempt.id;
 insert into public.user_daily_activity_completions(user_id,cycle_start_date,day_number,activity_key,reward_bc) values(v_uid,v_start,v_day,v_key,v_reward) returning id into v_completion_id;
 insert into public.wallet_accounts(user_id,bc_balance) values(v_uid,0) on conflict(user_id) do nothing;
 update public.wallet_accounts set bc_balance=bc_balance+v_reward,updated_at=now() where user_id=v_uid returning bc_balance into v_balance;
 insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(v_uid,'BC',v_reward,'reward:daily_activity:'||v_key,v_completion_id);
 perform public.award_xp_for_activity(v_uid,'daily_activity',null);
 return jsonb_build_object('success',true,'day_number',v_day,'activity_key',v_key,'reward_bc',v_reward,'bc_balance',v_balance);
end $$;

revoke execute on function public.start_daily_activity(text) from public, anon;
revoke execute on function public.complete_daily_activity(text) from public, anon;
grant execute on function public.start_daily_activity(text) to authenticated;
grant execute on function public.complete_daily_activity(text) to authenticated;
