-- Paystack can retry a transaction after a failed attempt. A verified later success
-- must still be allowed to settle that order; the paid status remains idempotent.
create or replace function public.complete_coin_purchase_secure(
  p_reference text,p_amount_minor bigint,p_currency text,p_gateway_transaction_id text default null
)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_order public.coin_purchase_orders%rowtype; v_balance bigint;
begin
  select * into v_order from public.coin_purchase_orders where paystack_reference=p_reference for update;
  if not found then raise exception 'Coin purchase reference was not found'; end if;
  if v_order.status='paid' then
    select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id=v_order.user_id;
    return jsonb_build_object('status','paid','coins',v_order.coins,'balance',coalesce(v_balance,0),'already_credited',true);
  end if;
  if v_order.status not in ('pending','failed') then raise exception 'This coin purchase cannot be completed'; end if;
  if upper(coalesce(p_currency,'')) <> v_order.currency then raise exception 'Payment currency does not match the order'; end if;
  if p_amount_minor <> v_order.amount_minor then raise exception 'Payment amount does not match the order'; end if;
  insert into public.wallet_accounts(user_id,bc_balance) values(v_order.user_id,0) on conflict(user_id) do nothing;
  select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id=v_order.user_id for update;
  update public.wallet_accounts set bc_balance=bc_balance+v_order.coins,updated_at=now() where user_id=v_order.user_id returning bc_balance into v_balance;
  insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id) values(v_order.user_id,'BC',v_order.coins,'coin_purchase:paystack',v_order.id);
  update public.coin_purchase_orders set status='paid',paid_at=now(),gateway_transaction_id=p_gateway_transaction_id where id=v_order.id;
  return jsonb_build_object('status','paid','coins',v_order.coins,'balance',v_balance,'already_credited',false);
end;
$function$;
revoke all on function public.complete_coin_purchase_secure(text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.complete_coin_purchase_secure(text,bigint,text,text) to service_role;
