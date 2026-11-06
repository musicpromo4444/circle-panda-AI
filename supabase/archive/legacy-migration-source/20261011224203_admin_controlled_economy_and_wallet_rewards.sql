-- Admin-controlled economy defaults and server-side wallet/message charging.
create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','moderator')),
  created_at timestamptz not null default now(),
  primary key(user_id, role)
);

create table if not exists public.economy_settings (
  setting_key text primary key,
  numeric_value bigint not null check (numeric_value >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.economy_settings(setting_key, numeric_value) values
  ('welcome_bonus',200),
  ('first_activity_reward',2),
  ('daily_login_reward',3),
  ('ad_reward',30),
  ('ad_reward_cooldown_seconds',300),
  ('chat_message_cost',1),
  ('dating_message_cost',1),
  ('dating_free_hours',72),
  ('extra_vote_cost',50),
  ('weekly_free_votes',3),
  ('first_group_message_reward',3),
  ('xp_reply_post',5),
  ('xp_create_post',7),
  ('xp_daily_activity',5),
  ('xp_create_event',6),
  ('xp_attend_event',2),
  ('xp_join_group',6),
  ('xp_complete_profile',10),
  ('xp_daily_login',3),
  ('xp_private_message',1),
  ('xp_group_message',1),
  ('xp_wcw_vote',2),
  ('xp_create_group',10),
  ('xp_dating_match_chat',3),
  ('xp_wheel_spin',5),
  ('xp_buy_gift',10),
  ('vip_xp_reward',0)
on conflict (setting_key) do nothing;

alter table public.user_roles enable row level security;
alter table public.economy_settings enable row level security;

drop policy if exists "users can see their own roles" on public.user_roles;
create policy "users can see their own roles" on public.user_roles
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "signed-in users can read economy settings" on public.economy_settings;
create policy "signed-in users can read economy settings" on public.economy_settings
for select to authenticated using (true);

revoke insert, update, delete on public.user_roles from authenticated;
revoke insert, update, delete on public.economy_settings from authenticated;

create or replace function public.set_economy_setting(p_setting_key text, p_numeric_value bigint)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'
  ) then raise exception 'Administrator access is required'; end if;
  if p_numeric_value < 0 then raise exception 'Setting values cannot be negative'; end if;
  update public.economy_settings
    set numeric_value = p_numeric_value, updated_at = now(), updated_by = auth.uid()
    where setting_key = p_setting_key;
  if not found then raise exception 'Unknown economy setting'; end if;
end;
$$;
revoke all on function public.set_economy_setting(text, bigint) from public;
grant execute on function public.set_economy_setting(text, bigint) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_bonus bigint := 0;
begin
  insert into public.profiles(id, display_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    nullif(new.raw_user_meta_data ->> 'username','')
  )
  on conflict (id) do nothing;

  select es.numeric_value into v_bonus from public.economy_settings es where es.setting_key = 'welcome_bonus';
  v_bonus := coalesce(v_bonus, 0);
  insert into public.wallet_accounts(user_id, bc_balance)
  values (new.id, v_bonus)
  on conflict (user_id) do nothing;
  insert into public.wallet_transactions(user_id, currency, amount, reason)
  values (new.id, 'BC', v_bonus, 'reward:welcome_bonus')
  on conflict do nothing;

  insert into public.user_xp(user_id, xp_total, level_name)
  values (new.id, 0, 'Novice')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.claim_economy_reward(p_reward_key text)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_setting_key text;
  v_amount bigint;
  v_cooldown bigint := 0;
  v_last_claim timestamptz;
  v_balance bigint;
  v_reason text;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if p_reward_key not in ('first_activity_reward','daily_login_reward','ad_reward') then
    raise exception 'This reward cannot be claimed directly';
  end if;
  v_setting_key := case p_reward_key
    when 'first_activity_reward' then 'first_activity_reward'
    when 'daily_login_reward' then 'daily_login_reward'
    else 'ad_reward' end;
  select es.numeric_value into v_amount from public.economy_settings es where es.setting_key = v_setting_key;
  v_amount := coalesce(v_amount,0);
  v_reason := 'reward:' || p_reward_key;

  if p_reward_key = 'ad_reward' then
    select es.numeric_value into v_cooldown from public.economy_settings es where es.setting_key = 'ad_reward_cooldown_seconds';
    v_cooldown := coalesce(v_cooldown,300);
  elsif p_reward_key = 'daily_login_reward' then
    v_cooldown := 86400;
  else
    v_cooldown := 0;
  end if;

  insert into public.wallet_accounts(user_id,bc_balance) values (v_user_id,0) on conflict (user_id) do nothing;
  select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id = v_user_id for update;
  select max(wt.created_at) into v_last_claim
  from public.wallet_transactions wt
  where wt.user_id = v_user_id and wt.reason = v_reason;

  if p_reward_key = 'first_activity_reward' and v_last_claim is not null then
    raise exception 'Your first-activity reward has already been claimed';
  end if;
  if v_last_claim is not null and v_cooldown > 0 and v_last_claim > now() - make_interval(secs => v_cooldown::double precision) then
    raise exception 'This reward is still on cooldown';
  end if;

  update public.wallet_accounts set bc_balance = bc_balance + v_amount, updated_at = now() where user_id = v_user_id;
  insert into public.wallet_transactions(user_id,currency,amount,reason)
  values (v_user_id,'BC',v_amount,v_reason);

  if p_reward_key = 'daily_login_reward' then
    update public.user_xp ux
      set xp_total = ux.xp_total + coalesce((select es.numeric_value from public.economy_settings es where es.setting_key='xp_daily_login'),3),
          updated_at = now()
      where ux.user_id = v_user_id
        and not exists (select 1 from public.profiles p where p.id = v_user_id and p.is_vip);
  end if;

  select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id = v_user_id;
  return v_balance;
end;
$$;
revoke all on function public.claim_economy_reward(text) from public;
grant execute on function public.claim_economy_reward(text) to authenticated;

create or replace function public.charge_message_wallet()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_is_vip boolean := false;
  v_conversation_type text;
  v_conversation_created timestamptz;
  v_dating_created timestamptz;
  v_cost bigint := 0;
  v_balance bigint;
  v_dating_free_hours bigint := 72;
begin
  select coalesce(p.is_vip,false) into v_is_vip from public.profiles p where p.id = new.sender_id;
  if coalesce(v_is_vip,false) then return new; end if;

  select c.conversation_type, c.created_at
    into v_conversation_type, v_conversation_created
    from public.conversations c where c.id = new.conversation_id;
  if v_conversation_type = 'direct' then
    select es.numeric_value into v_dating_free_hours from public.economy_settings es where es.setting_key='dating_free_hours';
    v_dating_free_hours := coalesce(v_dating_free_hours,72);
    select mr.created_at into v_dating_created
    from public.message_requests mr
    where mr.conversation_id = new.conversation_id and mr.source_type = 'dating'
    order by mr.responded_at desc nulls last limit 1;
    if v_dating_created is not null and now() <= v_conversation_created + make_interval(hours => v_dating_free_hours::double precision) then
      return new;
    end if;
    select es.numeric_value into v_cost from public.economy_settings es where es.setting_key='chat_message_cost';
    v_cost := coalesce(v_cost,1);
    if v_dating_created is not null then
      select es.numeric_value into v_cost from public.economy_settings es where es.setting_key='dating_message_cost';
      v_cost := coalesce(v_cost,1);
    end if;
  else
    return new;
  end if;

  if v_cost > 0 then
    insert into public.wallet_accounts(user_id,bc_balance) values (new.sender_id,0) on conflict (user_id) do nothing;
    select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id = new.sender_id for update;
    if v_balance < v_cost then raise exception 'Not enough BC to send this message'; end if;
    update public.wallet_accounts set bc_balance = bc_balance - v_cost, updated_at = now() where user_id = new.sender_id;
    insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
    values (new.sender_id,'BC',-v_cost,'message_cost:' || case when v_dating_created is null then 'chat' else 'dating' end,new.conversation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists messages_charge_wallet_before_insert on public.messages;
create trigger messages_charge_wallet_before_insert
before insert on public.messages
for each row execute function public.charge_message_wallet();
