-- Server-side timing and one-time result for Panda Slots.
create table if not exists public.daily_panda_slots_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 cycle_start_date date not null,
 day_number integer not null check(day_number between 1 and 7),
 started_at timestamptz not null default now(),
 ends_at timestamptz not null default (now()+interval '60 seconds'),
 result text,
 completed_at timestamptz,
 unique(user_id,cycle_start_date,day_number)
);
alter table public.daily_panda_slots_sessions enable row level security;
drop policy if exists daily_panda_slots_sessions_own_read on public.daily_panda_slots_sessions;
create policy daily_panda_slots_sessions_own_read on public.daily_panda_slots_sessions for select to authenticated using(auth.uid()=user_id);

create or replace function public.start_daily_panda_slots()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_today date:=(now() at time zone 'utc')::date; v_start date; v_day integer; v_key text; v_row public.daily_panda_slots_sessions;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 select cycle_start_date into v_start from public.user_daily_activity_state where user_id=v_uid for update;
 if v_start is null or v_today<v_start or v_today>=v_start+7 then raise exception 'Open Daily Activities to refresh your cycle'; end if;
 v_day:=(v_today-v_start)+1;
 select activity_key into v_key from public.daily_activity_schedule where day_number=v_day and enabled=true;
 if v_key is distinct from 'panda_slots' then raise exception 'Panda Slots is not assigned for today'; end if;
 if not exists(select 1 from public.user_daily_activity_attempts where user_id=v_uid and cycle_start_date=v_start and day_number=v_day and activity_key='panda_slots' and completed_at is null) then raise exception 'Start today Panda Slots activity first'; end if;
 insert into public.daily_panda_slots_sessions(user_id,cycle_start_date,day_number) values(v_uid,v_start,v_day) on conflict(user_id,cycle_start_date,day_number) do nothing;
 select * into v_row from public.daily_panda_slots_sessions where user_id=v_uid and cycle_start_date=v_start and day_number=v_day for update;
 if v_row.completed_at is not null then raise exception 'Panda Slots has already finished today'; end if;
 return jsonb_build_object('session_id',v_row.id,'started_at',v_row.started_at,'ends_at',v_row.ends_at,'seconds_remaining',greatest(0,ceil(extract(epoch from(v_row.ends_at-now())))::integer));
end $$;

create or replace function public.finish_daily_panda_slots(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_row public.daily_panda_slots_sessions; v_result text;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 select * into v_row from public.daily_panda_slots_sessions where id=p_session_id and user_id=v_uid for update;
 if v_row.id is null then raise exception 'Panda Slots session not found'; end if;
 if v_row.completed_at is not null then return jsonb_build_object('result',v_row.result,'completed_at',v_row.completed_at); end if;
 if now()<v_row.ends_at then raise exception 'Keep playing until the 60-second slot round ends'; end if;
 v_result:=case floor(random()*4)::integer when 0 then '🐼 🐼 🐼 — Panda jackpot!' when 1 then '🪙 🎋 🪙 — Bamboo bonus!' when 2 then '✨ 🐼 ✨ — Lucky panda!' else '🎋 🎋 🪙 — Keep trying!' end;
 update public.daily_panda_slots_sessions set result=v_result,completed_at=now() where id=p_session_id returning * into v_row;
 return jsonb_build_object('result',v_row.result,'completed_at',v_row.completed_at);
end $$;

-- Require completed server sessions before awarding the separate activity reward.
-- The live function also retains the existing daily completion, timing, action, and wallet checks.
