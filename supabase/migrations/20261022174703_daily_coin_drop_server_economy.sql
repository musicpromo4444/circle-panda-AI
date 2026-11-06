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
 insert into public.daily_coin_drop_sessions(user_id,cycle_start_date,day_number)
 values(v_uid,v_start,v_day) on conflict(user_id,cycle_start_date,day_number) do nothing;
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
