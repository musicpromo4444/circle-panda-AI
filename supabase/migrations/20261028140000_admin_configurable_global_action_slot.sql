-- Admin-configurable app-wide floating activity shortcut.
create table if not exists public.global_action_slot (
  slot_key text primary key default 'primary',
  enabled boolean not null default true,
  action_key text not null default 'HotSeat',
  icon text not null default '🔥',
  label text not null default 'HOT SEAT',
  description text not null default 'Questions, gifts and the next seat',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint global_action_slot_singleton check (slot_key = 'primary'),
  constraint global_action_slot_action_key_check check (action_key in ('HotSeat','Wallet','Events','Groups','Dating','Messages','VIP','Confessions'))
);

alter table public.global_action_slot enable row level security;
revoke all on public.global_action_slot from anon, authenticated;
grant select on public.global_action_slot to authenticated;

drop policy if exists "Signed-in users can read global action slot" on public.global_action_slot;
create policy "Signed-in users can read global action slot"
  on public.global_action_slot for select to authenticated using (true);

do $
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='global_action_slot') then
    alter publication supabase_realtime add table public.global_action_slot;
  end if;
end $;

insert into public.global_action_slot (slot_key,enabled,action_key,icon,label,description)
values ('primary',true,'HotSeat','🔥','HOT SEAT','Questions, gifts and the next seat')
on conflict (slot_key) do nothing;

create or replace function public.admin_update_global_action_slot(
  p_enabled boolean,
  p_action_key text,
  p_icon text,
  p_label text,
  p_description text
) returns public.global_action_slot
language plpgsql
security definer
set search_path = ''
as $$
declare updated_row public.global_action_slot;
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'
  ) then
    raise exception 'Administrator access is required';
  end if;
  if p_action_key not in ('HotSeat','Wallet','Events','Groups','Dating','Messages','VIP','Confessions') then
    raise exception 'Choose a supported app destination';
  end if;
  if length(trim(coalesce(p_icon,''))) = 0 or length(trim(p_icon)) > 12 then
    raise exception 'Enter an icon (up to 12 characters)';
  end if;
  if length(trim(coalesce(p_label,''))) = 0 or length(trim(p_label)) > 32 then
    raise exception 'Enter a label between 1 and 32 characters';
  end if;
  if length(coalesce(p_description,'')) > 180 then
    raise exception 'Description must be 180 characters or fewer';
  end if;
  update public.global_action_slot
    set enabled=p_enabled, action_key=p_action_key, icon=trim(p_icon),
        label=trim(p_label), description=trim(coalesce(p_description,'')),
        updated_at=now(), updated_by=auth.uid()
    where slot_key='primary'
    returning * into updated_row;
  if not found then raise exception 'Global activity slot is not initialized'; end if;
  return updated_row;
end;
$$;

revoke all on function public.admin_update_global_action_slot(boolean,text,text,text,text) from public, anon;
grant execute on function public.admin_update_global_action_slot(boolean,text,text,text,text) to authenticated;
