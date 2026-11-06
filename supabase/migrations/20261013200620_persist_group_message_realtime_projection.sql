
drop view if exists public.group_messages;
create table public.group_messages (
 id uuid primary key references public.messages(id) on delete cascade,
 group_id uuid not null references public.chat_groups(id) on delete cascade,
 body text not null default '',
 created_at timestamptz not null default now(),
 sender_id uuid not null references public.profiles(id) on delete cascade,
 reply_to_id uuid,
 media_type text,
 media_path text,
 view_once boolean not null default false,
 mime_type text,
 duration_seconds integer
);
create index if not exists group_messages_group_created_idx on public.group_messages(group_id,created_at);
alter table public.group_messages enable row level security;
create policy "Group members can read group messages" on public.group_messages for select to authenticated using (
 exists(select 1 from public.group_members gm where gm.group_id=group_messages.group_id and gm.user_id=(select auth.uid()))
);

create or replace function public.sync_group_message_projection()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_group_id uuid;
begin
 select c.context_id into v_group_id from public.conversations c where c.id=new.conversation_id and c.conversation_type='group';
 if v_group_id is not null then
  insert into public.group_messages(id,group_id,body,created_at,sender_id,reply_to_id,media_type,media_path,view_once,mime_type,duration_seconds)
  values(new.id,v_group_id,coalesce(new.body,''),new.created_at,new.sender_id,new.reply_to_message_id,new.media_type,new.media_path,coalesce(new.view_once,false),new.mime_type,new.duration_seconds)
  on conflict(id) do update set body=excluded.body,reply_to_id=excluded.reply_to_id,media_type=excluded.media_type,media_path=excluded.media_path,view_once=excluded.view_once,mime_type=excluded.mime_type,duration_seconds=excluded.duration_seconds;
 end if;
 return new;
end;
$$;
drop trigger if exists sync_group_message_projection_trigger on public.messages;
create trigger sync_group_message_projection_trigger after insert or update on public.messages
for each row execute function public.sync_group_message_projection();

insert into public.group_messages(id,group_id,body,created_at,sender_id,reply_to_id,media_type,media_path,view_once,mime_type,duration_seconds)
select m.id,c.context_id,coalesce(m.body,''),m.created_at,m.sender_id,m.reply_to_message_id,m.media_type,m.media_path,coalesce(m.view_once,false),m.mime_type,m.duration_seconds
from public.messages m join public.conversations c on c.id=m.conversation_id
where c.conversation_type='group'
on conflict(id) do nothing;

grant select on public.group_messages to authenticated;
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='group_messages') then
  alter publication supabase_realtime add table public.group_messages;
 end if;
end $$;
