
create or replace function public.claim_free_event_promotion_secure(
 p_event_id uuid,p_target_scope text default 'worldwide',p_target_country text default null,
 p_target_state text default null,p_target_city text default null,p_target_area text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_vip boolean:=false; v_reach integer:=100; v_id uuid; v_actual integer; v_cap integer; v_ends timestamptz;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.events where id=p_event_id and creator_id=v_uid and is_published=true) then raise exception 'Only the event creator can promote this event'; end if;
 if p_target_scope not in ('worldwide','country','state','city','area') then raise exception 'Invalid target audience'; end if;
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
 select unique_reach,notification_cap,ends_at into v_actual,v_cap,v_ends from public.event_blasts where id=v_id;
 return jsonb_build_object('id',v_id,'unique_reach',v_actual,'notification_cap',v_cap,'ends_at',v_ends);
end;
$$;

create or replace function public.start_event_blast_secure(
 p_event_id uuid,p_plan_id text default 'starter',p_payment_method text default 'bc',
 p_target_scope text default 'worldwide',p_target_country text default null,p_target_state text default null,
 p_target_city text default null,p_target_area text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_plan public.event_blast_plans%rowtype; v_balance bigint; v_id uuid; v_actual integer; v_cap integer;
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
 select unique_reach,notification_cap into v_actual,v_cap from public.event_blasts where id=v_id;
 return jsonb_build_object('id',v_id,'bc_cost',v_plan.bc_price,'unique_reach',v_actual,'notification_cap',v_cap);
end;
$$;
revoke all on function public.prepare_event_blast_audience() from public,anon,authenticated;
revoke all on function public.deliver_event_blast_notifications() from public,anon,authenticated;
