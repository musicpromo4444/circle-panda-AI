-- Store coin package contents/prices in Supabase so the wallet and admin agree.
create table if not exists public.coin_packages (
  id text primary key,
  name text not null,
  coins bigint not null check (coins > 0),
  price_ngn numeric(12,2),
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coin_packages_price_nonnegative check (price_ngn is null or price_ngn >= 0)
);
alter table public.coin_packages enable row level security;
revoke all on table public.coin_packages from public, anon, authenticated;

insert into public.coin_packages(id,name,coins,price_ngn,enabled,sort_order)
values
 ('100','Mini',100,null,true,1),
 ('300','Starter',300,null,true,2),
 ('700','Value',700,null,true,3),
 ('1200','Popular',1200,null,true,4),
 ('2500','Power',2500,null,true,5),
 ('5000','Mega',5000,null,true,6)
on conflict(id) do nothing;

create or replace function public.get_coin_packages()
returns table(id text,name text,coins bigint,price_ngn numeric,sort_order integer)
language sql stable security definer set search_path to ''
as $function$
  select p.id,p.name,p.coins,p.price_ngn,p.sort_order
  from public.coin_packages p where p.enabled order by p.sort_order,p.coins;
$function$;

create or replace function public.get_coin_packages_admin()
returns table(id text,name text,coins bigint,price_ngn numeric,enabled boolean,sort_order integer)
language plpgsql stable security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin'
  ) then raise exception 'Administrator access is required'; end if;
  return query select p.id,p.name,p.coins,p.price_ngn,p.enabled,p.sort_order
    from public.coin_packages p order by p.sort_order,p.coins;
end;
$function$;

create or replace function public.admin_upsert_coin_package(
  p_id text,p_name text,p_coins bigint,p_price_ngn numeric,
  p_enabled boolean default true,p_sort_order integer default 0
)
returns void
language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin'
  ) then raise exception 'Administrator access is required'; end if;
  if nullif(trim(p_id),'') is null or length(trim(p_id))>40 then raise exception 'Package ID is required and must be 40 characters or fewer'; end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name))>80 then raise exception 'Package name is required and must be 80 characters or fewer'; end if;
  if p_coins<1 or p_coins>1000000000 then raise exception 'Coin amount must be between 1 and 1000000000'; end if;
  if p_price_ngn is not null and p_price_ngn<0 then raise exception 'Package price cannot be negative'; end if;
  insert into public.coin_packages(id,name,coins,price_ngn,enabled,sort_order,updated_at)
  values(trim(p_id),trim(p_name),p_coins,p_price_ngn,coalesce(p_enabled,true),coalesce(p_sort_order,0),now())
  on conflict(id) do update set name=excluded.name,coins=excluded.coins,price_ngn=excluded.price_ngn,
    enabled=excluded.enabled,sort_order=excluded.sort_order,updated_at=now();
end;
$function$;

revoke all on function public.get_coin_packages() from public, anon;
grant execute on function public.get_coin_packages() to authenticated;
revoke all on function public.get_coin_packages_admin() from public, anon;
grant execute on function public.get_coin_packages_admin() to authenticated;
revoke all on function public.admin_upsert_coin_package(text,text,bigint,numeric,boolean,integer) from public, anon;
grant execute on function public.admin_upsert_coin_package(text,text,bigint,numeric,boolean,integer) to authenticated;
