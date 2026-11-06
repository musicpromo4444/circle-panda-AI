-- Align Dating chat billing with the persisted match free_until timestamp.
-- Also ensure expired VIP memberships no longer bypass message charges.
create or replace function public.charge_message_wallet()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_is_vip boolean := false;
  v_conversation_type text;
  v_dating_free_until timestamptz;
  v_cost bigint := 0;
  v_balance bigint;
begin
  if auth.uid() is null or auth.uid() <> new.sender_id then
    raise exception 'Messages must be sent by the signed-in sender';
  end if;

  select coalesce(p.is_vip, false)
         and (p.vip_expires_at is null or p.vip_expires_at > now())
    into v_is_vip
  from public.profiles p
  where p.id = new.sender_id;

  if coalesce(v_is_vip, false)
     or exists (
       select 1 from public.user_roles r
       where r.user_id = new.sender_id and r.role = 'admin'
     ) then
    return new;
  end if;

  select c.conversation_type
    into v_conversation_type
  from public.conversations c
  where c.id = new.conversation_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.user_id = new.sender_id
    );

  if v_conversation_type is null then
    raise exception 'Conversation not found or sender is not a member';
  end if;

  if v_conversation_type = 'dating' then
    select dm.free_until
      into v_dating_free_until
    from public.dating_matches dm
    where dm.thread_id = new.conversation_id
      and dm.status = 'matched'
      and (dm.user_a = new.sender_id or dm.user_b = new.sender_id)
    order by dm.created_at desc
    limit 1;

    if v_dating_free_until is null then
      raise exception 'An active Dating match is required to send messages';
    end if;

    if now() <= v_dating_free_until then
      return new;
    end if;

    select es.numeric_value into v_cost
    from public.economy_settings es
    where es.setting_key = 'dating_message_cost';
    v_cost := coalesce(v_cost, 1);
  elsif v_conversation_type = 'direct' then
    select es.numeric_value into v_cost
    from public.economy_settings es
    where es.setting_key = 'chat_message_cost';
    v_cost := coalesce(v_cost, 1);
  else
    return new;
  end if;

  if v_cost < 0 then
    raise exception 'Message cost cannot be negative';
  end if;

  if v_cost > 0 then
    insert into public.wallet_accounts(user_id, bc_balance)
    values (new.sender_id, 0)
    on conflict (user_id) do nothing;

    select wa.bc_balance into v_balance
    from public.wallet_accounts wa
    where wa.user_id = new.sender_id
    for update;

    if coalesce(v_balance, 0) < v_cost then
      raise exception 'Not enough BC to send this message';
    end if;

    update public.wallet_accounts
    set bc_balance = bc_balance - v_cost, updated_at = now()
    where user_id = new.sender_id;

    insert into public.wallet_transactions(user_id, currency, amount, reason, reference_id)
    values (
      new.sender_id,
      'BC',
      -v_cost,
      case when v_conversation_type = 'dating' then 'message_cost:dating' else 'message_cost:chat' end,
      new.conversation_id
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.charge_message_wallet() from public, anon, authenticated;
