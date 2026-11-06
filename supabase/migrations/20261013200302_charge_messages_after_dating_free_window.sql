
create or replace function public.charge_message_wallet()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
 v_is_vip boolean:=false;
 v_conversation_type text;
 v_conversation_created timestamptz;
 v_dating_created timestamptz;
 v_cost bigint:=0;
 v_balance bigint;
 v_dating_free_hours bigint:=72;
begin
 select coalesce(p.is_vip,false) into v_is_vip from public.profiles p where p.id=new.sender_id;
 if coalesce(v_is_vip,false) then return new; end if;
 select c.conversation_type,c.created_at into v_conversation_type,v_conversation_created
 from public.conversations c where c.id=new.conversation_id;
 if v_conversation_type in ('direct','dating') then
  select es.numeric_value into v_dating_free_hours from public.economy_settings es where es.setting_key='dating_free_hours';
  v_dating_free_hours:=coalesce(v_dating_free_hours,72);
  select mr.created_at into v_dating_created from public.message_requests mr
  where mr.conversation_id=new.conversation_id and mr.source_type='dating'
  order by mr.responded_at desc nulls last limit 1;
  if v_dating_created is not null and now()<=v_conversation_created+make_interval(hours=>v_dating_free_hours::double precision) then
   return new;
  end if;
  if v_dating_created is not null then
   select es.numeric_value into v_cost from public.economy_settings es where es.setting_key='dating_message_cost';
   v_cost:=coalesce(v_cost,1);
  else
   select es.numeric_value into v_cost from public.economy_settings es where es.setting_key='chat_message_cost';
   v_cost:=coalesce(v_cost,1);
  end if;
 else
  return new;
 end if;
 if v_cost>0 then
  insert into public.wallet_accounts(user_id,bc_balance) values(new.sender_id,0) on conflict(user_id) do nothing;
  select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id=new.sender_id for update;
  if coalesce(v_balance,0)<v_cost then raise exception 'Not enough BC to send this message'; end if;
  update public.wallet_accounts set bc_balance=bc_balance-v_cost,updated_at=now() where user_id=new.sender_id;
  insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
  values(new.sender_id,'BC',-v_cost,'message_cost:'||case when v_dating_created is null then 'chat' else 'dating' end,new.conversation_id);
 end if;
 return new;
end;
$$;
