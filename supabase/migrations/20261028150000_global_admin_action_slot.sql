create table if not exists public.global_action_slot (
  id text primary key default 'main' check (id = 'main'),
  enabled boolean not null default true,
  catalog_key text not null default 'daily_activities',
  icon text not null default '🎯',
  label text not null default 'Daily Activities',
  description text not null default 'Play today’s activity, games and challenges.',
  action_type text not null default 'navigate' check (action_type in ('navigate','popup','ad','giveaway')),
  destination text not null default 'DailyActivities',
  popup_title text not null default 'Daily Activities',
  popup_body text not null default 'Choose an activity and follow the instructions to take part.',
  target_url text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.global_action_slot enable row level security;

drop policy if exists global_action_slot_read on public.global_action_slot;
create policy global_action_slot_read on public.global_action_slot
for select to authenticated
using (
  enabled = true or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  )
);

drop policy if exists global_action_slot_admin_insert on public.global_action_slot;
create policy global_action_slot_admin_insert on public.global_action_slot
for insert to authenticated
with check (
  exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
);

drop policy if exists global_action_slot_admin_update on public.global_action_slot;
create policy global_action_slot_admin_update on public.global_action_slot
for update to authenticated
using (
  exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
)
with check (
  exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
);

insert into public.global_action_slot
  (id, enabled, catalog_key, icon, label, description, action_type, destination, popup_title, popup_body)
values
  ('main', true, 'daily_activities', '🎯', 'Daily Activities',
   'Play today’s activity, games and challenges.', 'navigate', 'DailyActivities',
   'Daily Activities', 'Open today’s activity, follow the instructions, and enjoy the challenge.')
on conflict (id) do nothing;

grant select, insert, update on public.global_action_slot to authenticated;
