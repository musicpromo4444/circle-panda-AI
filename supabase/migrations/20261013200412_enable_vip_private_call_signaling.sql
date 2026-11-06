
alter table public.profiles add column if not exists vip_expires_at timestamptz;
create table if not exists public.vip_private_calls (
 id uuid primary key default gen_random_uuid(),
 thread_id uuid not null references public.conversations(id) on delete cascade,
 caller_id uuid not null references public.profiles(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 call_type text not null check(call_type in ('voice','video')),
 status text not null default 'ringing' check(status in ('ringing','active','ended','declined','missed')),
 offer jsonb,
 answer jsonb,
 created_at timestamptz not null default now(),
 accepted_at timestamptz,
 ended_at timestamptz,
 check(caller_id<>recipient_id)
);
create index if not exists vip_private_calls_recipient_status_idx on public.vip_private_calls(recipient_id,status,created_at desc);
create table if not exists public.vip_private_call_candidates (
 id uuid primary key default gen_random_uuid(),
 call_id uuid not null references public.vip_private_calls(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 candidate jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists vip_call_candidates_call_idx on public.vip_private_call_candidates(call_id,created_at);
alter table public.vip_private_calls enable row level security;
alter table public.vip_private_call_candidates enable row level security;
drop policy if exists "VIP call participants can read their calls" on public.vip_private_calls;
create policy "VIP call participants can read their calls" on public.vip_private_calls for select to authenticated using ((select auth.uid())=caller_id or (select auth.uid())=recipient_id);
drop policy if exists "VIP call participants can read candidates" on public.vip_private_call_candidates;
create policy "VIP call participants can read candidates" on public.vip_private_call_candidates for select to authenticated using (
 exists(select 1 from public.vip_private_calls c where c.id=call_id and ((select auth.uid())=c.caller_id or (select auth.uid())=c.recipient_id))
);

create or replace function public.start_vip_private_call(p_thread_id uuid,p_call_type text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_other uuid; v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if p_call_type not in ('voice','video') then raise exception 'Unsupported call type'; end if;
 if not exists(select 1 from public.profiles p where p.id=v_uid and p.is_vip=true and (p.vip_expires_at is null or p.vip_expires_at>now())) then
  raise exception 'An active VIP pass is required to call';
 end if;
 select cm.user_id into v_other from public.conversation_members cm
 where cm.conversation_id=p_thread_id and cm.user_id<>v_uid
 and exists(select 1 from public.conversation_members own where own.conversation_id=p_thread_id and own.user_id=v_uid)
 limit 1;
 if v_other is null then raise exception 'Call recipient is not in this conversation'; end if;
 if not exists(select 1 from public.profiles p where p.id=v_other and p.is_vip=true and (p.vip_expires_at is null or p.vip_expires_at>now())) then
  raise exception 'VIP calls are available only between active VIP members';
 end if;
 if exists(select 1 from public.vip_private_calls c where c.thread_id=p_thread_id and c.status in ('ringing','active')) then
  raise exception 'A call is already active for this conversation';
 end if;
 insert into public.vip_private_calls(thread_id,caller_id,recipient_id,call_type)
 values(p_thread_id,v_uid,v_other,p_call_type) returning id into v_id;
 return jsonb_build_object('id',v_id,'status','ringing');
end;
$$;

create or replace function public.get_my_incoming_vip_calls()
returns table(id uuid,thread_id uuid,caller_id uuid,call_type text,status text,created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
 select c.id,c.thread_id,c.caller_id,c.call_type,c.status,c.created_at
 from public.vip_private_calls c
 where c.recipient_id=auth.uid() and c.status='ringing'
 and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_vip=true and (p.vip_expires_at is null or p.vip_expires_at>now()))
 order by c.created_at desc limit 5;
$$;

create or replace function public.get_vip_call(p_call_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_call public.vip_private_calls%rowtype;
begin
 select * into v_call from public.vip_private_calls where id=p_call_id and (caller_id=auth.uid() or recipient_id=auth.uid());
 if not found then raise exception 'Call not found or access denied'; end if;
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_vip=true and (p.vip_expires_at is null or p.vip_expires_at>now())) then
  raise exception 'An active VIP pass is required';
 end if;
 return jsonb_build_object('id',v_call.id,'thread_id',v_call.thread_id,'caller_id',v_call.caller_id,'recipient_id',v_call.recipient_id,'call_type',v_call.call_type,'status',v_call.status,'offer',v_call.offer,'answer',v_call.answer);
end;
$$;

create or replace function public.set_vip_call_offer(p_call_id uuid,p_offer jsonb)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null or not exists(select 1 from public.vip_private_calls where id=p_call_id and caller_id=auth.uid() and status in ('ringing','active')) then raise exception 'Only the call initiator can set the offer'; end if;
 update public.vip_private_calls set offer=p_offer,status='active',accepted_at=coalesce(accepted_at,now()) where id=p_call_id;
 return true;
end;
$$;

create or replace function public.set_vip_call_answer(p_call_id uuid,p_answer jsonb)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null or not exists(select 1 from public.vip_private_calls where id=p_call_id and recipient_id=auth.uid() and status in ('ringing','active')) then raise exception 'Only the recipient can answer this call'; end if;
 update public.vip_private_calls set answer=p_answer,status='active',accepted_at=coalesce(accepted_at,now()) where id=p_call_id;
 return true;
end;
$$;

create or replace function public.add_vip_call_candidate(p_call_id uuid,p_candidate jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.vip_private_calls where id=p_call_id and (caller_id=auth.uid() or recipient_id=auth.uid()) and status in ('ringing','active')) then raise exception 'Call not found or access denied'; end if;
 insert into public.vip_private_call_candidates(call_id,sender_id,candidate) values(p_call_id,auth.uid(),p_candidate) returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.get_vip_call_candidates(p_call_id uuid)
returns table(sender_id uuid,candidate jsonb)
language sql stable security definer set search_path = ''
as $$
 select cc.sender_id,cc.candidate from public.vip_private_call_candidates cc
 join public.vip_private_calls c on c.id=cc.call_id
 where cc.call_id=p_call_id and (c.caller_id=auth.uid() or c.recipient_id=auth.uid())
 order by cc.created_at asc;
$$;

create or replace function public.end_vip_private_call(p_call_id uuid,p_status text default 'ended')
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if p_status not in ('ended','declined','missed') then raise exception 'Invalid call end status'; end if;
 update public.vip_private_calls set status=p_status,ended_at=now()
 where id=p_call_id and (caller_id=auth.uid() or recipient_id=auth.uid()) and status in ('ringing','active');
 if not found then raise exception 'Call not found or already ended'; end if;
 return true;
end;
$$;

revoke all on function public.start_vip_private_call(uuid,text) from public,anon;
grant execute on function public.start_vip_private_call(uuid,text) to authenticated;
revoke all on function public.get_my_incoming_vip_calls() from public,anon;
grant execute on function public.get_my_incoming_vip_calls() to authenticated;
revoke all on function public.get_vip_call(uuid) from public,anon;
grant execute on function public.get_vip_call(uuid) to authenticated;
revoke all on function public.set_vip_call_offer(uuid,jsonb) from public,anon;
grant execute on function public.set_vip_call_offer(uuid,jsonb) to authenticated;
revoke all on function public.set_vip_call_answer(uuid,jsonb) from public,anon;
grant execute on function public.set_vip_call_answer(uuid,jsonb) to authenticated;
revoke all on function public.add_vip_call_candidate(uuid,jsonb) from public,anon;
grant execute on function public.add_vip_call_candidate(uuid,jsonb) to authenticated;
revoke all on function public.get_vip_call_candidates(uuid) from public,anon;
grant execute on function public.get_vip_call_candidates(uuid) to authenticated;
revoke all on function public.end_vip_private_call(uuid,text) from public,anon;
grant execute on function public.end_vip_private_call(uuid,text) to authenticated;
