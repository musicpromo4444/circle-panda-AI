-- Private order ledger and idempotent server-side BC crediting for Paystack.
create table if not exists public.coin_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id text not null references public.coin_packages(id),
  coins bigint not null check (coins > 0),
  amount_ngn numeric(12,2) not null check (amount_ngn > 0),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  paystack_reference text not null unique,
  gateway_transaction_id text,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists coin_purchase_orders_user_created_idx
  on public.coin_purchase_orders(user_id,created_at desc);
alter table public.coin_purchase_orders enable row level security;
revoke all on table public.coin_purchase_orders from public, anon, authenticated;

create or replace function public.complete_coin_purchase_secure(
  p_reference text,p_amount_minor bigint,p_currency text,p_gateway_transaction_id text default null
)
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare v_order public.coin_purchase_orders%rowtype; v_balance bigint;
begin
  select * into v_order from public.coin_purchase_orders where paystack_reference=p_reference for update;
  if not found then raise exception 'Coin purchase reference was not found'; end if;
  if v_order.status='paid' then
    select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id=v_order.user_id;
    return jsonb_build_object('status','paid','coins',v_order.coins,'balance',coalesce(v_balance,0),'already_credited',true);
  end if;
  if v_order.status<>'pending' then raise exception 'This coin purchase is not pending'; end if;
  if upper(coalesce(p_currency,'')) <> v_order.currency then raise exception 'Payment currency does not match the order'; end if;
  if p_amount_minor <> v_order.amount_minor then raise exception 'Payment amount does not match the order'; end if;
  insert into public.wallet_accounts(user_id,bc_balance) values(v_order.user_id,0) on conflict(user_id) do nothing;
  select wa.bc_balance into v_balance from public.wallet_accounts wa where wa.user_id=v_order.user_id for update;
  update public.wallet_accounts set bc_balance=bc_balance+v_order.coins,updated_at=now()
  where user_id=v_order.user_id returning bc_balance into v_balance;
  insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
  values(v_order.user_id,'BC',v_order.coins,'coin_purchase:paystack',v_order.id);
  update public.coin_purchase_orders set status='paid',paid_at=now(),gateway_transaction_id=p_gateway_transaction_id where id=v_order.id;
  return jsonb_build_object('status','paid','coins',v_order.coins,'balance',v_balance,'already_credited',false);
end;
$function$;

create or replace function public.get_my_coin_purchase_status_secure(p_reference text)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $function$
declare v_order public.coin_purchase_orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select * into v_order from public.coin_purchase_orders where paystack_reference=p_reference and user_id=auth.uid();
  if not found then raise exception 'Purchase reference was not found'; end if;
  return jsonb_build_object('status',v_order.status,'coins',v_order.coins,'amount_ngn',v_order.amount_ngn,'paid_at',v_order.paid_at);
end;
$function$;

revoke all on function public.complete_coin_purchase_secure(text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.complete_coin_purchase_secure(text,bigint,text,text) to service_role;
revoke all on function public.get_my_coin_purchase_status_secure(text) from public, anon;
grant execute on function public.get_my_coin_purchase_status_secure(text) to authenticated;
