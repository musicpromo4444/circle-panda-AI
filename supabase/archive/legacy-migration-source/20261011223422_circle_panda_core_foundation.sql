-- Circle Panda Rebuilt: foundation schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  country text,
  state text,
  area text,
  date_of_birth date,
  gender text,
  bio text,
  is_vip boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  post_type text not null default 'confession' check (post_type in ('confession','secret','status')),
  body text not null check (char_length(body) between 1 and 5000),
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('heart','laugh','surprised','angry','panda')),
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

create table if not exists public.dating_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  headline text,
  about text,
  personality text,
  sexual_experience text,
  looking_for text,
  photos text[] not null default '{}',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  venue text,
  country text,
  state text,
  starts_at timestamptz not null,
  cover_url text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_attendees (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'attending' check (status in ('attending','interested','cancelled')),
  created_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  country_restriction text,
  is_vip boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('creator','admin','member')),
  joined_at timestamptz not null default now(),
  primary key(group_id,user_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'direct' check (conversation_type in ('direct','group','dating','event','feed')),
  context_id uuid,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key(conversation_id,user_id)
);

create table if not exists public.message_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null check (source_type in ('dating','event','group','feed','profile','wcw','mcm')),
  source_id uuid,
  greeting text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.wallet_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  bc_balance bigint not null default 0 check (bc_balance >= 0),
  wc_balance bigint not null default 0 check (wc_balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  currency text not null default 'BC' check (currency in ('BC','WC')),
  amount bigint not null check (amount <> 0),
  reason text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.user_xp (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp_total bigint not null default 0 check (xp_total >= 0),
  level_name text not null default 'Novice',
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null,
  title text not null,
  body text not null default '',
  target_type text,
  target_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists feed_posts_created_at_idx on public.feed_posts(created_at desc);
create index if not exists feed_posts_author_idx on public.feed_posts(author_id);
create index if not exists post_comments_post_idx on public.post_comments(post_id, created_at);
create index if not exists events_starts_at_idx on public.events(starts_at);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);
create index if not exists message_requests_recipient_idx on public.message_requests(recipient_id, status, created_at desc);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    nullif(new.raw_user_meta_data ->> 'username','')
  )
  on conflict (id) do nothing;
  insert into public.wallet_accounts(user_id, bc_balance) values (new.id, 0) on conflict (user_id) do nothing;
  insert into public.user_xp(user_id, xp_total, level_name) values (new.id, 0, 'Novice') on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_circle_panda on auth.users;
create trigger on_auth_user_created_circle_panda
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.feed_posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.dating_profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.chat_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.message_requests enable row level security;
alter table public.messages enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.user_xp enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles are viewable by signed-in users" on public.profiles;
create policy "profiles are viewable by signed-in users" on public.profiles for select to authenticated using (true);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "published feed readable by signed-in users" on public.feed_posts;
create policy "published feed readable by signed-in users" on public.feed_posts for select to authenticated using (true);
drop policy if exists "users create own posts" on public.feed_posts;
create policy "users create own posts" on public.feed_posts for insert to authenticated with check (auth.uid() = author_id);
drop policy if exists "users edit own posts" on public.feed_posts;
create policy "users edit own posts" on public.feed_posts for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists "users delete own posts" on public.feed_posts;
create policy "users delete own posts" on public.feed_posts for delete to authenticated using (auth.uid() = author_id);

drop policy if exists "comments readable by signed-in users" on public.post_comments;
create policy "comments readable by signed-in users" on public.post_comments for select to authenticated using (true);
drop policy if exists "users create own comments" on public.post_comments;
create policy "users create own comments" on public.post_comments for insert to authenticated with check (auth.uid() = author_id);
drop policy if exists "users delete own comments" on public.post_comments;
create policy "users delete own comments" on public.post_comments for delete to authenticated using (auth.uid() = author_id);

drop policy if exists "reactions readable by signed-in users" on public.post_reactions;
create policy "reactions readable by signed-in users" on public.post_reactions for select to authenticated using (true);
drop policy if exists "users manage own reactions" on public.post_reactions;
create policy "users manage own reactions" on public.post_reactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "published dating profiles readable" on public.dating_profiles;
create policy "published dating profiles readable" on public.dating_profiles for select to authenticated using (is_published or auth.uid() = user_id);
drop policy if exists "users manage own dating profile" on public.dating_profiles;
create policy "users manage own dating profile" on public.dating_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "published events readable" on public.events;
create policy "published events readable" on public.events for select to authenticated using (is_published or auth.uid() = creator_id);
drop policy if exists "creators manage events" on public.events;
create policy "creators manage events" on public.events for all to authenticated using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

drop policy if exists "attendees readable to signed-in users" on public.event_attendees;
create policy "attendees readable to signed-in users" on public.event_attendees for select to authenticated using (true);
drop policy if exists "users manage own attendance" on public.event_attendees;
create policy "users manage own attendance" on public.event_attendees for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "groups readable by signed-in users" on public.chat_groups;
create policy "groups readable by signed-in users" on public.chat_groups for select to authenticated using (true);
drop policy if exists "creators manage groups" on public.chat_groups;
create policy "creators manage groups" on public.chat_groups for all to authenticated using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

drop policy if exists "members can see group membership" on public.group_members;
create policy "members can see group membership" on public.group_members for select to authenticated using (true);
drop policy if exists "users can join groups as themselves" on public.group_members;
create policy "users can join groups as themselves" on public.group_members for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users can leave groups themselves" on public.group_members;
create policy "users can leave groups themselves" on public.group_members for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "members can view conversations" on public.conversations;
create policy "members can view conversations" on public.conversations for select to authenticated using (exists (select 1 from public.conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()));
drop policy if exists "signed-in users create conversations" on public.conversations;
create policy "signed-in users create conversations" on public.conversations for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "members can view conversation members" on public.conversation_members;
create policy "members can view conversation members" on public.conversation_members for select to authenticated using (exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()));
drop policy if exists "users can add themselves to conversation" on public.conversation_members;
create policy "users can add themselves to conversation" on public.conversation_members for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "members can read messages" on public.messages;
create policy "members can read messages" on public.messages for select to authenticated using (exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()));
drop policy if exists "conversation members can send messages as themselves" on public.messages;
create policy "conversation members can send messages as themselves" on public.messages for insert to authenticated with check (auth.uid() = sender_id and exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()));

drop policy if exists "users can see requests they sent or received" on public.message_requests;
create policy "users can see requests they sent or received" on public.message_requests for select to authenticated using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists "users can send requests as themselves" on public.message_requests;
create policy "users can send requests as themselves" on public.message_requests for insert to authenticated with check (auth.uid() = sender_id and sender_id <> recipient_id);
drop policy if exists "recipients can respond to requests" on public.message_requests;
create policy "recipients can respond to requests" on public.message_requests for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

drop policy if exists "users can view own wallet" on public.wallet_accounts;
create policy "users can view own wallet" on public.wallet_accounts for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users can view own wallet transactions" on public.wallet_transactions;
create policy "users can view own wallet transactions" on public.wallet_transactions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users can view own xp" on public.user_xp;
create policy "users can view own xp" on public.user_xp for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users can view own notifications" on public.notifications;
create policy "users can view own notifications" on public.notifications for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users can mark own notifications read" on public.notifications;
create policy "users can mark own notifications read" on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
