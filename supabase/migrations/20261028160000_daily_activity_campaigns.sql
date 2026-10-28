alter table public.global_action_slot drop constraint if exists global_action_slot_action_key_check;
alter table public.global_action_slot add constraint global_action_slot_action_key_check check (action_key = any (array['HotSeat','DailyActivities','Wallet','Events','Groups','Dating','Messages','VIP','Confessions']));
create or replace function public.admin_update_global_action_slot(p_enabled boolean,p_action_key text,p_icon text,p_label text,p_description text)
returns public.global_action_slot language plpgsql security definer set search_path=''
as $$
declare r public.global_action_slot;
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then raise exception 'Administrator access is required'; end if;
 if p_action_key not in ('HotSeat','DailyActivities','Wallet','Events','Groups','Dating','Messages','VIP','Confessions') then raise exception 'Choose a supported app destination'; end if;
 update public.global_action_slot set enabled=p_enabled,action_key=p_action_key,icon=trim(p_icon),label=trim(p_label),description=trim(coalesce(p_description,'')),updated_at=now(),updated_by=auth.uid() where slot_key='primary' returning * into r;
 if not found then raise exception 'Global activity slot is not initialized'; end if; return r;
end $$;
grant execute on function public.admin_update_global_action_slot(boolean,text,text,text,text) to authenticated;

create table if not exists public.daily_activity_campaigns(
 id uuid primary key default gen_random_uuid(), campaign_type text not null check(campaign_type in ('sweepstake','challenge','gift','giveaway','icon')),
 title text not null check(length(trim(title)) between 1 and 120), description text not null default '', icon text not null default '🎁',
 prize_type text not null default 'gift' check(prize_type in ('BC','WC','gift','icon','badge')), prize_amount bigint not null default 0 check(prize_amount>=0),
 prize_label text not null default '', starts_at timestamptz not null default now(), ends_at timestamptz,
 max_entries integer check(max_entries is null or max_entries>0), status text not null default 'open' check(status in ('draft','open','closed','drawn')),
 winner_id uuid references auth.users(id), drawn_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at)
);
create table if not exists public.daily_activity_campaign_entries(
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.daily_activity_campaigns(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), unique(campaign_id,user_id)
);
alter table public.daily_activity_campaigns enable row level security;
alter table public.daily_activity_campaign_entries enable row level security;
drop policy if exists "Users can view open activity campaigns" on public.daily_activity_campaigns;
create policy "Users can view open activity campaigns" on public.daily_activity_campaigns for select to authenticated
using ((status='open' and starts_at<=now() and (ends_at is null or ends_at>now())) or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin'));
drop policy if exists "Users can view own activity campaign entries" on public.daily_activity_campaign_entries;
create policy "Users can view own activity campaign entries" on public.daily_activity_campaign_entries for select to authenticated
using(user_id=auth.uid() or exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin'));
revoke all on public.daily_activity_campaigns,public.daily_activity_campaign_entries from anon,authenticated;
grant select on public.daily_activity_campaigns,public.daily_activity_campaign_entries to authenticated;

create or replace function public.join_daily_activity_campaign(p_campaign_id uuid) returns jsonb language plpgsql security definer set search_path=''
as $$
declare c public.daily_activity_campaigns; n integer;
begin
 if auth.uid() is null then raise exception 'Sign in to enter'; end if;
 select * into c from public.daily_activity_campaigns where id=p_campaign_id for update;
 if not found or c.status<>'open' or c.starts_at>now() or (c.ends_at is not null and c.ends_at<=now()) then raise exception 'This activity is closed'; end if;
 if c.max_entries is not null then select count(*) into n from public.daily_activity_campaign_entries where campaign_id=c.id;
 if n>=c.max_entries and not exists(select 1 from public.daily_activity_campaign_entries where campaign_id=c.id and user_id=auth.uid()) then raise exception 'This activity is full'; end if; end if;
 insert into public.daily_activity_campaign_entries(campaign_id,user_id) values(c.id,auth.uid()) on conflict(campaign_id,user_id) do nothing;
 return jsonb_build_object('joined',true,'campaign_id',c.id);
end $$;
revoke all on function public.join_daily_activity_campaign(uuid) from public,anon;
grant execute on function public.join_daily_activity_campaign(uuid) to authenticated;

create or replace function public.admin_create_daily_activity_campaign(p_campaign_type text,p_title text,p_description text,p_icon text,p_prize_type text,p_prize_amount bigint,p_prize_label text,p_starts_at timestamptz,p_ends_at timestamptz,p_max_entries integer,p_status text)
returns public.daily_activity_campaigns language plpgsql security definer set search_path=''
as $$
declare c public.daily_activity_campaigns;
begin
 if auth.uid() is null or not exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin') then raise exception 'Administrator access is required'; end if;
 if p_campaign_type not in ('sweepstake','challenge','gift','giveaway','icon') or p_prize_type not in ('BC','WC','gift','icon','badge') then raise exception 'Choose a valid activity type and reward'; end if;
 insert into public.daily_activity_campaigns(campaign_type,title,description,icon,prize_type,prize_amount,prize_label,starts_at,ends_at,max_entries,status,created_by)
 values(p_campaign_type,trim(p_title),coalesce(p_description,''),coalesce(nullif(trim(p_icon),''),'🎁'),p_prize_type,greatest(0,coalesce(p_prize_amount,0)),coalesce(p_prize_label,''),coalesce(p_starts_at,now()),p_ends_at,p_max_entries,coalesce(p_status,'open'),auth.uid()) returning * into c;
 return c;
end $$;
revoke all on function public.admin_create_daily_activity_campaign(text,text,text,text,text,bigint,text,timestamptz,timestamptz,integer,text) from public,anon;
grant execute on function public.admin_create_daily_activity_campaign(text,text,text,text,text,bigint,timestamptz,timestamptz,integer,text) to authenticated;
