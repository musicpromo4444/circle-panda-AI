-- MCM/WCW comments and WhatsApp-Status-style reactions.
create table if not exists public.crush_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.crush_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 800),
  created_at timestamptz not null default now()
);
create index if not exists crush_comments_post_created_idx on public.crush_comments(post_id,created_at);
create table if not exists public.crush_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.crush_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('❤️','😂','😮','😡','🐼')),
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);
create index if not exists crush_reactions_post_idx on public.crush_reactions(post_id);
alter table public.crush_comments enable row level security;
alter table public.crush_reactions enable row level security;

drop policy if exists "Authenticated users view crush comments" on public.crush_comments;
create policy "Authenticated users view crush comments" on public.crush_comments for select to authenticated using (true);
drop policy if exists "Comment on another user's crush card" on public.crush_comments;
create policy "Comment on another user's crush card" on public.crush_comments for insert to authenticated with check (
  auth.uid()=user_id and exists(select 1 from public.crush_posts p where p.id=post_id and p.user_id<>auth.uid())
);
drop policy if exists "Delete own crush comments" on public.crush_comments;
create policy "Delete own crush comments" on public.crush_comments for delete to authenticated using (auth.uid()=user_id);

drop policy if exists "Authenticated users view crush reactions" on public.crush_reactions;
create policy "Authenticated users view crush reactions" on public.crush_reactions for select to authenticated using (true);
drop policy if exists "React to another user's crush card" on public.crush_reactions;
create policy "React to another user's crush card" on public.crush_reactions for insert to authenticated with check (
  auth.uid()=user_id and exists(select 1 from public.crush_posts p where p.id=post_id and p.user_id<>auth.uid())
);
drop policy if exists "Change own crush reaction" on public.crush_reactions;
create policy "Change own crush reaction" on public.crush_reactions for update to authenticated using (auth.uid()=user_id) with check (
  auth.uid()=user_id and exists(select 1 from public.crush_posts p where p.id=post_id and p.user_id<>auth.uid())
);
drop policy if exists "Remove own crush reaction" on public.crush_reactions;
create policy "Remove own crush reaction" on public.crush_reactions for delete to authenticated using (auth.uid()=user_id);
