-- Group removal requires three distinct member approvals.
create table if not exists public.group_eviction_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null default '',
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists group_eviction_one_pending_per_target
  on public.group_eviction_requests(group_id,target_user_id) where status='pending';
create table if not exists public.group_eviction_votes (
  request_id uuid not null references public.group_eviction_requests(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  approve boolean not null,
  created_at timestamptz not null default now(),
  primary key(request_id,voter_id)
);
alter table public.group_eviction_requests enable row level security;
alter table public.group_eviction_votes enable row level security;

drop policy if exists "group members can read eviction requests" on public.group_eviction_requests;
create policy "group members can read eviction requests" on public.group_eviction_requests
for select to authenticated using (
  exists(select 1 from public.group_members gm where gm.group_id=group_eviction_requests.group_id and gm.user_id=auth.uid())
);
drop policy if exists "group members can read eviction votes" on public.group_eviction_votes;
create policy "group members can read eviction votes" on public.group_eviction_votes
for select to authenticated using (
  exists(select 1 from public.group_eviction_requests r join public.group_members gm on gm.group_id=r.group_id where r.id=group_eviction_votes.request_id and gm.user_id=auth.uid())
);

create or replace function public.request_group_eviction(p_group_id uuid,p_target_user_id uuid,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_req uuid; v_creator uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=v_uid) then raise exception 'Join this group before requesting a removal'; end if;
 select creator_id into v_creator from public.chat_groups where id=p_group_id;
 if not found then raise exception 'Group not found'; end if;
 if p_target_user_id=v_uid then raise exception 'You cannot request your own removal'; end if;
 if p_target_user_id=v_creator then raise exception 'The group creator cannot be removed by a member vote'; end if;
 if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_target_user_id) then raise exception 'That person is not a current group member'; end if;
 select id into v_req from public.group_eviction_requests where group_id=p_group_id and target_user_id=p_target_user_id and status='pending' limit 1;
 if v_req is not null then return jsonb_build_object('id',v_req,'status','pending','already_requested',true); end if;
 insert into public.group_eviction_requests(group_id,target_user_id,requested_by,reason)
 values(p_group_id,p_target_user_id,v_uid,left(trim(coalesce(p_reason,'')),1000)) returning id into v_req;
 insert into public.group_eviction_votes(request_id,voter_id,approve) values(v_req,v_uid,true)
 on conflict(request_id,voter_id) do nothing;
 return jsonb_build_object('id',v_req,'status','pending','already_requested',false);
end;
$$;
revoke all on function public.request_group_eviction(uuid,uuid,text) from public;
grant execute on function public.request_group_eviction(uuid,uuid,text) to authenticated;

create or replace function public.vote_group_eviction(p_request_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_req public.group_eviction_requests%rowtype; v_yes integer; v_no integer; v_conversation uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 select * into v_req from public.group_eviction_requests where id=p_request_id for update;
 if not found then raise exception 'Removal request not found'; end if;
 if v_req.status<>'pending' then raise exception 'This removal vote is already closed'; end if;
 if v_uid=v_req.target_user_id then raise exception 'You cannot vote on your own removal'; end if;
 if not exists(select 1 from public.group_members where group_id=v_req.group_id and user_id=v_uid) then raise exception 'Only group members can vote'; end if;
 insert into public.group_eviction_votes(request_id,voter_id,approve) values(p_request_id,v_uid,p_approve);
 select count(*) filter(where approve),count(*) filter(where not approve) into v_yes,v_no from public.group_eviction_votes where request_id=p_request_id;
 if v_yes>=3 then
   select id into v_conversation from public.conversations where conversation_type='group' and context_id=v_req.group_id limit 1;
   delete from public.group_members where group_id=v_req.group_id and user_id=v_req.target_user_id;
   if v_conversation is not null then delete from public.conversation_members where conversation_id=v_conversation and user_id=v_req.target_user_id; end if;
   update public.group_eviction_requests set status='approved',resolved_at=now() where id=p_request_id;
   insert into public.notifications(user_id,notification_type,title,body,target_type,target_id)
   values(v_req.target_user_id,'group_eviction','Group membership ended','Three group members approved your removal from a group.','group',v_req.group_id);
 elsif v_no>=3 then
   update public.group_eviction_requests set status='rejected',resolved_at=now() where id=p_request_id;
 end if;
 return jsonb_build_object('status',case when v_yes>=3 then 'approved' when v_no>=3 then 'rejected' else 'pending' end,'approvals',v_yes,'rejections',v_no);
end;
$$;
revoke all on function public.vote_group_eviction(uuid,boolean) from public;
grant execute on function public.vote_group_eviction(uuid,boolean) to authenticated;
