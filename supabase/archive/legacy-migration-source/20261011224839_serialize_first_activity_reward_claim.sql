create or replace function public.log_activity_and_reward()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
  v_reference_id uuid;
  v_activity_key text;
  v_reward bigint := 0;
  v_rows integer;
  v_conversation_type text;
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
    v_user_id := new.sender_id; v_reference_id := new.id;
    select c.conversation_type into v_conversation_type from public.conversations c where c.id = new.conversation_id;
    v_activity_key := case when v_conversation_type = 'group' then 'group_message' else 'private_message' end;
  else return new; end if;

  insert into public.user_activity_events(user_id,activity_key,reference_id)
  values (v_user_id,v_activity_key,v_reference_id)
  on conflict (user_id,activity_key,reference_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return new; end if;

  insert into public.wallet_accounts(user_id,bc_balance) values (v_user_id,0) on conflict (user_id) do nothing;
  perform 1 from public.wallet_accounts wa where wa.user_id = v_user_id for update;

  if not exists (select 1 from public.wallet_transactions wt where wt.user_id = v_user_id and wt.reason = 'reward:first_activity_reward') then
    select es.numeric_value into v_reward from public.economy_settings es where es.setting_key = 'first_activity_reward';
    v_reward := coalesce(v_reward,0);
    update public.wallet_accounts set bc_balance = bc_balance + v_reward, updated_at = now() where user_id = v_user_id;
    insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
    values (v_user_id,'BC',v_reward,'reward:first_activity_reward',v_reference_id);
  end if;

  perform public.award_xp_for_activity(v_user_id,v_activity_key,v_reference_id);
  return new;
end;
$$;
