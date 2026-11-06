CREATE OR REPLACE FUNCTION public.admin_upsert_event_blast_plan(
  p_id text,
  p_name text,
  p_unique_reach integer,
  p_duration_minutes integer,
  p_price_usd numeric,
  p_bc_price bigint,
  p_enabled boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin'
  ) then raise exception 'Administrator access is required'; end if;
  if nullif(trim(p_id),'') is null or length(p_id)>80 then raise exception 'Plan ID is required and must be 80 characters or fewer'; end if;
  if nullif(trim(p_name),'') is null or length(p_name)>120 then raise exception 'Plan name is required and must be 120 characters or fewer'; end if;
  if p_unique_reach<1 or p_unique_reach>10000000 then raise exception 'Reach must be between 1 and 10000000'; end if;
  if p_duration_minutes<1 or p_duration_minutes>525600 then raise exception 'Duration must be between 1 minute and one year'; end if;
  if p_price_usd<0 or (p_bc_price is not null and p_bc_price<0) then raise exception 'Plan prices cannot be negative'; end if;
  insert into public.event_blast_plans(id,name,unique_reach,duration_minutes,price_usd,bc_price,enabled,updated_at)
  values(trim(p_id),trim(p_name),p_unique_reach,p_duration_minutes,p_price_usd, p_bc_price,coalesce(p_enabled,true),now())
  on conflict(id) do update set name=excluded.name, unique_reach=excluded.unique_reach,
    duration_minutes=excluded.duration_minutes, price_usd=excluded.price_usd,
    bc_price=excluded.bc_price, enabled=excluded.enabled, updated_at=now();
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_event_blast_plan(text,text,integer,integer,numeric,bigint,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_event_blast_plan(text,text,integer,integer,numeric,bigint,boolean) TO authenticated;
