-- Secure reporting for feed posts and integration with the admin moderation queue.
create table if not exists public.feed_content_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment','hate','sexual_content','spam','self_harm','scam','other')),
  details text not null default '' check (char_length(details) <= 2000),
  created_at timestamptz not null default now(),
  unique(post_id, reporter_id)
);
alter table public.feed_content_reports enable row level security;
revoke all on public.feed_content_reports from anon, authenticated;

create or replace function public.report_feed_post_secure(p_post_id uuid,p_reason text,p_details text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_author uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'Sign in is required'; end if;
  if p_reason not in ('harassment','hate','sexual_content','spam','self_harm','scam','other') then
    raise exception 'Choose a valid report reason';
  end if;
  if length(coalesce(p_details,'')) > 2000 then raise exception 'Details must be 2,000 characters or fewer'; end if;
  select fp.author_id into v_author from public.feed_posts fp where fp.id=p_post_id;
  if not found then raise exception 'Post not found'; end if;
  if v_author=v_user then raise exception 'You cannot report your own post'; end if;
  insert into public.feed_content_reports(post_id,reporter_id,reason,details)
  values(p_post_id,v_user,p_reason,left(coalesce(p_details,''),2000))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'You have already reported this post';
end;
$function$;

alter table public.moderation_reviews drop constraint if exists moderation_reviews_report_type_check;
alter table public.moderation_reviews add constraint moderation_reviews_report_type_check check (report_type in ('crush','group_user','feed_post'));

create or replace function public.admin_list_moderation_reports()
returns table (
  report_type text, report_id uuid, target_user_id uuid, group_id uuid, reporter_id uuid,
  reason text, details text, created_at timestamptz, review_status text, reviewed_at timestamptz, review_note text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='admin') then
    raise exception 'Administrator access required';
  end if;
  return query
  select 'crush'::text,r.id,r.nominee_id,null::uuid,r.reporter_id,r.reason,coalesce(r.details,''),r.created_at,coalesce(m.action,'open'),m.reviewed_at,coalesce(m.note,'')
  from public.crush_reports r left join public.moderation_reviews m on m.report_type='crush' and m.report_id=r.id
  union all
  select 'group_user'::text,r.id,r.reported_user_id,r.group_id,r.reporter_id,r.reason,coalesce(r.details,''),r.created_at,coalesce(m.action,'open'),m.reviewed_at,coalesce(m.note,'')
  from public.group_user_reports r left join public.moderation_reviews m on m.report_type='group_user' and m.report_id=r.id
  union all
  select 'feed_post'::text,r.id,fp.author_id,null::uuid,r.reporter_id,r.reason,coalesce(r.details,''),r.created_at,coalesce(m.action,'open'),m.reviewed_at,coalesce(m.note,'')
  from public.feed_content_reports r join public.feed_posts fp on fp.id=r.post_id
  left join public.moderation_reviews m on m.report_type='feed_post' and m.report_id=r.id
  order by 8 desc;
end;
$function$;

create or replace function public.admin_review_moderation_report(p_report_type text,p_report_id uuid,p_action text,p_note text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor uuid:=auth.uid(); v_exists boolean:=false;
begin
  if v_actor is null or not exists(select 1 from public.user_roles r where r.user_id=v_actor and r.role='admin') then raise exception 'Administrator access required'; end if;
  if p_report_type not in ('crush','group_user','feed_post') then raise exception 'Unsupported report type'; end if;
  if p_action not in ('reviewed','dismissed') then raise exception 'Unsupported moderation action'; end if;
  if length(coalesce(p_note,''))>2000 then raise exception 'Review note must be 2,000 characters or fewer'; end if;
  if p_report_type='crush' then select exists(select 1 from public.crush_reports where id=p_report_id) into v_exists;
  elsif p_report_type='group_user' then select exists(select 1 from public.group_user_reports where id=p_report_id) into v_exists;
  else select exists(select 1 from public.feed_content_reports where id=p_report_id) into v_exists;
  end if;
  if not v_exists then raise exception 'Report not found'; end if;
  insert into public.moderation_reviews(report_type,report_id,action,note,reviewed_by,reviewed_at)
  values(p_report_type,p_report_id,p_action,left(coalesce(p_note,''),2000),v_actor,now())
  on conflict(report_type,report_id) do update set action=excluded.action,note=excluded.note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(v_actor,'moderation_report_'||p_action,p_report_type,p_report_id,jsonb_build_object('note',left(coalesce(p_note,''),2000)));
  return true;
end;
$function$;

revoke all on function public.report_feed_post_secure(uuid,text,text) from public, anon;
grant execute on function public.report_feed_post_secure(uuid,text,text) to authenticated;
revoke all on function public.admin_list_moderation_reports() from public, anon;
revoke all on function public.admin_review_moderation_report(text,uuid,text,text) from public, anon;
grant execute on function public.admin_list_moderation_reports() to authenticated;
grant execute on function public.admin_review_moderation_report(text,uuid,text,text) to authenticated;
