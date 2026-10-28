alter table public.global_action_slot
  add column if not exists catalog_key text not null default 'daily_activities',
  add column if not exists action_type text not null default 'navigate'
    check (action_type in ('navigate','popup','ad','giveaway')),
  add column if not exists destination text not null default 'DailyActivities',
  add column if not exists popup_title text not null default 'Daily Activities',
  add column if not exists popup_body text not null default 'Open today’s activity, follow the instructions, and enjoy the challenge.',
  add column if not exists target_url text;

update public.global_action_slot
set catalog_key = case when action_key = 'HotSeat' then 'hot_seat' else 'daily_activities' end,
    action_type = 'navigate',
    destination = action_key,
    popup_title = label,
    popup_body = description
where slot_key = 'primary';

create or replace function public.admin_configure_global_action_slot(
  p_enabled boolean,
  p_catalog_key text,
  p_action_key text,
  p_icon text,
  p_label text,
  p_description text,
  p_action_type text,
  p_destination text,
  p_popup_title text,
  p_popup_body text,
  p_target_url text default null
)
returns public.global_action_slot
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare updated_row public.global_action_slot;
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'
  ) then
    raise exception 'Administrator access is required';
  end if;
  if p_catalog_key not in ('hot_seat','daily_activities','games','sweepstake_room','giveaway','sponsor_ad','confessions','dating','events','groups','wcw_mcm','messages','wallet','vip') then
    raise exception 'Choose an activity from the library';
  end if;
  if p_action_key not in ('HotSeat','DailyActivities','Wallet','Events','Groups','Dating','Messages','VIP','Confessions') then
    raise exception 'Choose a supported app destination';
  end if;
  if p_action_type not in ('navigate','popup','ad','giveaway') then
    raise exception 'Choose a supported click action';
  end if;
  if length(trim(coalesce(p_icon,'')))=0 or length(trim(p_icon))>12 then
    raise exception 'Enter an icon (up to 12 characters)';
  end if;
  if length(trim(coalesce(p_label,'')))=0 or length(trim(p_label))>32 then
    raise exception 'Enter a label between 1 and 32 characters';
  end if;
  if length(coalesce(p_description,''))>180 then
    raise exception 'Description must be 180 characters or fewer';
  end if;
  if length(trim(coalesce(p_popup_title,'')))=0 or length(trim(p_popup_title))>80 then
    raise exception 'Enter a popup title up to 80 characters';
  end if;
  if length(trim(coalesce(p_popup_body,'')))=0 or length(trim(p_popup_body))>1500 then
    raise exception 'Enter popup directions up to 1500 characters';
  end if;
  if p_target_url is not null and length(trim(p_target_url))>0 and p_target_url !~ '^https?://' then
    raise exception 'Ad links must begin with http:// or https://';
  end if;
  update public.global_action_slot set
    enabled=p_enabled,
    catalog_key=p_catalog_key,
    action_key=p_action_key,
    icon=trim(p_icon),
    label=trim(p_label),
    description=trim(coalesce(p_description,'')),
    action_type=p_action_type,
    destination=p_action_key,
    popup_title=trim(p_popup_title),
    popup_body=trim(p_popup_body),
    target_url=nullif(trim(coalesce(p_target_url,'')),''),
    updated_at=now(),
    updated_by=auth.uid()
  where slot_key='primary'
  returning * into updated_row;
  if not found then raise exception 'Global activity slot is not initialized'; end if;
  return updated_row;
end;
$$;

revoke all on function public.admin_configure_global_action_slot(boolean,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.admin_configure_global_action_slot(boolean,text,text,text,text,text,text,text,text,text,text) to authenticated;
