
create or replace function public.create_event_secure(
 p_title text,p_description text,p_location text,p_starts_at timestamptz,p_ends_at timestamptz,
 p_category text,p_entry_fee_bc bigint,p_duration_minutes integer,p_reach_scope text,
 p_reach_country text,p_reach_state text,p_reach_city text,p_reach_area text,
 p_entry_fee_amount numeric,p_entry_fee_currency text,p_venue_name text,p_address_line text,
 p_country text,p_state_province text,p_city text,p_area text,p_latitude double precision,
 p_longitude double precision,p_cover_url text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_event_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if coalesce(trim(p_title),'')='' then raise exception 'Event name is required'; end if;
 if p_starts_at is null or p_starts_at < now() then raise exception 'Choose a future event date and time'; end if;
 if coalesce(trim(p_country),'')='' or coalesce(trim(p_city),'')='' then raise exception 'Choose the event country and city'; end if;
 if coalesce(trim(p_description),'')='' then raise exception 'Event details are required'; end if;
 if coalesce(p_entry_fee_amount,0)<0 or coalesce(p_entry_fee_bc,0)<0 then raise exception 'Event fees cannot be negative'; end if;
 if coalesce(p_reach_scope,'worldwide') not in ('worldwide','country','state','city','area') then raise exception 'Invalid event audience scope'; end if;
 if coalesce(p_entry_fee_currency,'NGN')<>'NGN' and coalesce(p_entry_fee_amount,0)>0 then raise exception 'Paid event gate fees currently use NGN'; end if;
 if p_reach_scope in ('country','state','city','area') and coalesce(trim(p_reach_country),'')='' then raise exception 'Choose the target country for this audience'; end if;
 if p_reach_scope in ('state','city','area') and coalesce(trim(p_reach_state),'')='' then raise exception 'Choose the target state for this audience'; end if;
 if p_reach_scope in ('city','area') and coalesce(trim(p_reach_city),'')='' then raise exception 'Choose the target city for this audience'; end if;
 if p_reach_scope='area' and coalesce(trim(p_reach_area),'')='' then raise exception 'Choose the target area for this audience'; end if;
 insert into public.events(
  creator_id,title,description,venue,country,state,city,area,starts_at,ends_at,cover_url,is_published,
  category,duration_minutes,reach_scope,reach_country,reach_state,reach_city,reach_area,
  entry_fee_bc,entry_fee_amount,entry_fee_currency,venue_name,address_line,state_province,latitude,longitude
 ) values (
  v_uid,trim(p_title),left(coalesce(p_description,''),10000),
  coalesce(nullif(trim(p_location),''),nullif(trim(p_venue_name),'')),
  p_country,p_state_province,p_city,p_area,p_starts_at,p_ends_at,p_cover_url,true,
  coalesce(nullif(trim(p_category),''),'Other'),greatest(15,least(10080,coalesce(p_duration_minutes,120))),
  coalesce(p_reach_scope,'worldwide'),nullif(trim(coalesce(p_reach_country,'')),''),
  nullif(trim(coalesce(p_reach_state,'')),''),nullif(trim(coalesce(p_reach_city,'')),''),
  nullif(trim(coalesce(p_reach_area,'')),''),coalesce(p_entry_fee_bc,0),coalesce(p_entry_fee_amount,0),
  coalesce(nullif(trim(p_entry_fee_currency),''),'NGN'),nullif(trim(coalesce(p_venue_name,'')),''),
  nullif(trim(coalesce(p_address_line,'')),''),p_state_province,p_latitude,p_longitude
 ) returning id into v_event_id;
 return jsonb_build_object('id',v_event_id);
end;
$$;
revoke all on function public.create_event_secure(text,text,text,timestamptz,timestamptz,text,bigint,integer,text,text,text,text,text,numeric,text,text,text,text,text,text,text,double precision,double precision,text) from public,anon;
grant execute on function public.create_event_secure(text,text,text,timestamptz,timestamptz,text,bigint,integer,text,text,text,text,text,numeric,text,text,text,text,text,text,text,double precision,double precision,text) to authenticated;
