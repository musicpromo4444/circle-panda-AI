-- MCM/WCW crush feed: posts, one-person/one-post votes, and public crush-card photos.
create table if not exists public.crush_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  crush_type text not null check (crush_type in ('mcm','wcw')),
  caption text not null default '' check (char_length(caption) <= 1200),
  image_path text,
  week_start date not null default date_trunc('week', now() at time zone 'UTC')::date,
  created_at timestamptz not null default now()
);
create index if not exists crush_posts_week_type_idx on public.crush_posts(week_start desc, crush_type, created_at desc);
create index if not exists crush_posts_user_idx on public.crush_posts(user_id, created_at desc);

create table if not exists public.crush_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.crush_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);
create index if not exists crush_votes_user_created_idx on public.crush_votes(user_id,created_at desc);
alter table public.crush_posts enable row level security;
alter table public.crush_votes enable row level security;

drop policy if exists "Authenticated users can view crush posts" on public.crush_posts;
create policy "Authenticated users can view crush posts" on public.crush_posts for select to authenticated using (true);
drop policy if exists "Users create own crush posts" on public.crush_posts;
create policy "Users create own crush posts" on public.crush_posts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users update own crush posts" on public.crush_posts;
create policy "Users update own crush posts" on public.crush_posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users delete own crush posts" on public.crush_posts;
create policy "Users delete own crush posts" on public.crush_posts for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Authenticated users view crush votes" on public.crush_votes;
create policy "Authenticated users view crush votes" on public.crush_votes for select to authenticated using (true);
drop policy if exists "Users vote for others only" on public.crush_votes;
create policy "Users vote for others only" on public.crush_votes for insert to authenticated
with check (auth.uid() = user_id and exists(select 1 from public.crush_posts p where p.id = post_id and p.user_id <> auth.uid() and p.week_start = date_trunc('week', now() at time zone 'UTC')::date));
drop policy if exists "Users remove own crush vote" on public.crush_votes;
create policy "Users remove own crush vote" on public.crush_votes for delete to authenticated using (auth.uid() = user_id);
revoke update on public.crush_votes from authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('crush-post-photos','crush-post-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Users upload crush photos to own folder" on storage.objects;
create policy "Users upload crush photos to own folder" on storage.objects for insert to authenticated
with check (bucket_id='crush-post-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Users update crush photos in own folder" on storage.objects;
create policy "Users update crush photos in own folder" on storage.objects for update to authenticated
using (bucket_id='crush-post-photos' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='crush-post-photos' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "Users delete crush photos in own folder" on storage.objects;
create policy "Users delete crush photos in own folder" on storage.objects for delete to authenticated
using (bucket_id='crush-post-photos' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.cast_crush_vote(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_post public.crush_posts%rowtype; v_votes integer; v_count integer;
begin
  if v_user is null then raise exception 'Sign in to vote'; end if;
  select * into v_post from public.crush_posts where id=p_post_id;
  if not found then raise exception 'Crush post not found'; end if;
  if v_post.user_id=v_user then raise exception 'You cannot vote for your own crush post'; end if;
  if v_post.week_start <> date_trunc('week', now() at time zone 'UTC')::date then raise exception 'Voting for this week has closed'; end if;
  if exists(select 1 from public.crush_votes where post_id=p_post_id and user_id=v_user) then
    delete from public.crush_votes where post_id=p_post_id and user_id=v_user;
    return jsonb_build_object('voted',false,'free_votes_used',(select count(*) from public.crush_votes cv join public.crush_posts cp on cp.id=cv.post_id where cv.user_id=v_user and cv.created_at >= date_trunc('week', now() at time zone 'UTC') and cv.created_at < date_trunc('week', now() at time zone 'UTC') + interval '7 days'));
  end if;
  select count(*) into v_votes from public.crush_votes cv where cv.user_id=v_user and cv.created_at >= date_trunc('week', now() at time zone 'UTC') and cv.created_at < date_trunc('week', now() at time zone 'UTC') + interval '7 days';
  if v_votes >= 3 then raise exception 'Your 3 free weekly crush votes are used. Extra BC/ad voting is not available yet.'; end if;
  insert into public.crush_votes(post_id,user_id) values(p_post_id,v_user);
  select count(*) into v_count from public.crush_votes where post_id=p_post_id;
  return jsonb_build_object('voted',true,'free_votes_used',v_votes+1,'post_votes',v_count);
end;
$$;
revoke all on function public.cast_crush_vote(uuid) from public, anon;
grant execute on function public.cast_crush_vote(uuid) to authenticated;
