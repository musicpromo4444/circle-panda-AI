-- Daily activities and weekday login reward schedule for the NEW Circle Panda app.
-- Safe to re-run: tables and seed rows are idempotent.
create table if not exists public.daily_activity_catalog (
  activity_key text primary key,
  title text not null,
  description text not null default '',
  icon text not null default '🐼',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  is_ad_only boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.daily_activity_schedule (
  day_number integer primary key check (day_number between 1 and 7),
  activity_key text not null references public.daily_activity_catalog(activity_key),
  reward_bc bigint not null default 10 check (reward_bc >= 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.user_daily_activity_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cycle_start_date date not null default (now() at time zone 'utc')::date,
  updated_at timestamptz not null default now()
);
create table if not exists public.user_daily_activity_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_start_date date not null,
  day_number integer not null check (day_number between 1 and 7),
  activity_key text not null references public.daily_activity_catalog(activity_key),
  reward_bc bigint not null default 0,
  completed_at timestamptz not null default now(),
  unique (user_id, cycle_start_date, day_number),
  unique (user_id, cycle_start_date, activity_key, day_number)
);
insert into public.daily_activity_catalog(activity_key,title,description,icon,sort_order,is_ad_only) values
 ('wheel_spin','Wheel Spin','Spin the panda prize wheel for today’s activity challenge.','🎡',1,false),
 ('guess_sponsor','Guess the Sponsor','Pick the sponsor you think is featured today.','🔎',2,false),
 ('panda_cup_shuffle','Panda Cup Shuffle','Follow the cups and choose where the panda token lands.','🥤',3,false),
 ('lucky_cards','Lucky Cards','Choose a card to reveal today’s surprise.','🃏',4,false),
 ('secret_reveal','Secret Reveal','Reveal a secret prompt and complete the daily challenge.','🔐',5,false),
 ('panda_puzzle','Panda Puzzle','Solve a quick panda-themed puzzle.','🧩',6,false),
 ('just_playbo_ads','Just Playbo Ads','View a sponsored activity. This activity does not award BC.','📺',7,true),
 ('coin_drop','Coin Drop','Catch falling coins and avoid stones in a 60-second round.','🪙',8,false),
 ('panda_slots','Panda Slots','Play a timed slot-style round and reveal the result.','🎰',9,false),
 ('mystery_box','Mystery Box','Choose a box to uncover a surprise challenge.','🎁',10,false),
 ('panda_target','Panda Target','Hit the target in a quick skill challenge.','🎯',11,false)
on conflict(activity_key) do update set title=excluded.title,description=excluded.description,icon=excluded.icon,sort_order=excluded.sort_order,is_ad_only=excluded.is_ad_only;
insert into public.daily_activity_schedule(day_number,activity_key,reward_bc) values
 (1,'wheel_spin',10),(2,'guess_sponsor',10),(3,'panda_cup_shuffle',10),(4,'lucky_cards',10),(5,'secret_reveal',10),(6,'panda_puzzle',10),(7,'coin_drop',10)
on conflict(day_number) do nothing;
update public.daily_activity_schedule set reward_bc=10 where day_number between 1 and 7;
insert into public.economy_settings(setting_key,numeric_value) values
 ('daily_login_monday',5),('daily_login_tuesday',10),('daily_login_wednesday',5),('daily_login_thursday',10),('daily_login_friday',50),('daily_login_saturday',50),('daily_login_sunday',50)
on conflict(setting_key) do nothing;

alter table public.daily_activity_catalog enable row level security;
alter table public.daily_activity_schedule enable row level security;
alter table public.user_daily_activity_state enable row level security;
alter table public.user_daily_activity_completions enable row level security;
drop policy if exists daily_activity_catalog_read on public.daily_activity_catalog;
create policy daily_activity_catalog_read on public.daily_activity_catalog for select to authenticated using (true);
drop policy if exists daily_activity_schedule_read on public.daily_activity_schedule;
create policy daily_activity_schedule_read on public.daily_activity_schedule for select to authenticated using (true);
drop policy if exists user_daily_activity_state_own_read on public.user_daily_activity_state;
create policy user_daily_activity_state_own_read on public.user_daily_activity_state for select to authenticated using (auth.uid() = user_id);
drop policy if exists user_daily_activity_completions_own_read on public.user_daily_activity_completions;
create policy user_daily_activity_completions_own_read on public.user_daily_activity_completions for select to authenticated using (auth.uid() = user_id);

create or replace function public.get_daily_activity_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_start date; v_today date := (now() at time zone 'utc')::date; v_day integer; v_schedule jsonb; v_completed jsonb;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 insert into public.user_daily_activity_state(user_id,cycle_start_date) values(v_uid,v_today) on conflict(user_id) do nothing;
 select cycle_start_date into v_start from public.user_daily_activity_state where user_id=v_uid;
 if v_today < v_start or v_today >= v_start + 7 then
   update public.user_daily_activity_state set cycle_start_date=v_today,updated_at=now() where user_id=v_uid returning cycle_start_date into v_start;
 end if;
 v_day := greatest(1, least(7, (v_today - v_start) + 1));
 select jsonb_agg(jsonb_build_object('day_number',s.day_number,'activity_key',s.activity_key,'reward_bc',s.reward_bc,'enabled',s.enabled,'title',c.title,'description',c.description,'icon',c.icon,'is_ad_only',c.is_ad_only,'activity_enabled',c.enabled) order by s.day_number)
 into v_schedule from public.daily_activity_schedule s join public.daily_activity_catalog c on c.activity_key=s.activity_key;
 select coalesce(jsonb_agg(jsonb_build_object('day_number',p.day_number,'activity_key',p.activity_key,'reward_bc',p.reward_bc,'completed_at',p.completed_at) order by p.day_number),'[]'::jsonb)
 into v_completed from public.user_daily_activity_completions p where p.user_id=v_uid and p.cycle_start_date=v_start;
 return jsonb_build_object('cycle_start_date',v_start,'today',v_today,'current_day',v_day,'schedule',coalesce(v_schedule,'[]'::jsonb),'completed',v_completed);
end $$;

create or replace function public.complete_daily_activity(p_activity_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_uid uuid := auth.uid(); v_start date; v_today date := (now() at time zone 'utc')::date; v_day integer;
 v_key text; v_reward bigint; v_schedule_enabled boolean; v_activity_enabled boolean; v_ad_only boolean; v_balance bigint; v_completion_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 insert into public.user_daily_activity_state(user_id,cycle_start_date) values(v_uid,v_today) on conflict(user_id) do nothing;
 select cycle_start_date into v_start from public.user_daily_activity_state where user_id=v_uid for update;
 if v_today < v_start or v_today >= v_start + 7 then
   update public.user_daily_activity_state set cycle_start_date=v_today,updated_at=now() where user_id=v_uid returning cycle_start_date into v_start;
 end if;
 v_day := (v_today - v_start) + 1;
 if v_day < 1 or v_day > 7 then raise exception 'Your 7-day activity cycle is not active'; end if;
 if exists(select 1 from public.user_daily_activity_completions where user_id=v_uid and cycle_start_date=v_start and day_number=v_day) then raise exception 'Today’s activity is already completed'; end if;
 select s.activity_key,s.reward_bc,s.enabled,c.enabled,c.is_ad_only into v_key,v_reward,v_schedule_enabled,v_activity_enabled,v_ad_only
 from public.daily_activity_schedule s join public.daily_activity_catalog c on c.activity_key=s.activity_key where s.day_number=v_day;
 if v_key is null then raise exception 'Today’s activity has not been configured'; end if;
 if v_key <> p_activity_key then raise exception 'Complete the activity assigned for today'; end if;
 if not coalesce(v_schedule_enabled,false) or not coalesce(v_activity_enabled,false) then raise exception 'Today’s activity is disabled by the administrator'; end if;
 if coalesce(v_ad_only,false) then raise exception 'Sponsored activity rewards require verified ad completion'; end if;
 v_reward := greatest(0,coalesce(v_reward,0));
 insert into public.user_daily_activity_completions(user_id,cycle_start_date,day_number,activity_key,reward_bc)
 values(v_uid,v_start,v_day,v_key,v_reward) returning id into v_completion_id;
 insert into public.wallet_accounts(user_id,bc_balance) values(v_uid,0) on conflict(user_id) do nothing;
 update public.wallet_accounts set bc_balance=bc_balance+v_reward,updated_at=now() where user_id=v_uid returning bc_balance into v_balance;
 insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(v_uid,'BC',v_reward,'reward:daily_activity:'||v_key,v_completion_id);
 perform public.award_xp_for_activity(v_uid,'daily_activity',null);
 return jsonb_build_object('success',true,'day_number',v_day,'activity_key',v_key,'reward_bc',v_reward,'bc_balance',v_balance);
end $$;

create or replace function public.admin_set_daily_activity(p_day_number integer,p_activity_key text,p_reward_bc bigint,p_enabled boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then raise exception 'Administrator access required'; end if;
 if p_day_number not between 1 and 7 then raise exception 'Day must be between 1 and 7'; end if;
 if p_reward_bc < 0 then raise exception 'Reward cannot be negative'; end if;
 if not exists(select 1 from public.daily_activity_catalog where activity_key=p_activity_key) then raise exception 'Unknown activity'; end if;
 insert into public.daily_activity_schedule(day_number,activity_key,reward_bc,enabled) values(p_day_number,p_activity_key,p_reward_bc,p_enabled)
 on conflict(day_number) do update set activity_key=excluded.activity_key,reward_bc=excluded.reward_bc,enabled=excluded.enabled,updated_at=now();
end $$;
grant execute on function public.get_daily_activity_state() to authenticated;
grant execute on function public.complete_daily_activity(text) to authenticated;
grant execute on function public.admin_set_daily_activity(integer,text,bigint,boolean) to authenticated;

create or replace function public.claim_economy_reward_internal(p_reward_key text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
 v_user_id uuid := auth.uid(); v_setting_key text; v_amount bigint; v_cooldown bigint := 0;
 v_last_claim timestamptz; v_balance bigint; v_reason text; v_dow integer;
begin
 if v_user_id is null then raise exception 'Sign in is required'; end if;
 if p_reward_key not in ('first_activity_reward','daily_login_reward','ad_reward') then raise exception 'This reward cannot be claimed directly'; end if;
 v_setting_key := case p_reward_key when 'first_activity_reward' then 'first_activity_reward' when 'daily_login_reward' then 'daily_login_reward' else 'ad_reward' end;
 select es.numeric_value into v_amount from public.economy_settings es where es.setting_key=v_setting_key;
 v_amount := coalesce(v_amount,0); v_reason := 'reward:' || p_reward_key;
 if p_reward_key='ad_reward' then
   select es.numeric_value into v_cooldown from public.economy_settings es where es.setting_key='ad_reward_cooldown_seconds';
   v_cooldown := coalesce(v_cooldown,300);
 elsif p_reward_key='daily_login_reward' then
   v_dow := extract(isodow from (now() at time zone 'utc'))::integer;
   v_setting_key := case v_dow when 1 then 'daily_login_monday' when 2 then 'daily_login_tuesday' when 3 then 'daily_login_wednesday' when 4 then 'daily_login_thursday' when 5 then 'daily_login_friday' when 6 then 'daily_login_saturday' else 'daily_login_sunday' end;
   select es.numeric_value into v_amount from public.economy_settings es where es.setting_key=v_setting_key;
   v_amount := coalesce(v_amount,case v_dow when 1 then 5 when 2 then 10 when 3 then 5 when 4 then 10 else 50 end);
   v_cooldown := 0;
 else v_cooldown := 0;
 end if;
 insert into public.wallet_accounts(user_id,bc_balance) values(v_user_id,0) on conflict(user_id) do nothing;
 select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id=v_user_id for update;
 select max(wt.created_at) into v_last_claim from public.wallet_transactions wt where wt.user_id=v_user_id and wt.reason=v_reason;
 if p_reward_key='first_activity_reward' and v_last_claim is not null then raise exception 'Your first-activity reward has already been claimed'; end if;
 if p_reward_key='daily_login_reward' and v_last_claim is not null and (v_last_claim at time zone 'utc')::date=(now() at time zone 'utc')::date then raise exception 'Daily reward already claimed today'; end if;
 if p_reward_key<>'daily_login_reward' and v_last_claim is not null and v_cooldown>0 and v_last_claim>now()-make_interval(secs=>v_cooldown::double precision) then raise exception 'This reward is still on cooldown'; end if;
 update public.wallet_accounts set bc_balance=bc_balance+v_amount,updated_at=now() where user_id=v_user_id;
 insert into public.wallet_transactions(user_id,currency,amount,reason) values(v_user_id,'BC',v_amount,v_reason);
 if p_reward_key='daily_login_reward' then
   update public.user_xp ux set xp_total=ux.xp_total+coalesce((select es.numeric_value from public.economy_settings es where es.setting_key='xp_daily_login'),3),updated_at=now()
   where ux.user_id=v_user_id and not exists(select 1 from public.profiles p where p.id=v_user_id and p.is_vip);
 end if;
 select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id=v_user_id;
 return v_balance;
end $$;


-- Validate that a user starts the assigned activity before receiving its completion reward.
create table if not exists public.user_daily_activity_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 cycle_start_date date not null,
 day_number integer not null check(day_number between 1 and 7),
 activity_key text not null references public.daily_activity_catalog(activity_key),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(user_id,cycle_start_date,day_number)
);
alter table public.user_daily_activity_attempts enable row level security;
drop policy if exists user_daily_activity_attempts_own_read on public.user_daily_activity_attempts;
create policy user_daily_activity_attempts_own_read on public.user_daily_activity_attempts for select to authenticated using(auth.uid()=user_id);

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
 if not coalesce(v_schedule_enabled,false) or not coalesce(v_activity_enabled,false) then raise exception 'Today’s activity is disabled by the administrator'; end if;
 if coalesce(v_ad_only,false) then raise exception 'Sponsored activity requires verified ad playback'; end if;
 if exists(select 1 from public.user_daily_activity_completions where user_id=v_uid and cycle_start_date=v_start and day_number=v_day) then raise exception 'Today’s activity is already completed'; end if;
 insert into public.user_daily_activity_attempts(user_id,cycle_start_date,day_number,activity_key)
 values(v_uid,v_start,v_day,v_key) on conflict(user_id,cycle_start_date,day_number) do nothing;
 select * into v_attempt from public.user_daily_activity_attempts where user_id=v_uid and cycle_start_date=v_start and day_number=v_day;
 if v_attempt.completed_at is not null then raise exception 'Today’s activity is already completed'; end if;
 return jsonb_build_object('attempt_id',v_attempt.id,'started_at',v_attempt.started_at,'activity_key',v_attempt.activity_key,'day_number',v_day);
end $$;

create or replace function public.complete_daily_activity(p_activity_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_uid uuid:=auth.uid(); v_start date; v_today date:=(now() at time zone 'utc')::date; v_day integer;
 v_key text; v_reward bigint; v_schedule_enabled boolean; v_activity_enabled boolean; v_ad_only boolean; v_balance bigint; v_completion_id uuid; v_attempt public.user_daily_activity_attempts;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 insert into public.user_daily_activity_state(user_id,cycle_start_date) values(v_uid,v_today) on conflict(user_id) do nothing;
 select cycle_start_date into v_start from public.user_daily_activity_state where user_id=v_uid for update;
 if v_today < v_start or v_today >= v_start+7 then
  update public.user_daily_activity_state set cycle_start_date=v_today,updated_at=now() where user_id=v_uid returning cycle_start_date into v_start;
 end if;
 v_day:=(v_today-v_start)+1;
 if v_day<1 or v_day>7 then raise exception 'Your 7-day activity cycle is not active'; end if;
 if exists(select 1 from public.user_daily_activity_completions where user_id=v_uid and cycle_start_date=v_start and day_number=v_day) then raise exception 'Today’s activity is already completed'; end if;
 select s.activity_key,s.reward_bc,s.enabled,c.enabled,c.is_ad_only into v_key,v_reward,v_schedule_enabled,v_activity_enabled,v_ad_only
 from public.daily_activity_schedule s join public.daily_activity_catalog c using(activity_key) where s.day_number=v_day;
 if v_key is null or v_key<>p_activity_key then raise exception 'Complete the activity assigned for today'; end if;
 if not coalesce(v_schedule_enabled,false) or not coalesce(v_activity_enabled,false) then raise exception 'Today’s activity is disabled by the administrator'; end if;
 if coalesce(v_ad_only,false) then raise exception 'Sponsored activity rewards require verified ad completion'; end if;
 select * into v_attempt from public.user_daily_activity_attempts where user_id=v_uid and cycle_start_date=v_start and day_number=v_day for update;
 if v_attempt.id is null or v_attempt.activity_key<>v_key then raise exception 'Start today’s activity before completing it'; end if;
 if v_attempt.completed_at is not null then raise exception 'This activity attempt has already been used'; end if;
 if (now()-v_attempt.started_at) < (case when v_key in ('coin_drop','panda_slots') then interval '55 seconds' else interval '3 seconds' end) then raise exception 'Complete the activity round before claiming its reward'; end if;
 if now()-v_attempt.started_at > interval '30 minutes' then raise exception 'This activity attempt expired. Refresh the page and try again tomorrow.'; end if;
 v_reward:=greatest(0,coalesce(v_reward,0));
 update public.user_daily_activity_attempts set completed_at=now() where id=v_attempt.id;
 insert into public.user_daily_activity_completions(user_id,cycle_start_date,day_number,activity_key,reward_bc)
 values(v_uid,v_start,v_day,v_key,v_reward) returning id into v_completion_id;
 insert into public.wallet_accounts(user_id,bc_balance) values(v_uid,0) on conflict(user_id) do nothing;
 update public.wallet_accounts set bc_balance=bc_balance+v_reward,updated_at=now() where user_id=v_uid returning bc_balance into v_balance;
 insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(v_uid,'BC',v_reward,'reward:daily_activity:'||v_key,v_completion_id);
 perform public.award_xp_for_activity(v_uid,'daily_activity',null);
 return jsonb_build_object('success',true,'day_number',v_day,'activity_key',v_key,'reward_bc',v_reward,'bc_balance',v_balance);
end $$;
grant execute on function public.start_daily_activity(text) to authenticated;
grant execute on function public.complete_daily_activity(text) to authenticated;


-- Server-side 60-second Coin Drop scoring and BC wallet accounting.
create table if not exists public.daily_coin_drop_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 cycle_start_date date not null,
 day_number integer not null check(day_number between 1 and 7),
 started_at timestamptz not null default now(),
 ends_at timestamptz not null default (now()+interval '60 seconds'),
 score bigint not null default 0,
 action_count integer not null default 0,
 last_action_at timestamptz,
 active boolean not null default true,
 completed_at timestamptz,
 unique(user_id,cycle_start_date,day_number)
);
alter table public.daily_coin_drop_sessions enable row level security;
drop policy if exists daily_coin_drop_sessions_own_read on public.daily_coin_drop_sessions;
create policy daily_coin_drop_sessions_own_read on public.daily_coin_drop_sessions for select to authenticated using(auth.uid()=user_id);

create or replace function public.start_daily_coin_drop()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_today date:=(now() at time zone 'utc')::date; v_start date; v_day integer; v_key text; v_row public.daily_coin_drop_sessions;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 select cycle_start_date into v_start from public.user_daily_activity_state where user_id=v_uid for update;
 if v_start is null then raise exception 'Open Daily Activities first'; end if;
 if v_today<v_start or v_today>=v_start+7 then raise exception 'Your daily activity cycle needs refreshing'; end if;
 v_day:=(v_today-v_start)+1;
 select activity_key into v_key from public.daily_activity_schedule where day_number=v_day and enabled=true;
 if v_key<>'coin_drop' then raise exception 'Coin Drop is not assigned for today'; end if;
 if not exists(select 1 from public.user_daily_activity_attempts where user_id=v_uid and cycle_start_date=v_start and day_number=v_day and activity_key='coin_drop' and completed_at is null) then raise exception 'Start today’s Coin Drop activity first'; end if;
 insert into public.daily_coin_drop_sessions(user_id,cycle_start_date,day_number) values(v_uid,v_start,v_day) on conflict(user_id,cycle_start_date,day_number) do nothing;
 select * into v_row from public.daily_coin_drop_sessions where user_id=v_uid and cycle_start_date=v_start and day_number=v_day for update;
 if v_row.completed_at is not null then raise exception 'Coin Drop has already finished today'; end if;
 return jsonb_build_object('session_id',v_row.id,'score',v_row.score,'ends_at',v_row.ends_at,'seconds_remaining',greatest(0,ceil(extract(epoch from (v_row.ends_at-now())))::integer));
end $$;

create or replace function public.daily_coin_drop_action(p_session_id uuid,p_item text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_row public.daily_coin_drop_sessions; v_delta integer; v_actual_delta bigint; v_balance bigint;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if p_item not in ('coin','rare_coin','stone') then raise exception 'Unknown Coin Drop item'; end if;
 select * into v_row from public.daily_coin_drop_sessions where id=p_session_id and user_id=v_uid for update;
 if v_row.id is null or not v_row.active or v_row.completed_at is not null then raise exception 'Coin Drop session is not active'; end if;
 if now()>=v_row.ends_at then raise exception 'The 60-second Coin Drop round has ended'; end if;
 if v_row.action_count>=180 then raise exception 'Round action limit reached'; end if;
 if v_row.last_action_at is not null and now()-v_row.last_action_at<interval '200 milliseconds' then raise exception 'Slow down and tap the falling items'; end if;
 v_delta:=case p_item when 'coin' then 1 when 'rare_coin' then 2 else -3 end;
 insert into public.wallet_accounts(user_id,bc_balance) values(v_uid,0) on conflict(user_id) do nothing;
 select bc_balance into v_balance from public.wallet_accounts where user_id=v_uid for update;
 if v_delta<0 then v_actual_delta:=greatest(-v_balance,v_delta); else v_actual_delta:=v_delta; end if;
 update public.wallet_accounts set bc_balance=bc_balance+v_actual_delta,updated_at=now() where user_id=v_uid returning bc_balance into v_balance;
 update public.daily_coin_drop_sessions set score=score+v_delta,action_count=action_count+1,last_action_at=now() where id=p_session_id returning * into v_row;
 insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(v_uid,'BC',v_actual_delta,'daily_game:coin_drop',p_session_id);
 return jsonb_build_object('score',v_row.score,'action_count',v_row.action_count,'bc_delta',v_actual_delta,'bc_balance',v_balance,'seconds_remaining',greatest(0,ceil(extract(epoch from (v_row.ends_at-now())))::integer));
end $$;

create or replace function public.finish_daily_coin_drop(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_row public.daily_coin_drop_sessions; v_earned bigint;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 select * into v_row from public.daily_coin_drop_sessions where id=p_session_id and user_id=v_uid for update;
 if v_row.id is null then raise exception 'Coin Drop session not found'; end if;
 if v_row.completed_at is not null then
  select coalesce(sum(amount),0) into v_earned from public.wallet_transactions where user_id=v_uid and reference_id=p_session_id and reason='daily_game:coin_drop';
  return jsonb_build_object('score',v_row.score,'earned_bc',v_earned,'completed_at',v_row.completed_at);
 end if;
 if now()<v_row.ends_at then raise exception 'Keep playing until the 60-second round ends'; end if;
 update public.daily_coin_drop_sessions set active=false,completed_at=now() where id=p_session_id returning * into v_row;
 select coalesce(sum(amount),0) into v_earned from public.wallet_transactions where user_id=v_uid and reference_id=p_session_id and reason='daily_game:coin_drop';
 return jsonb_build_object('score',v_row.score,'earned_bc',v_earned,'completed_at',v_row.completed_at);
end $$;
grant execute on function public.start_daily_coin_drop() to authenticated;
grant execute on function public.daily_coin_drop_action(uuid,text) to authenticated;
grant execute on function public.finish_daily_coin_drop(uuid) to authenticated;
