
create table if not exists public.event_blast_plans (
 id text primary key,
 name text not null,
 unique_reach integer not null check(unique_reach>0),
 duration_minutes integer not null default 1440 check(duration_minutes>0),
 price_usd numeric(12,2) not null default 0,
 bc_price bigint,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.event_blasts (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 plan_id text not null,
 payment_method text not null check(payment_method in ('free','bc','cash')),
 target_scope text not null default 'worldwide' check(target_scope in ('worldwide','country','state','city','area')),
 target_country text,
 target_state text,
 target_city text,
 target_area text,
 unique_reach integer not null,
 notification_cap integer not null,
 status text not null default 'active' check(status in ('pending','active','failed','expired')),
 created_at timestamptz not null default now(),
 ends_at timestamptz not null
);
create index if not exists event_blasts_user_month_idx on public.event_blasts(user_id,created_at desc);
create index if not exists event_blasts_event_idx on public.event_blasts(event_id,status,created_at desc);
alter table public.event_blast_plans enable row level security;
alter table public.event_blasts enable row level security;
drop policy if exists "Enabled event blast plans are readable" on public.event_blast_plans;
create policy "Enabled event blast plans are readable" on public.event_blast_plans for select to authenticated using (enabled);
drop policy if exists "Event owners can read their blasts" on public.event_blasts;
create policy "Event owners can read their blasts" on public.event_blasts for select to authenticated using (user_id=(select auth.uid()));

create or replace function public.get_event_blast_plans()
returns table(id text,name text,unique_reach integer,duration_minutes integer,price_usd numeric,bc_price bigint)
language sql stable security definer set search_path = ''
as $$ select p.id,p.name,p.unique_reach,p.duration_minutes,p.price_usd,p.bc_price from public.event_blast_plans p where p.enabled order by p.unique_reach asc; $$;

create or replace function public.get_event_promotion_status_secure()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_vip boolean:=false; v_reach integer:=100; v_used boolean:=false;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 select coalesce(is_vip,false) and (vip_expires_at is null or vip_expires_at>now()) into v_vip from public.profiles where id=v_uid;
 v_reach:=case when coalesce(v_vip,false) then 500 else 100 end;
 select exists(select 1 from public.event_blasts b where b.user_id=v_uid and b.payment_method='free' and b.created_at>=date_trunc('month',now()) and b.created_at<date_trunc('month',now())+interval '1 month') into v_used;
 return jsonb_build_object('eligible',not v_used,'base_reach',v_reach,'notification_cap',v_reach*2,'is_vip',coalesce(v_vip,false));
end;
$$;

create or replace function public.claim_free_event_promotion_secure(
 p_event_id uuid,p_target_scope text default 'worldwide',p_target_country text default null,
 p_target_state text default null,p_target_city text default null,p_target_area text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_vip boolean:=false; v_reach integer:=100; v_id uuid; v_ends timestamptz;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.events where id=p_event_id and creator_id=v_uid and is_published=true) then raise exception 'Only the event creator can promote this event'; end if;
 if p_target_scope not in ('worldwide','country','state','city','area') then raise exception 'Invalid target audience'; end if;
 if p_target_scope in ('country','state','city','area') and coalesce(trim(p_target_country),'')='' then raise exception 'Choose a target country'; end if;
 if p_target_scope in ('state','city','area') and coalesce(trim(p_target_state),'')='' then raise exception 'Choose a target state'; end if;
 if p_target_scope in ('city','area') and coalesce(trim(p_target_city),'')='' then raise exception 'Choose a target city'; end if;
 if p_target_scope='area' and coalesce(trim(p_target_area),'')='' then raise exception 'Choose a target area'; end if;
 perform pg_advisory_xact_lock(hashtext(v_uid::text));
 if exists(select 1 from public.event_blasts b where b.user_id=v_uid and b.payment_method='free' and b.created_at>=date_trunc('month',now()) and b.created_at<date_trunc('month',now())+interval '1 month') then
  raise exception 'Your free Event Blast for this month has already been used';
 end if;
 select coalesce(is_vip,false) and (vip_expires_at is null or vip_expires_at>now()) into v_vip from public.profiles where id=v_uid;
 v_reach:=case when coalesce(v_vip,false) then 500 else 100 end;
 v_ends:=now()+interval '24 hours';
 insert into public.event_blasts(event_id,user_id,plan_id,payment_method,target_scope,target_country,target_state,target_city,target_area,unique_reach,notification_cap,status,ends_at)
 values(p_event_id,v_uid,'monthly_free','free',p_target_scope,nullif(trim(coalesce(p_target_country,'')),''),nullif(trim(coalesce(p_target_state,'')),''),nullif(trim(coalesce(p_target_city,'')),''),nullif(trim(coalesce(p_target_area,'')),''),v_reach,v_reach*2,'active',v_ends)
 returning id into v_id;
 return jsonb_build_object('id',v_id,'unique_reach',v_reach,'notification_cap',v_reach*2,'ends_at',v_ends);
end;
$$;

create or replace function public.start_event_blast_secure(
 p_event_id uuid,p_plan_id text default 'starter',p_payment_method text default 'bc',
 p_target_scope text default 'worldwide',p_target_country text default null,p_target_state text default null,
 p_target_city text default null,p_target_area text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_plan public.event_blast_plans%rowtype; v_balance bigint; v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.events where id=p_event_id and creator_id=v_uid and is_published=true) then raise exception 'Only the event creator can promote this event'; end if;
 if p_payment_method not in ('bc','cash') then raise exception 'Unsupported payment method'; end if;
 if p_payment_method='cash' then raise exception 'Cash checkout requires verified Paystack confirmation'; end if;
 select * into v_plan from public.event_blast_plans where id=p_plan_id and enabled;
 if not found then raise exception 'This Event Blast plan is not configured yet'; end if;
 if v_plan.bc_price is null then raise exception 'BC payment is not available for this plan'; end if;
 insert into public.wallet_accounts(user_id,bc_balance) values(v_uid,0) on conflict(user_id) do nothing;
 select bc_balance into v_balance from public.wallet_accounts where user_id=v_uid for update;
 if coalesce(v_balance,0)<v_plan.bc_price then raise exception 'Not enough BC to start Event Blast'; end if;
 update public.wallet_accounts set bc_balance=bc_balance-v_plan.bc_price,updated_at=now() where user_id=v_uid;
 insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
 values(v_uid,'BC',-v_plan.bc_price,'event_blast:'||p_plan_id,p_event_id);
 insert into public.event_blasts(event_id,user_id,plan_id,payment_method,target_scope,target_country,target_state,target_city,target_area,unique_reach,notification_cap,status,ends_at)
 values(p_event_id,v_uid,p_plan_id,'bc',p_target_scope,p_target_country,p_target_state,p_target_city,p_target_area,v_plan.unique_reach,v_plan.unique_reach*2,'active',now()+make_interval(mins=>v_plan.duration_minutes))
 returning id into v_id;
 return jsonb_build_object('id',v_id,'bc_cost',v_plan.bc_price,'unique_reach',v_plan.unique_reach,'notification_cap',v_plan.unique_reach*2);
end;
$$;

revoke all on function public.get_event_blast_plans() from public,anon;
grant execute on function public.get_event_blast_plans() to authenticated;
revoke all on function public.get_event_promotion_status_secure() from public,anon;
grant execute on function public.get_event_promotion_status_secure() to authenticated;
revoke all on function public.claim_free_event_promotion_secure(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.claim_free_event_promotion_secure(uuid,text,text,text,text,text) to authenticated;
revoke all on function public.start_event_blast_secure(uuid,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.start_event_blast_secure(uuid,text,text,text,text,text,text,text) to authenticated;
