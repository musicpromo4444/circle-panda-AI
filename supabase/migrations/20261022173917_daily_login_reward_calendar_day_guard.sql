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
