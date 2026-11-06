
create table if not exists public.hot_seat_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'preparing' check (status in ('bidding','preparing','live','water_break','ended','evicted')),
  title text not null default 'Hot Seat',
  started_at timestamptz,
  ends_at timestamptz,
  break_started_at timestamptz,
  next_host_decision_deadline timestamptz,
  preparation_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists hot_seat_one_active_session_idx on public.hot_seat_sessions ((status)) where status in ('preparing','live','water_break','bidding');

create table if not exists public.hot_seat_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hot_seat_sessions(id) on delete cascade,
  asker_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  question_type text not null default 'standard' check (question_type in ('standard','custom')),
  status text not null default 'pending' check (status in ('pending','answered','expired','withdrawn')),
  answer text,
  asked_at timestamptz not null default now(),
  answer_deadline timestamptz not null default now() + interval '1 hour',
  answered_at timestamptz
);
create index if not exists hot_seat_questions_session_idx on public.hot_seat_questions(session_id, asked_at desc);

create table if not exists public.hot_seat_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hot_seat_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists hot_seat_comments_session_idx on public.hot_seat_comments(session_id, created_at desc);

create table if not exists public.hot_seat_reactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hot_seat_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like','love','laugh','wow','fire','clap')),
  created_at timestamptz not null default now(),
  unique(session_id,user_id,reaction)
);

create table if not exists public.hot_seat_gifts (
  id text primary key,
  name text not null,
  emoji text not null,
  price_bc bigint not null check (price_bc > 0),
  enabled boolean not null default true,
  sort_order integer not null default 0
);
insert into public.hot_seat_gifts(id,name,emoji,price_bc,sort_order) values
 ('rose','Rose','🌹',10,1),('heart','Heart','💖',25,2),('fire','Fire','🔥',50,3),('crown','Golden Crown','👑',100,4),('panda','Panda Love','🐼',250,5),('diamond','Diamond','💎',500,6)
on conflict (id) do nothing;

create table if not exists public.hot_seat_gift_transactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hot_seat_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  gift_id text not null references public.hot_seat_gifts(id),
  quantity integer not null default 1 check (quantity between 1 and 100),
  total_bc bigint not null check (total_bc > 0),
  host_earnings_bc bigint not null check (host_earnings_bc >= 0),
  created_at timestamptz not null default now()
);
create index if not exists hot_seat_gifts_session_idx on public.hot_seat_gift_transactions(session_id,created_at desc);

