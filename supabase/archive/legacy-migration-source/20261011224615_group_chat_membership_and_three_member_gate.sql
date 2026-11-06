-- Secure group creation/joining and open text chats only after the 3-member threshold.
create unique index if not exists group_conversation_context_unique
on public.conversations(conversation_type, context_id)
where conversation_type = 'group' and context_id is not null;
revoke insert, update, delete on public.chat_groups from authenticated;

create or replace function public.sync_group_member_to_conversation()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_conversation_id uuid;
begin
  select c.id into v_conversation_id from public.conversations c
  where c.conversation_type = 'group' and c.context_id = new.group_id limit 1;
  if v_conversation_id is not null then
    insert into public.conversation_members(conversation_id,user_id)
    values (v_conversation_id,new.user_id) on conflict (conversation_id,user_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists group_members_sync_conversation on public.group_members;
create trigger group_members_sync_conversation after insert on public.group_members
for each row execute function public.sync_group_member_to_conversation();

create or replace function public.create_chat_group(p_name text,p_description text default '',p_country_restriction text default null,p_is_vip boolean default false)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_group_id uuid; v_is_vip boolean := false;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if length(trim(coalesce(p_name,''))) < 2 or length(trim(p_name)) > 100 then raise exception 'Group name must be between 2 and 100 characters'; end if;
  select coalesce(p.is_vip,false) into v_is_vip from public.profiles p where p.id = v_user_id;
  if p_is_vip and not coalesce(v_is_vip,false) then raise exception 'VIP membership is required to create a VIP group'; end if;
  insert into public.chat_groups(creator_id,name,description,country_restriction,is_vip)
  values (v_user_id,trim(p_name),left(coalesce(p_description,''),2000),nullif(trim(coalesce(p_country_restriction,'')),''),p_is_vip)
  returning id into v_group_id;
  insert into public.conversations(conversation_type,context_id,created_by) values ('group',v_group_id,v_user_id);
  insert into public.group_members(group_id,user_id,role) values (v_group_id,v_user_id,'creator');
  return v_group_id;
end;
$$;

create or replace function public.join_chat_group(p_group_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_group public.chat_groups%rowtype; v_is_vip boolean := false; v_country text;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  select * into v_group from public.chat_groups g where g.id = p_group_id;
  if not found then raise exception 'Group was not found'; end if;
  select coalesce(p.is_vip,false),p.country into v_is_vip,v_country from public.profiles p where p.id = v_user_id;
  if v_group.is_vip and not coalesce(v_is_vip,false) then raise exception 'VIP membership is required for this group'; end if;
  if v_group.country_restriction is not null and v_group.country_restriction <> v_country then raise exception 'This group is restricted to another country'; end if;
  insert into public.group_members(group_id,user_id,role) values (p_group_id,v_user_id,'member') on conflict (group_id,user_id) do nothing;
  return true;
end;
$$;

create or replace function public.open_group_chat(p_group_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_conversation_id uuid; v_member_count bigint;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if not exists (select 1 from public.group_members gm where gm.group_id = p_group_id and gm.user_id = v_user_id) then raise exception 'Join this group before opening its chat'; end if;
  select count(*) into v_member_count from public.group_members gm where gm.group_id = p_group_id;
  if v_member_count < 3 then raise exception 'This group opens when it has at least 3 members'; end if;
  select c.id into v_conversation_id from public.conversations c where c.conversation_type='group' and c.context_id=p_group_id limit 1;
  if v_conversation_id is null then raise exception 'Group chat is not ready'; end if;
  return v_conversation_id;
end;
$$;

create or replace function public.guard_group_chat_open()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_group_id uuid; v_member_count bigint;
begin
  if not exists (select 1 from public.conversations c where c.id = new.conversation_id and c.conversation_type='group') then return new; end if;
  select c.context_id into v_group_id from public.conversations c where c.id = new.conversation_id;
  select count(*) into v_member_count from public.group_members gm where gm.group_id = v_group_id;
  if v_member_count < 3 then raise exception 'This group opens when it has at least 3 members'; end if;
  if not exists (select 1 from public.group_members gm where gm.group_id = v_group_id and gm.user_id = new.sender_id) then raise exception 'Only group members can send messages'; end if;
  return new;
end;
$$;
drop trigger if exists messages_guard_group_open on public.messages;
create trigger messages_guard_group_open before insert on public.messages
for each row execute function public.guard_group_chat_open();

create or replace function public.award_xp_for_activity(p_user_id uuid,p_activity_key text,p_reference_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_setting_key text; v_amount bigint := 0; v_is_vip boolean := false; v_new_total bigint; v_level text;
begin
  select coalesce(p.is_vip,false) into v_is_vip from public.profiles p where p.id = p_user_id;
  if coalesce(v_is_vip,false) then return; end if;
  v_setting_key := case p_activity_key
    when 'create_post' then 'xp_create_post' when 'reply_post' then 'xp_reply_post'
    when 'create_event' then 'xp_create_event' when 'attend_event' then 'xp_attend_event'
    when 'join_group' then 'xp_join_group' when 'create_group' then 'xp_create_group'
    when 'private_message' then 'xp_private_message' when 'group_message' then 'xp_group_message'
    else null end;
  if v_setting_key is null then return; end if;
  select es.numeric_value into v_amount from public.economy_settings es where es.setting_key = v_setting_key;
  v_amount := coalesce(v_amount,0);
  if v_amount <= 0 then return; end if;
  insert into public.user_xp(user_id,xp_total,level_name) values (p_user_id,0,'Novice') on conflict (user_id) do nothing;
  update public.user_xp set xp_total = xp_total + v_amount, updated_at = now() where user_id = p_user_id returning xp_total into v_new_total;
  v_level := case when v_new_total >= 550000 then 'Legendary' when v_new_total >= 250000 then 'Mysterious'
    when v_new_total >= 110000 then 'Shadow' when v_new_total >= 60000 then 'Panda General'
    when v_new_total >= 27000 then 'Kung Fu' when v_new_total >= 8000 then 'Growing' else 'Novice' end;
  update public.user_xp set level_name = v_level where user_id = p_user_id;
end;
$$;
revoke all on function public.award_xp_for_activity(uuid,text,uuid) from public, authenticated;

create or replace function public.log_activity_and_reward()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid; v_reference_id uuid; v_activity_key text; v_reward bigint := 0; v_rows integer; v_conversation_type text;
begin
  if tg_table_name = 'feed_posts' then v_user_id := new.author_id; v_reference_id := new.id; v_activity_key := 'create_post';
  elsif tg_table_name = 'post_comments' then v_user_id := new.author_id; v_reference_id := new.id; v_activity_key := 'reply_post';
  elsif tg_table_name = 'events' then v_user_id := new.creator_id; v_reference_id := new.id; v_activity_key := 'create_event';
  elsif tg_table_name = 'event_attendees' then
    if new.status <> 'attending' then return new; end if;
    v_user_id := new.user_id; v_reference_id := new.event_id; v_activity_key := 'attend_event';
  elsif tg_table_name = 'group_members' then
    v_user_id := new.user_id; v_reference_id := new.group_id; v_activity_key := case when new.role = 'creator' then 'create_group' else 'join_group' end;
  elsif tg_table_name = 'messages' then
    v_user_id := new.sender_id; v_reference_id := new.id;
    select c.conversation_type into v_conversation_type from public.conversations c where c.id = new.conversation_id;
    v_activity_key := case when v_conversation_type = 'group' then 'group_message' else 'private_message' end;
  else return new; end if;

  insert into public.user_activity_events(user_id,activity_key,reference_id) values (v_user_id,v_activity_key,v_reference_id)
  on conflict (user_id,activity_key,reference_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return new; end if;

  if not exists (select 1 from public.wallet_transactions wt where wt.user_id = v_user_id and wt.reason = 'reward:first_activity_reward') then
    select es.numeric_value into v_reward from public.economy_settings es where es.setting_key = 'first_activity_reward';
    v_reward := coalesce(v_reward,0);
    insert into public.wallet_accounts(user_id,bc_balance) values (v_user_id,0) on conflict (user_id) do nothing;
    update public.wallet_accounts set bc_balance = bc_balance + v_reward, updated_at = now() where user_id = v_user_id;
    insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values (v_user_id,'BC',v_reward,'reward:first_activity_reward',v_reference_id);
  end if;
  perform public.award_xp_for_activity(v_user_id,v_activity_key,v_reference_id);
  return new;
end;
$$;
drop trigger if exists group_members_log_activity on public.group_members;
create trigger group_members_log_activity after insert on public.group_members for each row execute function public.log_activity_and_reward();
drop trigger if exists messages_log_activity on public.messages;
create trigger messages_log_activity after insert on public.messages for each row execute function public.log_activity_and_reward();
