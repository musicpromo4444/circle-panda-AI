
-- Compatibility layer for the current client-side store's read model.
alter table public.messages
 add column if not exists media_type text,
 add column if not exists media_path text,
 add column if not exists view_once boolean not null default false,
 add column if not exists idempotency_key text;
alter table public.chat_groups
 add column if not exists about text,
 add column if not exists limitations text,
 add column if not exists vip_scope text,
 add column if not exists state_province text,
 add column if not exists city text,
 add column if not exists area text,
 add column if not exists activated_at timestamptz,
 add column if not exists closed_at timestamptz;
create table if not exists public.group_settings (
 group_id uuid primary key references public.chat_groups(id) on delete cascade,
 edit_group_info text not null default 'admins',
 send_messages boolean not null default true,
 approve_new_members boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.group_settings enable row level security;
drop policy if exists "Group members can read group settings" on public.group_settings;
create policy "Group members can read group settings" on public.group_settings for select to authenticated using (
 exists(select 1 from public.group_members gm where gm.group_id=group_settings.group_id and gm.user_id=(select auth.uid()))
);

create or replace view public.posts with (security_invoker=true) as
 select id,body,created_at,author_id from public.feed_posts;
grant select on public.posts to authenticated;

create or replace view public.wallets with (security_invoker=true) as
 select user_id,bc_balance as balance,updated_at from public.wallet_accounts;
grant select on public.wallets to authenticated;

create or replace view public.xp_ledger with (security_invoker=true) as
 select user_id,xp_total as amount,updated_at from public.user_xp;
grant select on public.xp_ledger to authenticated;

create or replace view public.admin_roles with (security_invoker=true) as
 select user_id,role from public.user_roles;
grant select on public.admin_roles to authenticated;

create or replace view public.group_messages with (security_invoker=true) as
 select m.id,c.context_id as group_id,m.body,m.created_at,m.sender_id,
        m.reply_to_message_id as reply_to_id,m.media_type,m.media_path,m.view_once
 from public.messages m join public.conversations c on c.id=m.conversation_id
 where c.conversation_type='group';
grant select on public.group_messages to authenticated;

create table if not exists public.crush_winners (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('wcw','mcm')),
 display_name text not null,
 user_id uuid references public.profiles(id) on delete set null,
 week_start date not null,
 created_at timestamptz not null default now(),
 unique(kind,week_start)
);
alter table public.crush_winners enable row level security;
drop policy if exists "Signed in users can read crush winners" on public.crush_winners;
create policy "Signed in users can read crush winners" on public.crush_winners for select to authenticated using (true);

create or replace function public.create_post(p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(trim(coalesce(p_body,'')))<1 or length(p_body)>5000 then raise exception 'Post must be between 1 and 5000 characters'; end if;
 insert into public.feed_posts(author_id,post_type,body,is_anonymous) values(v_uid,'post',trim(p_body),true) returning id into v_id;
 perform public.log_activity_and_reward(v_uid,'create_post',v_id);
 return v_id;
end;
$$;

create or replace function public.create_post_reply_secure(p_post_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if length(trim(coalesce(p_body,'')))<1 or length(p_body)>2000 then raise exception 'Reply must be between 1 and 2000 characters'; end if;
 if not exists(select 1 from public.feed_posts where id=p_post_id) then raise exception 'Post not found'; end if;
 insert into public.post_comments(post_id,author_id,body) values(p_post_id,v_uid,trim(p_body)) returning id into v_id;
 perform public.log_activity_and_reward(v_uid,'reply_post',v_id);
 return v_id;
end;
$$;

create or replace function public.get_events_for_user()
returns setof jsonb language sql stable security definer set search_path = ''
as $$
 select jsonb_build_object(
  'id',e.id,'creator_id',e.creator_id,'title',e.title,'description',e.description,'location',coalesce(e.venue_name,e.venue),
  'starts_at',e.starts_at,'ends_at',e.ends_at,'category',coalesce(e.category,'Meetup'),
  'entry_fee_amount',e.entry_fee_amount,'entry_fee_currency',e.entry_fee_currency,
  'viewer_going',exists(select 1 from public.event_attendees a where a.event_id=e.id and a.user_id=auth.uid()),
  'viewer_interested',false,
  'attendee_count',(select count(*) from public.event_attendees a where a.event_id=e.id),
  'interested_count',0,'response_count',(select count(*) from public.event_attendees a where a.event_id=e.id),
  'reach_count',0,'reach_scope',e.reach_scope,'reach_country',e.reach_country,'reach_state',e.reach_state,
  'reach_city',e.reach_city,'reach_area',e.reach_area,'duration_minutes',e.duration_minutes,
  'cover_url',e.cover_url,'venue_name',e.venue_name,'address_line',e.address_line,'country',e.country,
  'state_province',e.state_province,'city',e.city,'area',e.area,'latitude',e.latitude,'longitude',e.longitude
 )
 from public.events e where e.is_published=true
 order by e.starts_at asc;
$$;

create or replace function public.get_group_summaries(
 p_country text default '',p_state_province text default '',p_city text default '',p_area text default ''
) returns setof jsonb language sql stable security definer set search_path = ''
as $$
 select jsonb_build_object(
  'id',g.id,'name',g.name,'about',coalesce(g.about,g.description,''),'creator_id',g.creator_id,
  'member_role',gm.role,'member_count',(select count(*) from public.group_members c where c.group_id=g.id),
  'activated_at',g.activated_at,'closed_at',g.closed_at,'join_pending',false,
  'country',coalesce(g.country_restriction,''),'state_province',coalesce(g.state_province,''),
  'city',coalesce(g.city,''),'area',coalesce(g.area,'')
 )
 from public.chat_groups g
 left join public.group_members gm on gm.group_id=g.id and gm.user_id=auth.uid()
 where (gm.user_id is not null or coalesce(g.country_restriction,'')='')
   and (coalesce(p_country,'')='' or coalesce(g.country_restriction,'')='' or lower(g.country_restriction)=lower(p_country))
   and (coalesce(p_state_province,'')='' or coalesce(g.state_province,'')='' or lower(g.state_province)=lower(p_state_province))
   and (coalesce(p_city,'')='' or coalesce(g.city,'')='' or lower(g.city)=lower(p_city))
   and (coalesce(p_area,'')='' or coalesce(g.area,'')='' or lower(g.area)=lower(p_area))
 order by g.created_at desc;
$$;

revoke all on function public.create_post(text) from public,anon;
grant execute on function public.create_post(text) to authenticated;
revoke all on function public.create_post_reply_secure(uuid,text) from public,anon;
grant execute on function public.create_post_reply_secure(uuid,text) to authenticated;
revoke all on function public.get_events_for_user() from public,anon;
grant execute on function public.get_events_for_user() to authenticated;
revoke all on function public.get_group_summaries(text,text,text,text) from public,anon;
grant execute on function public.get_group_summaries(text,text,text,text) to authenticated;
