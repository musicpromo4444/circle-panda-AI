
create table if not exists public.dating_matches (
 id uuid primary key default gen_random_uuid(),
 user_a uuid not null references public.profiles(id) on delete cascade,
 user_b uuid not null references public.profiles(id) on delete cascade,
 thread_id uuid references public.conversations(id) on delete set null,
 status text not null default 'matched' check (status in ('matched','ignored','closed')),
 free_until timestamptz not null default (now() + interval '72 hours'),
 user_a_confirmed boolean not null default false,
 user_b_confirmed boolean not null default false,
 photos_revealed boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (user_a <> user_b),
 unique(user_a,user_b)
);
create index if not exists dating_matches_user_a_idx on public.dating_matches(user_a,created_at desc);
create index if not exists dating_matches_user_b_idx on public.dating_matches(user_b,created_at desc);
alter table public.dating_matches enable row level security;
drop policy if exists "Participants can read their dating matches" on public.dating_matches;
create policy "Participants can read their dating matches" on public.dating_matches for select to authenticated using ((select auth.uid())=user_a or (select auth.uid())=user_b);

create or replace view public.dm_requests with (security_invoker=true) as
select id,sender_id,recipient_id,source_type as context_type,source_id as context_id,
 case source_type when 'dating' then 'Dating 💌' when 'event' then 'Event' when 'group' then 'Group' when 'wcw' then 'WCW' when 'mcm' then 'MCM' when 'confession' then 'Confession' when 'feed' then 'Feed' else 'Profile' end as source_label,
 created_at,status,responded_at,conversation_id as thread_id
from public.message_requests;
grant select on public.dm_requests to authenticated;

create or replace function public.send_message_request(
 p_recipient_id uuid,p_source_type text,p_source_id uuid default null,p_greeting text default ''
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_sender_id uuid := auth.uid(); v_request_id uuid;
begin
 if v_sender_id is null then raise exception 'Sign in is required'; end if;
 if p_recipient_id is null or p_recipient_id=v_sender_id then raise exception 'You cannot send a message request to yourself'; end if;
 if p_source_type not in ('dating','event','group','feed','profile','wcw','mcm','confession') then raise exception 'Unsupported message request source'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_recipient_id) then raise exception 'Recipient was not found'; end if;
 if exists(select 1 from public.message_requests mr where mr.sender_id=v_sender_id and mr.recipient_id=p_recipient_id and mr.status='pending') then raise exception 'You already have a pending request to this person'; end if;
 insert into public.message_requests(sender_id,recipient_id,source_type,source_id,greeting)
 values(v_sender_id,p_recipient_id,p_source_type,p_source_id,left(coalesce(p_greeting,''),1000))
 returning id into v_request_id;
 insert into public.notifications(user_id,actor_id,notification_type,title,body,target_type,target_id)
 values(p_recipient_id,v_sender_id,'message_request','New message request',left(coalesce(p_greeting,''),240),'message_request',v_request_id);
 return v_request_id;
end;
$$;

