create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_key text not null,
  reference_id uuid,
  created_at timestamptz not null default now(),
  unique(user_id, activity_key, reference_id)
);
alter table public.user_activity_events enable row level security;
drop policy if exists "users can view own activity events" on public.user_activity_events;
create policy "users can view own activity events" on public.user_activity_events
for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.user_activity_events from authenticated;

alter function public.claim_economy_reward(text) rename to claim_economy_reward_internal;
revoke all on function public.claim_economy_reward_internal(text) from public, authenticated;
create or replace function public.claim_economy_reward(p_reward_key text)
returns bigint language plpgsql security definer set search_path = ''
as $$
begin
  if p_reward_key = 'first_activity_reward' then
    raise exception 'The first-activity reward is granted automatically after your first activity';
  end if;
  if p_reward_key not in ('daily_login_reward','ad_reward') then
    raise exception 'This reward cannot be claimed directly';
  end if;
  return public.claim_economy_reward_internal(p_reward_key);
end;
$$;
revoke all on function public.claim_economy_reward(text) from public;
grant execute on function public.claim_economy_reward(text) to authenticated;

create or replace function public.award_xp_for_activity(p_user_id uuid, p_activity_key text, p_reference_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_setting_key text;
  v_amount bigint := 0;
  v_is_vip boolean := false;
  v_new_total bigint;
  v_level text;
begin
  select coalesce(p.is_vip,false) into v_is_vip from public.profiles p where p.id = p_user_id;
  if coalesce(v_is_vip,false) then return; end if;
  v_setting_key := case p_activity_key
    when 'create_post' then 'xp_create_post'
    when 'reply_post' then 'xp_reply_post'
    when 'create_event' then 'xp_create_event'
    when 'attend_event' then 'xp_attend_event'
    when 'join_group' then 'xp_join_group'
    when 'create_group' then 'xp_create_group'
    when 'private_message' then 'xp_private_message'
    else null end;
  if v_setting_key is null then return; end if;
  select es.numeric_value into v_amount from public.economy_settings es where es.setting_key = v_setting_key;
  v_amount := coalesce(v_amount,0);
  if v_amount <= 0 then return; end if;
  insert into public.user_xp(user_id,xp_total,level_name) values (p_user_id,0,'Novice') on conflict (user_id) do nothing;
  update public.user_xp set xp_total = xp_total + v_amount, updated_at = now()
    where user_id = p_user_id returning xp_total into v_new_total;
  v_level := case
    when v_new_total >= 550000 then 'Legendary'
    when v_new_total >= 250000 then 'Mysterious'
    when v_new_total >= 110000 then 'Shadow'
    when v_new_total >= 60000 then 'Panda General'
    when v_new_total >= 27000 then 'Kung Fu'
    when v_new_total >= 8000 then 'Growing'
    else 'Novice' end;
  update public.user_xp set level_name = v_level where user_id = p_user_id;
end;
$$;
revoke all on function public.award_xp_for_activity(uuid,text,uuid) from public, authenticated;

create or replace function public.log_activity_and_reward()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
  v_reference_id uuid;
  v_activity_key text;
  v_reward bigint := 0;
  v_rows integer;
begin
  if tg_table_name = 'feed_posts' then
    v_user_id := new.author_id; v_reference_id := new.id; v_activity_key := 'create_post';
  elsif tg_table_name = 'post_comments' then
    v_user_id := new.author_id; v_reference_id := new.id; v_activity_key := 'reply_post';
  elsif tg_table_name = 'events' then
    v_user_id := new.creator_id; v_reference_id := new.id; v_activity_key := 'create_event';
  elsif tg_table_name = 'event_attendees' then
    if new.status <> 'attending' then return new; end if;
    v_user_id := new.user_id; v_reference_id := new.event_id; v_activity_key := 'attend_event';
  elsif tg_table_name = 'group_members' then
    v_user_id := new.user_id; v_reference_id := new.group_id;
    v_activity_key := case when new.role = 'creator' then 'create_group' else 'join_group' end;
  elsif tg_table_name = 'messages' then
    v_user_id := new.sender_id; v_reference_id := new.id; v_activity_key := 'private_message';
  else
    return new;
  end if;

  insert into public.user_activity_events(user_id,activity_key,reference_id)
  values (v_user_id,v_activity_key,v_reference_id)
  on conflict (user_id,activity_key,reference_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return new; end if;

  if not exists (select 1 from public.wallet_transactions wt where wt.user_id = v_user_id and wt.reason = 'reward:first_activity_reward') then
    select es.numeric_value into v_reward from public.economy_settings es where es.setting_key = 'first_activity_reward';
    v_reward := coalesce(v_reward,0);
    insert into public.wallet_accounts(user_id,bc_balance) values (v_user_id,0) on conflict (user_id) do nothing;
    update public.wallet_accounts set bc_balance = bc_balance + v_reward, updated_at = now() where user_id = v_user_id;
    insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
    values (v_user_id,'BC',v_reward,'reward:first_activity_reward',v_reference_id);
  end if;

  perform public.award_xp_for_activity(v_user_id,v_activity_key,v_reference_id);
  return new;
end;
$$;

drop trigger if exists feed_posts_log_activity on public.feed_posts;
create trigger feed_posts_log_activity after insert on public.feed_posts
for each row execute function public.log_activity_and_reward();
drop trigger if exists post_comments_log_activity on public.post_comments;
create trigger post_comments_log_activity after insert on public.post_comments
for each row execute function public.log_activity_and_reward();
drop trigger if exists events_log_activity on public.events;
create trigger events_log_activity after insert on public.events
for each row execute function public.log_activity_and_reward();
drop trigger if exists event_attendees_log_activity on public.event_attendees;
create trigger event_attendees_log_activity after insert or update of status on public.event_attendees
for each row execute function public.log_activity_and_reward();
drop trigger if exists group_members_log_activity on public.group_members;
create trigger group_members_log_activity after insert on public.group_members
for each row execute function public.log_activity_and_reward();
drop trigger if exists messages_log_activity on public.messages;
create trigger messages_log_activity after insert on public.messages
for each row execute function public.log_activity_and_reward();
