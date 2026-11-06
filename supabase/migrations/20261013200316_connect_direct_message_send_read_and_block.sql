
alter table public.conversation_members add column if not exists last_read_at timestamptz;
create table if not exists public.user_blocks (
 blocker_id uuid not null references public.profiles(id) on delete cascade,
 blocked_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_id),
 check(blocker_id<>blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "Users can see blocks they created" on public.user_blocks;
create policy "Users can see blocks they created" on public.user_blocks for select to authenticated using ((select auth.uid())=blocker_id);

create or replace function public.send_dm_message(
 p_thread_id uuid,p_body text,p_media_path text default null,p_media_type text default null,p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_type text; v_message uuid; v_other uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(coalesce(p_body,''))>4000 then raise exception 'Message is too long'; end if;
 if length(trim(coalesce(p_body,'')))=0 and coalesce(trim(p_media_path),'')='' then raise exception 'Write a message or attach media'; end if;
 if p_media_type is not null and p_media_type not in ('image','video','audio','voice','file') then raise exception 'Unsupported message attachment type'; end if;
 if p_idempotency_key is not null then
  select id into v_message from public.messages where sender_id=v_uid and idempotency_key=p_idempotency_key limit 1;
  if v_message is not null then return v_message; end if;
 end if;
 select c.conversation_type into v_type from public.conversations c
 where c.id=p_thread_id and exists(select 1 from public.conversation_members cm where cm.conversation_id=c.id and cm.user_id=v_uid);
 if v_type is null then raise exception 'Conversation not found or access denied'; end if;
 if v_type not in ('direct','dating') then raise exception 'This conversation does not accept direct messages'; end if;
 select cm.user_id into v_other from public.conversation_members cm
 where cm.conversation_id=p_thread_id and cm.user_id<>v_uid limit 1;
 if v_other is null then raise exception 'Conversation recipient not found'; end if;
 if exists(select 1 from public.user_blocks b where (b.blocker_id=v_uid and b.blocked_id=v_other) or (b.blocker_id=v_other and b.blocked_id=v_uid)) then
  raise exception 'Messaging is unavailable for this conversation';
 end if;
 insert into public.messages(conversation_id,sender_id,body,media_path,media_type,idempotency_key)
 values(p_thread_id,v_uid,trim(coalesce(p_body,'')),p_media_path,p_media_type,p_idempotency_key)
 returning id into v_message;
 return v_message;
end;
$$;

create or replace function public.mark_direct_thread_read(p_thread_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 update public.conversation_members set last_read_at=now()
 where conversation_id=p_thread_id and user_id=auth.uid();
 if not found then raise exception 'Conversation not found or access denied'; end if;
 return true;
end;
$$;

create or replace function public.block_user_secure(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if p_user_id is null or p_user_id=auth.uid() then raise exception 'You cannot block yourself'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'User not found'; end if;
 insert into public.user_blocks(blocker_id,blocked_id) values(auth.uid(),p_user_id) on conflict do nothing;
 return true;
end;
$$;

revoke all on function public.send_dm_message(uuid,text,text,text,text) from public,anon;
grant execute on function public.send_dm_message(uuid,text,text,text,text) to authenticated;
revoke all on function public.mark_direct_thread_read(uuid) from public,anon;
grant execute on function public.mark_direct_thread_read(uuid) to authenticated;
revoke all on function public.block_user_secure(uuid) from public,anon;
grant execute on function public.block_user_secure(uuid) to authenticated;
