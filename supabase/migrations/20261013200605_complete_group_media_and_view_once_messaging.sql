
alter table public.messages add column if not exists mime_type text, add column if not exists duration_seconds integer;
drop function if exists public.send_group_message(uuid,text,text);
create function public.send_group_message(
 p_group_id uuid,p_body text,p_media_type text default null,p_media_path text default null,
 p_reply_to_id uuid default null,p_view_once boolean default false,p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_conversation uuid; v_message uuid; v_count integer; v_vip boolean; v_open timestamptz;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(coalesce(p_body,''))>4000 then raise exception 'Message is too long'; end if;
 if length(trim(coalesce(p_body,'')))=0 and coalesce(trim(p_media_path),'')='' then raise exception 'Write a message or attach media'; end if;
 if p_media_type is not null and p_media_type not in ('image','video','audio') then raise exception 'Unsupported group media type'; end if;
 if p_media_path is not null and (p_media_type is null or p_media_path not like v_uid::text||'/'||p_group_id::text||'/%') then raise exception 'Invalid group media path'; end if;
 if p_idempotency_key is not null then
  select id into v_message from public.messages where sender_id=v_uid and idempotency_key=p_idempotency_key limit 1;
  if v_message is not null then return v_message; end if;
 end if;
 if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=v_uid) then raise exception 'Join this group before messaging'; end if;
 select is_vip,activated_at into v_vip,v_open from public.chat_groups where id=p_group_id;
 select count(*)::integer into v_count from public.group_members where group_id=p_group_id;
 if not coalesce(v_vip,false) and (v_count<3 or v_open is null) then raise exception 'This group opens when it has three members'; end if;
 if exists(select 1 from public.group_settings where group_id=p_group_id and send_messages=false) then raise exception 'Group admins have paused messages'; end if;
 if p_reply_to_id is not null and not exists(select 1 from public.messages where id=p_reply_to_id and conversation_id=(select id from public.conversations where conversation_type='group' and context_id=p_group_id limit 1)) then
  raise exception 'Reply target is not in this group';
 end if;
 select id into v_conversation from public.conversations where conversation_type='group' and context_id=p_group_id limit 1;
 if v_conversation is null then raise exception 'Group conversation is unavailable'; end if;
 insert into public.messages(conversation_id,sender_id,body,media_type,media_path,view_once,reply_to_message_id,idempotency_key)
 values(v_conversation,v_uid,trim(coalesce(p_body,'')),p_media_type,p_media_path,coalesce(p_view_once,false),p_reply_to_id,p_idempotency_key)
 returning id into v_message;
 return v_message;
end;
$$;
grant execute on function public.send_group_message(uuid,text,text,text,uuid,boolean,text) to authenticated;

create or replace view public.group_messages with (security_invoker=true) as
 select m.id,c.context_id as group_id,m.body,m.created_at,m.sender_id,
        m.reply_to_message_id as reply_to_id,m.media_type,m.media_path,m.view_once,m.mime_type,m.duration_seconds
 from public.messages m join public.conversations c on c.id=m.conversation_id
 where c.conversation_type='group';
grant select on public.group_messages to authenticated;

create table if not exists public.group_media_views (
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 opened_at timestamptz not null default now(),
 primary key(message_id,user_id)
);
alter table public.group_media_views enable row level security;
drop policy if exists "Users can view their own media view claims" on public.group_media_views;
create policy "Users can view their own media view claims" on public.group_media_views for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.claim_group_media_view_once(p_message_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_group_id uuid; v_sender uuid; v_once boolean; v_rows integer;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 select c.context_id,m.sender_id,m.view_once into v_group_id,v_sender,v_once
 from public.messages m join public.conversations c on c.id=m.conversation_id
 where m.id=p_message_id and c.conversation_type='group';
 if not found then raise exception 'Group media message not found'; end if;
 if not exists(select 1 from public.group_members where group_id=v_group_id and user_id=v_uid) then raise exception 'Join this group to view its media'; end if;
 if not coalesce(v_once,false) then return true; end if;
 insert into public.group_media_views(message_id,user_id) values(p_message_id,v_uid) on conflict do nothing;
 get diagnostics v_rows=row_count;
 return v_rows=1;
end;
$$;
revoke all on function public.claim_group_media_view_once(uuid) from public,anon;
grant execute on function public.claim_group_media_view_once(uuid) to authenticated;

create or replace function public.delete_group_message(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_path text; v_group_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 select m.media_path,c.context_id into v_path,v_group_id
 from public.messages m join public.conversations c on c.id=m.conversation_id
 where m.id=p_message_id and m.sender_id=auth.uid() and c.conversation_type='group' for update;
 if not found then raise exception 'You can delete only your own group messages'; end if;
 delete from public.messages where id=p_message_id;
 return jsonb_build_object('success',true,'media_path',v_path,'group_id',v_group_id);
end;
$$;
revoke all on function public.delete_group_message(uuid) from public,anon;
grant execute on function public.delete_group_message(uuid) to authenticated;
