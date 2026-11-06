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
 (1,'wheel_spin',10),(2,'guess_sponsor',10),(3,'panda_cup_shuffle',10),(4,'lucky_cards',10),(5,'secret_reveal',50),(6,'panda_puzzle',50),(7,'coin_drop',50)
on conflict(day_number) do nothing;
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
declare v_uid uuid := auth.uid(); v_start date; v_today date := (now() at time zone 'utc')::date; v_day integer; v_key text; v_reward bigint; v_enabled boolean; v_ad_only boolean; v_balance bigint;
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
 select s.activity_key,s.reward_bc,s.enabled,c.enabled,c.is_ad_only into v_key,v_reward,v_enabled,v_enabled,v_ad_only
 from public.daily_activity_schedule s join public.daily_activity_catalog c on c.activity_key=s.activity_key where s.day_number=v_day;
 if v_key is null then raise exception 'Today’s activity has not been configured'; end if;
 if v_key <> p_activity_key then raise exception 'Complete the activity assigned for today'; end if;
 if not coalesce(v_enabled,false) then raise exception 'Today’s activity is disabled by the administrator'; end if;
 if coalesce(v_ad_only,false) then raise exception 'Sponsored activity rewards require verified ad completion'; end if;
 v_reward := greatest(0,coalesce(v_reward,0));
 insert into public.user_daily_activity_completions(user_id,cycle_start_date,day_number,activity_key,reward_bc)
 values(v_uid,v_start,v_day,v_key,v_reward);
 insert into public.wallet_accounts(user_id,bc_balance) values(v_uid,0) on conflict(user_id) do nothing;
 update public.wallet_accounts set bc_balance=bc_balance+v_reward,updated_at=now() where user_id=v_uid returning bc_balance into v_balance;
 insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
 values(v_uid,'BC',v_reward,'reward:daily_activity:'||v_key,(select id from public.user_daily_activity_completions where user_id=v_uid and cycle_start_date=v_start and day_number=v_day));
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