create table if not exists public.hot_seat_bids (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.hot_seat_sessions(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  amount_bc bigint not null check (amount_bc > 0),
  status text not null default 'pending' check (status in ('pending','selected','won','refunded','declined','expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(session_id,bidder_id)
);
create index if not exists hot_seat_bids_session_idx on public.hot_seat_bids(session_id,amount_bc desc,created_at asc);

create table if not exists public.hot_seat_water_break_activities (
  id text primary key,
  title text not null,
  description text not null,
  activity_type text not null check (activity_type in ('giveaway','movie','comedy','vip_glimpse','secret_stalls','game','sponsored','ad')),
  enabled boolean not null default true,
  sort_order integer not null default 0
);
insert into public.hot_seat_water_break_activities(id,title,description,activity_type,enabled,sort_order) values
 ('giveaways','Giveaways','Win BC coins and gifts during the break.','giveaway',true,1),
 ('movies','Movie room','Watch-party slot for the water break.','movie',true,2),
 ('comedy','Comedy corner','Short comedy and creator clips.','comedy',true,3),
 ('vip_glimpse','VIP glimpse','A preview of the VIP Lounge.','vip_glimpse',true,4),
 ('secret_stalls','Secret Stalls','Discover sponsored and community stalls.','secret_stalls',true,5),
 ('quick_games','Quick games','Play quick games, polls and trivia.','game',true,6),
 ('sponsored','Sponsored activity','Admin-controlled sponsor activity.','sponsored',true,7),
 ('break_ads','Break ads','Admin-controlled break advertisements.','ad',true,8)
on conflict (id) do nothing;

create table if not exists public.hot_seat_settings (
  setting_key text primary key,
  numeric_value numeric not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.hot_seat_settings(setting_key,numeric_value) values
 ('live_duration_minutes',180),('water_break_minutes',60),('pause_minutes',15),
 ('question_standard_cost',25),('question_custom_cost',75),('host_earnings_percent',20),
 ('bc_per_usd_rate',1333.333333),('bid_decision_minutes',15),('bid_preparation_minutes',15),
 ('question_answer_minutes',60),('comment_ad_interval',5),('question_ad_interval',5)
on conflict(setting_key) do nothing;

alter table public.hot_seat_sessions enable row level security;
alter table public.hot_seat_questions enable row level security;
alter table public.hot_seat_comments enable row level security;
alter table public.hot_seat_reactions enable row level security;
alter table public.hot_seat_gifts enable row level security;
alter table public.hot_seat_gift_transactions enable row level security;
alter table public.hot_seat_bids enable row level security;
alter table public.hot_seat_water_break_activities enable row level security;
alter table public.hot_seat_settings enable row level security;

drop policy if exists "hot seat sessions readable" on public.hot_seat_sessions;
create policy "hot seat sessions readable" on public.hot_seat_sessions for select to authenticated using (true);
drop policy if exists "hot seat questions readable" on public.hot_seat_questions;
create policy "hot seat questions readable" on public.hot_seat_questions for select to authenticated using (true);
drop policy if exists "hot seat comments readable" on public.hot_seat_comments;
create policy "hot seat comments readable" on public.hot_seat_comments for select to authenticated using (true);
drop policy if exists "hot seat comments insert own" on public.hot_seat_comments;
create policy "hot seat comments insert own" on public.hot_seat_comments for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "hot seat reactions readable" on public.hot_seat_reactions;
create policy "hot seat reactions readable" on public.hot_seat_reactions for select to authenticated using (true);
drop policy if exists "hot seat reactions manage own" on public.hot_seat_reactions;
create policy "hot seat reactions manage own" on public.hot_seat_reactions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "hot seat gifts readable" on public.hot_seat_gifts;
create policy "hot seat gifts readable" on public.hot_seat_gifts for select to authenticated using (enabled = true);
drop policy if exists "hot seat gift transactions readable" on public.hot_seat_gift_transactions;
create policy "hot seat gift transactions readable" on public.hot_seat_gift_transactions for select to authenticated using ((select auth.uid()) = sender_id or (select auth.uid()) = host_id);
drop policy if exists "hot seat bids readable own or host" on public.hot_seat_bids;
create policy "hot seat bids readable own or host" on public.hot_seat_bids for select to authenticated using ((select auth.uid()) = bidder_id or exists(select 1 from public.hot_seat_sessions s where s.id=session_id and s.host_id=(select auth.uid())) or exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='admin'));
drop policy if exists "hot seat water activities readable" on public.hot_seat_water_break_activities;
create policy "hot seat water activities readable" on public.hot_seat_water_break_activities for select to authenticated using (enabled = true);
drop policy if exists "hot seat settings admin read" on public.hot_seat_settings;
create policy "hot seat settings admin read" on public.hot_seat_settings for select to authenticated using (exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='admin'));

create or replace function public.hot_seat_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') $$;

create or replace function public.hot_seat_bootstrap()
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_session public.hot_seat_sessions%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in to enter Hot Seat.'; end if;
 select * into v_session from public.hot_seat_sessions where status in ('preparing','live','water_break','bidding') order by created_at desc limit 1;
 if not found then
   insert into public.hot_seat_sessions(host_id,status,title) values(auth.uid(),'bidding','Hot Seat') returning * into v_session;
 end if;
 return jsonb_build_object('session',to_jsonb(v_session));
end $$;

create or replace function public.hot_seat_start_session(p_session_id uuid)
returns public.hot_seat_sessions language plpgsql security definer set search_path=public
as $$
declare v_session public.hot_seat_sessions%rowtype; v_minutes integer;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select * into v_session from public.hot_seat_sessions where id=p_session_id for update;
 if not found then raise exception 'Hot Seat session not found.'; end if;
 if v_session.host_id<>auth.uid() and not public.hot_seat_is_admin() then raise exception 'Only the host or an administrator can start the session.'; end if;
 if v_session.status not in ('preparing','bidding') then raise exception 'This session cannot be started from its current state.'; end if;
 select numeric_value::integer into v_minutes from public.hot_seat_settings where setting_key='live_duration_minutes';
 update public.hot_seat_sessions set status='live',started_at=now(),ends_at=now()+make_interval(mins=>coalesce(v_minutes,180)),updated_at=now() where id=p_session_id returning * into v_session;
 return v_session;
end $$;

create or replace function public.hot_seat_ask_question(p_session_id uuid,p_body text,p_question_type text default 'standard')
returns public.hot_seat_questions language plpgsql security definer set search_path=public
as $$
declare v_cost bigint; v_balance bigint; v_question public.hot_seat_questions%rowtype; v_minutes integer;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 if char_length(trim(p_body)) not between 1 and 1000 then raise exception 'Question must be between 1 and 1000 characters.'; end if;
 if p_question_type not in ('standard','custom') then raise exception 'Invalid question type.'; end if;
 select numeric_value::bigint into v_cost from public.hot_seat_settings where setting_key=case when p_question_type='custom' then 'question_custom_cost' else 'question_standard_cost' end;
 select bc_balance into v_balance from public.wallet_accounts where user_id=auth.uid() for update;
 if not found then raise exception 'Wallet not found.'; end if;
 if not public.hot_seat_is_admin() then
   if v_balance<coalesce(v_cost,25) then raise exception 'Not enough BC for this question.'; end if;
   update public.wallet_accounts set bc_balance=bc_balance-coalesce(v_cost,25),updated_at=now() where user_id=auth.uid();
   insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(auth.uid(),'BC',-coalesce(v_cost,25),'Hot Seat question',p_session_id);
 end if;
 select numeric_value::integer into v_minutes from public.hot_seat_settings where setting_key='question_answer_minutes';
 insert into public.hot_seat_questions(session_id,asker_id,body,question_type,answer_deadline)
 values(p_session_id,auth.uid(),trim(p_body),p_question_type,now()+make_interval(mins=>coalesce(v_minutes,60))) returning * into v_question;
 return v_question;
end $$;

create or replace function public.hot_seat_answer_question(p_question_id uuid,p_answer text)
returns public.hot_seat_questions language plpgsql security definer set search_path=public
as $$
declare v_q public.hot_seat_questions%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select q.* into v_q from public.hot_seat_questions q join public.hot_seat_sessions s on s.id=q.session_id where q.id=p_question_id and s.host_id=auth.uid() for update;
 if not found and not public.hot_seat_is_admin() then raise exception 'Only the host can answer this question.'; end if;
 if char_length(trim(coalesce(p_answer,''))) not between 1 and 2000 then raise exception 'Answer must not be empty.'; end if;
 update public.hot_seat_questions set answer=trim(p_answer),status='answered',answered_at=now() where id=p_question_id returning * into v_q;
 return v_q;
end $$;

create or replace function public.hot_seat_send_gift(p_session_id uuid,p_gift_id text,p_quantity integer default 1)
returns public.hot_seat_gift_transactions language plpgsql security definer set search_path=public
as $$
declare v_session public.hot_seat_sessions%rowtype; v_gift public.hot_seat_gifts%rowtype; v_total bigint; v_earnings bigint; v_balance bigint; v_row public.hot_seat_gift_transactions%rowtype; v_pct integer;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 if p_quantity not between 1 and 100 then raise exception 'Gift quantity must be between 1 and 100.'; end if;
 select * into v_session from public.hot_seat_sessions where id=p_session_id and status in ('live','water_break') for update;
 if not found then raise exception 'Gifts are available during a live Hot Seat or water break.'; end if;
 select * into v_gift from public.hot_seat_gifts where id=p_gift_id and enabled=true;
 if not found then raise exception 'Gift is not available.'; end if;
 v_total:=v_gift.price_bc*p_quantity;
 select bc_balance into v_balance from public.wallet_accounts where user_id=auth.uid() for update;
 if not found then raise exception 'Wallet not found.'; end if;
 if auth.uid()<>v_session.host_id and not public.hot_seat_is_admin() then
   if v_balance<v_total then raise exception 'Not enough BC. Add coins in your Wallet.'; end if;
   update public.wallet_accounts set bc_balance=bc_balance-v_total,updated_at=now() where user_id=auth.uid();
   insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(auth.uid(),'BC',-v_total,'Hot Seat gift: '||v_gift.name,p_session_id);
 end if;
 select numeric_value::integer into v_pct from public.hot_seat_settings where setting_key='host_earnings_percent';
 v_earnings:=floor(v_total*coalesce(v_pct,20)/100.0);
 if v_earnings>0 and v_session.host_id<>auth.uid() then
   update public.wallet_accounts set bc_balance=bc_balance+v_earnings,updated_at=now() where user_id=v_session.host_id;
   insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(v_session.host_id,'BC',v_earnings,'Hot Seat host gift earnings',p_session_id);
 end if;
 insert into public.hot_seat_gift_transactions(session_id,sender_id,host_id,gift_id,quantity,total_bc,host_earnings_bc)
 values(p_session_id,auth.uid(),v_session.host_id,p_gift_id,p_quantity,v_total,v_earnings) returning * into v_row;
 return v_row;
end $$;

create or replace function public.hot_seat_place_bid(p_session_id uuid,p_amount bigint)
returns public.hot_seat_bids language plpgsql security definer set search_path=public
as $$
declare v_session public.hot_seat_sessions%rowtype; v_balance bigint; v_bid public.hot_seat_bids%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 if p_amount<1 then raise exception 'Bid must be at least 1 BC.'; end if;
 select * into v_session from public.hot_seat_sessions where id=p_session_id and status in ('bidding','live','water_break') for update;
 if not found then raise exception 'Bidding is not open right now.'; end if;
 if v_session.host_id=auth.uid() then raise exception 'The current host cannot bid for their own next seat.'; end if;
 select bc_balance into v_balance from public.wallet_accounts where user_id=auth.uid() for update;
 if not found then raise exception 'Wallet not found.'; end if;
 if not public.hot_seat_is_admin() then
   if v_balance<p_amount then raise exception 'Not enough BC to place this bid.'; end if;
   update public.wallet_accounts set bc_balance=bc_balance-p_amount,updated_at=now() where user_id=auth.uid();
   insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(auth.uid(),'BC',-p_amount,'Hot Seat next-seat bid escrow',p_session_id);
 end if;
 insert into public.hot_seat_bids(session_id,bidder_id,amount_bc,status) values(p_session_id,auth.uid(),p_amount,'pending')
 on conflict(session_id,bidder_id) do update set amount_bc=excluded.amount_bc,status='pending',created_at=now(),decided_at=null
 returning * into v_bid;
 return v_bid;
end $$;

create or replace function public.hot_seat_decide_bid(p_bid_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_bid public.hot_seat_bids%rowtype; v_session public.hot_seat_sessions%rowtype; v_winner uuid; v_next public.hot_seat_sessions%rowtype; v_refund record; v_decision_minutes integer; v_prepare_minutes integer;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select * into v_bid from public.hot_seat_bids where id=p_bid_id for update;
 if not found then raise exception 'Bid not found.'; end if;
 select * into v_session from public.hot_seat_sessions where id=v_bid.session_id for update;
 select bidder_id into v_winner from public.hot_seat_bids where session_id=v_bid.session_id and status in ('pending','selected','won') order by amount_bc desc,created_at asc limit 1;
 if auth.uid()<>v_bid.bidder_id and not public.hot_seat_is_admin() then raise exception 'Only the selected bidder can decide.'; end if;
 if v_bid.bidder_id<>v_winner then raise exception 'Another bid is currently higher.'; end if;
 if not p_accept then
   update public.hot_seat_bids set status='declined',decided_at=now() where id=p_bid_id;
   if not public.hot_seat_is_admin() then
     update public.wallet_accounts set bc_balance=bc_balance+v_bid.amount_bc,updated_at=now() where user_id=v_bid.bidder_id;
     insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(v_bid.bidder_id,'BC',v_bid.amount_bc,'Hot Seat bid refunded after decline',v_session.id);
   end if;
   return jsonb_build_object('status','declined','refunded_bc',v_bid.amount_bc);
 end if;
 select numeric_value::integer into v_decision_minutes from public.hot_seat_settings where setting_key='bid_decision_minutes';
 select numeric_value::integer into v_prepare_minutes from public.hot_seat_settings where setting_key='bid_preparation_minutes';
 update public.hot_seat_bids set status='won',decided_at=now() where id=p_bid_id;
 for v_refund in select id,bidder_id,amount_bc from public.hot_seat_bids where session_id=v_session.id and id<>p_bid_id and status in ('pending','selected') loop
   update public.hot_seat_bids set status='refunded',decided_at=now() where id=v_refund.id;
   if not public.hot_seat_is_admin() then
     update public.wallet_accounts set bc_balance=bc_balance+v_refund.amount_bc,updated_at=now() where user_id=v_refund.bidder_id;
     insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(v_refund.bidder_id,'BC',v_refund.amount_bc,'Hot Seat bid refund: not selected',v_session.id);
   end if;
 end loop;
 update public.hot_seat_sessions set status='ended',updated_at=now() where id=v_session.id;
 insert into public.hot_seat_sessions(host_id,status,title,next_host_decision_deadline,preparation_deadline)
 values(v_bid.bidder_id,'preparing','Hot Seat',now()+make_interval(mins=>coalesce(v_decision_minutes,15)),now()+make_interval(mins=>coalesce(v_decision_minutes,15)+coalesce(v_prepare_minutes,15)))
 returning * into v_next;
 return jsonb_build_object('status','won','next_session',to_jsonb(v_next),'bid_amount_bc',v_bid.amount_bc);
end $$;

create or replace function public.hot_seat_toggle_reaction(p_session_id uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_row public.hot_seat_reactions%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 if p_reaction not in ('like','love','laugh','wow','fire','clap') then raise exception 'Invalid reaction.'; end if;
 delete from public.hot_seat_reactions where session_id=p_session_id and user_id=auth.uid() and reaction=p_reaction;
 if found then return jsonb_build_object('active',false); end if;
 insert into public.hot_seat_reactions(session_id,user_id,reaction) values(p_session_id,auth.uid(),p_reaction);
 return jsonb_build_object('active',true);
end $$;

create or replace function public.hot_seat_end_session(p_session_id uuid,p_evicted boolean default false)
returns public.hot_seat_sessions language plpgsql security definer set search_path=public
as $$
declare v_session public.hot_seat_sessions%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required.'; end if;
 select * into v_session from public.hot_seat_sessions where id=p_session_id for update;
 if not found then raise exception 'Hot Seat session not found.'; end if;
 if v_session.host_id<>auth.uid() and not public.hot_seat_is_admin() then raise exception 'Only the host or an administrator can end the session.'; end if;
 update public.hot_seat_sessions set status=case when p_evicted then 'evicted' else 'ended' end,updated_at=now() where id=p_session_id returning * into v_session;
 return v_session;
end $$;

grant execute on function public.hot_seat_is_admin() to authenticated;
grant execute on function public.hot_seat_bootstrap() to authenticated;
grant execute on function public.hot_seat_start_session(uuid) to authenticated;
grant execute on function public.hot_seat_ask_question(uuid,text,text) to authenticated;
grant execute on function public.hot_seat_answer_question(uuid,text) to authenticated;
grant execute on function public.hot_seat_send_gift(uuid,text,integer) to authenticated;
grant execute on function public.hot_seat_place_bid(uuid,bigint) to authenticated;
grant execute on function public.hot_seat_decide_bid(uuid,boolean) to authenticated;
grant execute on function public.hot_seat_toggle_reaction(uuid,text) to authenticated;
grant execute on function public.hot_seat_end_session(uuid,boolean) to authenticated;
