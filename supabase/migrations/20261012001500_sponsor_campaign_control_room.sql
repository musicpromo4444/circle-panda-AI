-- Sponsor campaign management and auditable first-party native placement metrics.
create table if not exists public.sponsor_campaigns (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null check (char_length(trim(sponsor_name)) between 1 and 160),
  campaign_name text not null check (char_length(trim(campaign_name)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  format text not null default 'native' check (format in ('direct_sponsor','native','sponsor_reveal','banner','interstitial','playable','rewarded')),
  target_url text,
  countries text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','active','paused','completed')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  budget_naira numeric(14,2) not null default 0 check (budget_naira >= 0),
  cpm_naira numeric(12,2) not null default 0 check (cpm_naira >= 0),
  target_impressions bigint not null default 0 check (target_impressions >= 0),
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.sponsor_campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sponsor_campaigns(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('impression','click')),
  placement text not null default 'home_native_card' check (char_length(placement) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists sponsor_campaigns_status_dates_idx
  on public.sponsor_campaigns(status, starts_at, ends_at);
create index if not exists sponsor_campaign_events_campaign_created_idx
  on public.sponsor_campaign_events(campaign_id, created_at desc);
create unique index if not exists sponsor_campaign_user_daily_impression_idx
  on public.sponsor_campaign_events(campaign_id, user_id, ((created_at at time zone 'UTC')::date), placement)
  where event_type = 'impression' and user_id is not null;

alter table public.sponsor_campaigns enable row level security;
alter table public.sponsor_campaign_events enable row level security;

drop policy if exists "active sponsor campaigns are visible to signed-in users" on public.sponsor_campaigns;
create policy "active sponsor campaigns are visible to signed-in users"
  on public.sponsor_campaigns for select to authenticated
  using (status = 'active' and starts_at <= now() and ends_at > now());

drop policy if exists "admins manage sponsor campaigns" on public.sponsor_campaigns;
create policy "admins manage sponsor campaigns"
  on public.sponsor_campaigns for all to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'))
  with check (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'));

drop policy if exists "admins read sponsor campaign events" on public.sponsor_campaign_events;
create policy "admins read sponsor campaign events"
  on public.sponsor_campaign_events for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'));

revoke insert, update, delete on public.sponsor_campaign_events from anon, authenticated;

create or replace function public.track_sponsor_event(
  p_campaign_id uuid,
  p_event_type text,
  p_placement text default 'home_native_card'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign public.sponsor_campaigns%rowtype;
begin
  if v_user_id is null then raise exception 'Sign in is required'; end if;
  if p_event_type not in ('impression','click') then raise exception 'Unsupported sponsor event'; end if;
  if p_placement is null or char_length(p_placement) < 1 or char_length(p_placement) > 80 then
    raise exception 'Invalid placement';
  end if;

  select * into v_campaign
  from public.sponsor_campaigns c
  where c.id = p_campaign_id and c.status = 'active'
    and c.starts_at <= now() and c.ends_at > now()
  for update;
  if not found then return false; end if;

  if p_event_type = 'impression' and exists (
    select 1 from public.sponsor_campaign_events e
    where e.campaign_id = p_campaign_id and e.user_id = v_user_id
      and e.event_type = 'impression' and e.placement = p_placement
      and e.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  ) then return false; end if;

  insert into public.sponsor_campaign_events(campaign_id,user_id,event_type,placement)
  values (p_campaign_id,v_user_id,p_event_type,p_placement);

  if p_event_type = 'impression' then
    update public.sponsor_campaigns set impressions = impressions + 1, updated_at = now() where id = p_campaign_id;
  else
    update public.sponsor_campaigns set clicks = clicks + 1, updated_at = now() where id = p_campaign_id;
  end if;
  return true;
end;
$$;

revoke all on function public.track_sponsor_event(uuid,text,text) from public;
grant execute on function public.track_sponsor_event(uuid,text,text) to authenticated;