create or replace function public.request_context_message_secure(
 p_recipient_id uuid,p_message text,p_context_type text,p_context_id uuid default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_source text := p_context_type;
begin
 if v_source not in ('dating','event','group','feed','profile','wcw','mcm','confession') then raise exception 'Unsupported message request source'; end if;
 v_id := public.send_message_request(p_recipient_id,v_source,p_context_id,p_message);
 return jsonb_build_object('id',v_id,'status','pending');
end;
$$;

create or replace function public.respond_direct_message_request_secure(p_request_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_source text; v_sender uuid; v_recipient uuid; v_source_id uuid; v_thread uuid; v_match_id uuid;
begin
 select source_type,sender_id,recipient_id,source_id into v_source,v_sender,v_recipient,v_source_id
 from public.message_requests where id=p_request_id and recipient_id=auth.uid() and status='pending' for update;
 if not found then raise exception 'Message request was not found or has already been handled'; end if;
 v_thread := public.respond_message_request(p_request_id,p_accept);
 if not p_accept then return jsonb_build_object('thread_id',null,'status','declined'); end if;
 if v_source='dating' then
   update public.conversations set conversation_type='dating' where id=v_thread;
   insert into public.dating_matches(user_a,user_b,thread_id,status,free_until)
   values(least(v_sender,v_recipient),greatest(v_sender,v_recipient),v_thread,'matched',now()+interval '72 hours')
   on conflict(user_a,user_b) do update set thread_id=excluded.thread_id,status='matched',free_until=coalesce(public.dating_matches.free_until,excluded.free_until),updated_at=now()
   returning id into v_match_id;
 end if;
 return jsonb_build_object('thread_id',v_thread,'status',case when v_source='dating' then 'matched' else 'accepted' end);
end;
$$;

create or replace function public.get_my_dating_requests_secure()
returns table(id uuid,sender_id uuid,recipient_id uuid,status text,created_at timestamptz,sender_name text)
language sql stable security definer set search_path = ''
as $$
 select mr.source_id,mr.sender_id,mr.recipient_id,mr.status,mr.created_at,
        coalesce(dp.name,p.display_name,'Anonymous Panda')
 from public.message_requests mr
 left join public.dating_profiles dp on dp.user_id=mr.sender_id
 left join public.profiles p on p.id=mr.sender_id
 where mr.source_type='dating' and mr.status='pending' and mr.recipient_id=auth.uid()
 order by mr.created_at desc;
$$;

create or replace function public.get_my_dating_matches_secure()
returns table(id uuid,user_a uuid,user_b uuid,free_until timestamptz,photos_revealed boolean,thread_id uuid,status text)
language sql stable security definer set search_path = ''
as $$
 select m.id,m.user_a,m.user_b,m.free_until,m.photos_revealed,m.thread_id,m.status
 from public.dating_matches m
 where auth.uid()=m.user_a or auth.uid()=m.user_b
 order by m.created_at desc;
$$;

create or replace function public.get_pending_dating_decisions_secure()
returns table(id uuid,free_until timestamptz,photos_revealed boolean)
language sql stable security definer set search_path = ''
as $$
 select m.id,m.free_until,m.photos_revealed
 from public.dating_matches m
 where (m.user_a=auth.uid() and not m.user_a_confirmed)
    or (m.user_b=auth.uid() and not m.user_b_confirmed)
 order by m.created_at desc;
$$;

create or replace function public.get_or_create_dating_thread_secure(p_other uuid)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare v_thread uuid;
begin
 if auth.uid() is null or p_other is null or p_other=auth.uid() then raise exception 'Invalid Dating conversation'; end if;
 select thread_id into v_thread from public.dating_matches
 where status='matched' and thread_id is not null
 and ((user_a=auth.uid() and user_b=p_other) or (user_b=auth.uid() and user_a=p_other))
 limit 1;
 if v_thread is null then raise exception 'A mutual Dating match is required before opening chat'; end if;
 return v_thread;
end;
$$;

create or replace function public.decide_dating_match_secure(p_match_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_match public.dating_matches%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if p_decision not in ('ignore','continue') then raise exception 'Invalid Dating decision'; end if;
 select * into v_match from public.dating_matches where id=p_match_id and (user_a=auth.uid() or user_b=auth.uid()) for update;
 if not found then raise exception 'Dating match not found'; end if;
 if p_decision='ignore' then
   update public.dating_matches set status='ignored',updated_at=now() where id=p_match_id;
   return jsonb_build_object('status','ignored');
 end if;
 update public.dating_matches set
   user_a_confirmed=case when user_a=auth.uid() then true else user_a_confirmed end,
   user_b_confirmed=case when user_b=auth.uid() then true else user_b_confirmed end,
   photos_revealed=(case when user_a=auth.uid() then true else user_a_confirmed end)
                   and (case when user_b=auth.uid() then true else user_b_confirmed end),
   updated_at=now()
 where id=p_match_id returning * into v_match;
 return jsonb_build_object('status',case when v_match.photos_revealed then 'matched' else 'waiting' end);
end;
$$;

revoke all on function public.request_context_message_secure(uuid,text,text,uuid) from public,anon;
grant execute on function public.request_context_message_secure(uuid,text,text,uuid) to authenticated;
revoke all on function public.respond_direct_message_request_secure(uuid,boolean) from public,anon;
grant execute on function public.respond_direct_message_request_secure(uuid,boolean) to authenticated;
revoke all on function public.get_my_dating_requests_secure() from public,anon;
grant execute on function public.get_my_dating_requests_secure() to authenticated;
revoke all on function public.get_my_dating_matches_secure() from public,anon;
grant execute on function public.get_my_dating_matches_secure() to authenticated;
revoke all on function public.get_pending_dating_decisions_secure() from public,anon;
grant execute on function public.get_pending_dating_decisions_secure() to authenticated;
revoke all on function public.get_or_create_dating_thread_secure(uuid) from public,anon;
grant execute on function public.get_or_create_dating_thread_secure(uuid) to authenticated;
revoke all on function public.decide_dating_match_secure(uuid,text) from public,anon;
grant execute on function public.decide_dating_match_secure(uuid,text) to authenticated;
