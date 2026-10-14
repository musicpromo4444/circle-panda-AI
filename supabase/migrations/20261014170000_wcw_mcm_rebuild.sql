-- Circle Panda rebuilt: weekly WCW/MCM submission and voting
create table if not exists public.crush_cycles (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('wcw','mcm')),
  cycle_week_start date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  unique(kind, cycle_week_start),
  check (ends_at > starts_at)
);
create table if not exists public.crush_nominees (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.crush_cycles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  photo_url text not null,
  caption text not null default '',
  created_at timestamptz not null default now(),
  unique(cycle_id,user_id)
);
create table if not exists public.crush_votes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.crush_cycles(id) on delete cascade,
  nominee_id uuid not null references public.crush_nominees(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(nominee_id,voter_id)
);
create table if not exists public.crush_vote_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cycle_id uuid not null references public.crush_cycles(id) on delete cascade,
  free_votes_used integer not null default 0 check (free_votes_used >= 0),
  ad_vote_credits integer not null default 0 check (ad_vote_credits >= 0),
  updated_at timestamptz not null default now(),
  primary key(user_id,cycle_id)
);
create index if not exists crush_nominees_cycle_idx on public.crush_nominees(cycle_id,created_at desc);
create index if not exists crush_votes_cycle_idx on public.crush_votes(cycle_id,nominee_id);

alter table public.crush_cycles enable row level security;
alter table public.crush_nominees enable row level security;
alter table public.crush_votes enable row level security;
alter table public.crush_vote_usage enable row level security;

drop policy if exists "authenticated users read crush cycles" on public.crush_cycles;
create policy "authenticated users read crush cycles" on public.crush_cycles for select to authenticated using (true);
drop policy if exists "authenticated users read crush nominees" on public.crush_nominees;
create policy "authenticated users read crush nominees" on public.crush_nominees for select to authenticated using (true);
drop policy if exists "users submit own crush photo" on public.crush_nominees;
create policy "users submit own crush photo" on public.crush_nominees for insert to authenticated
with check (auth.uid() = user_id and exists (select 1 from public.crush_cycles c where c.id = cycle_id and c.status = 'open'));
drop policy if exists "users remove own crush submission" on public.crush_nominees;
create policy "users remove own crush submission" on public.crush_nominees for delete to authenticated using (auth.uid() = user_id);
drop policy if exists "users see own crush vote usage" on public.crush_vote_usage;
create policy "users see own crush vote usage" on public.crush_vote_usage for select to authenticated using (auth.uid() = user_id);

create or replace view public.crush_vote_counts as
select nominee_id, count(*)::bigint as vote_count
from public.crush_votes group by nominee_id;
grant select on public.crush_vote_counts to authenticated;

create or replace function public.get_or_create_crush_cycle(p_kind text)
returns public.crush_cycles
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text := lower(p_kind);
  v_week date := date_trunc('week', now())::date;
  v_cycle public.crush_cycles;
  v_start timestamptz;
begin
  if v_kind not in ('wcw','mcm') then raise exception 'Unknown crush category'; end if;
  v_start := v_week::timestamptz + interval '10 hours';
  insert into public.crush_cycles(kind,cycle_week_start,starts_at,ends_at,status)
  values(v_kind,v_week,v_start,v_start + interval '7 days','open')
  on conflict(kind,cycle_week_start) do nothing;
  select * into v_cycle from public.crush_cycles
    where kind = v_kind and cycle_week_start = v_week;
  return v_cycle;
end;
$$;
revoke all on function public.get_or_create_crush_cycle(text) from public;
grant execute on function public.get_or_create_crush_cycle(text) to authenticated;

create or replace function public.cast_crush_vote(p_nominee_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_nominee public.crush_nominees;
  v_used integer := 0;
  v_credits integer := 0;
  v_balance bigint := 0;
  v_free boolean := false;
begin
  if v_user is null then raise exception 'Sign in to vote'; end if;
  select n.* into v_nominee from public.crush_nominees n
    join public.crush_cycles c on c.id = n.cycle_id
    where n.id = p_nominee_id and c.status = 'open' and now() < c.ends_at;
  if not found then raise exception 'This crush round is closed'; end if;
  if v_nominee.user_id = v_user then raise exception 'You cannot vote for your own photo'; end if;
  if exists(select 1 from public.crush_votes v where v.nominee_id = p_nominee_id and v.voter_id = v_user) then
    return jsonb_build_object('already_voted',true);
  end if;
  insert into public.crush_vote_usage(user_id,cycle_id) values(v_user,v_nominee.cycle_id)
    on conflict(user_id,cycle_id) do nothing;
  select free_votes_used,ad_vote_credits into v_used,v_credits
    from public.crush_vote_usage where user_id = v_user and cycle_id = v_nominee.cycle_id for update;
  if v_used < 3 then
    update public.crush_vote_usage set free_votes_used = free_votes_used + 1, updated_at = now()
      where user_id = v_user and cycle_id = v_nominee.cycle_id;
    v_free := true;
  elsif v_credits > 0 then
    update public.crush_vote_usage set ad_vote_credits = ad_vote_credits - 1, updated_at = now()
      where user_id = v_user and cycle_id = v_nominee.cycle_id;
  else
    insert into public.wallet_accounts(user_id,bc_balance,wc_balance) values(v_user,0,0)
      on conflict(user_id) do nothing;
    select bc_balance into v_balance from public.wallet_accounts where user_id = v_user for update;
    if v_balance < 50 then raise exception 'You need 50 BC for an extra vote, or claim more votes after a rewarded ad'; end if;
    update public.wallet_accounts set bc_balance = bc_balance - 50, updated_at = now() where user_id = v_user;
    insert into public.wallet_transactions(user_id,currency,amount,reason,reference_id)
      values(v_user,'BC',-50,'wcw_mcm_extra_vote',p_nominee_id);
  end if;
  insert into public.crush_votes(cycle_id,nominee_id,voter_id) values(v_nominee.cycle_id,p_nominee_id,v_user);
  return jsonb_build_object('already_voted',false,'free_vote',v_free);
end;
$$;
revoke all on function public.cast_crush_vote(uuid) from public;
grant execute on function public.cast_crush_vote(uuid) to authenticated;

-- A rewarded-ad credit must be granted by a verified server-side ad session.
-- Do not grant ad_vote_credits directly from the client.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('circle-panda-crush','circle-panda-crush',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public = true, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "crush photos are public" on storage.objects;
create policy "crush photos are public" on storage.objects for select to public using (bucket_id = 'circle-panda-crush');
drop policy if exists "users upload their own crush photos" on storage.objects;
create policy "users upload their own crush photos" on storage.objects for insert to authenticated
with check (bucket_id = 'circle-panda-crush' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users update their own crush photos" on storage.objects;
create policy "users update their own crush photos" on storage.objects for update to authenticated
using (bucket_id = 'circle-panda-crush' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'circle-panda-crush' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users delete their own crush photos" on storage.objects;
create policy "users delete their own crush photos" on storage.objects for delete to authenticated
using (bucket_id = 'circle-panda-crush' and (storage.foldername(name))[1] = auth.uid()::text);
