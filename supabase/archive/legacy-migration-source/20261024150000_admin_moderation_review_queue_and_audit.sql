-- Admin-only moderation queue and immutable review audit trail.
create table if not exists public.moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('crush','group_user')),
  report_id uuid not null,
  action text not null check (action in ('reviewed','dismissed')),
  note text not null default '',
  reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(),
  unique (report_type, report_id)
);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.moderation_reviews enable row level security;
alter table public.admin_audit_log enable row level security;
revoke all on public.moderation_reviews from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;

create or replace function public.admin_list_moderation_reports()
returns table (
  report_type text,
  report_id uuid,
  target_user_id uuid,
  group_id uuid,
  reporter_id uuid,
  reason text,
  details text,
  created_at timestamptz,
  review_status text,
  reviewed_at timestamptz,
  review_note text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  return query
  select 'crush'::text, r.id, r.nominee_id, null::uuid, r.reporter_id,
         r.reason, coalesce(r.details,''), r.created_at,
         coalesce(m.action,'open'), m.reviewed_at, coalesce(m.note,'')
  from public.crush_reports r
  left join public.moderation_reviews m on m.report_type='crush' and m.report_id=r.id
  union all
  select 'group_user'::text, r.id, r.reported_user_id, r.group_id, r.reporter_id,
         r.reason, coalesce(r.details,''), r.created_at,
         coalesce(m.action,'open'), m.reviewed_at, coalesce(m.note,'')
  from public.group_user_reports r
  left join public.moderation_reviews m on m.report_type='group_user' and m.report_id=r.id
  order by 8 desc;
end;
$function$;

create or replace function public.admin_review_moderation_report(
  p_report_type text,
  p_report_id uuid,
  p_action text,
  p_note text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_exists boolean := false;
begin
  if v_actor is null or not exists (
    select 1 from public.user_roles r where r.user_id = v_actor and r.role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;
  if p_report_type not in ('crush','group_user') then
    raise exception 'Unsupported report type';
  end if;
  if p_action not in ('reviewed','dismissed') then
    raise exception 'Unsupported moderation action';
  end if;
  if length(coalesce(p_note,'')) > 2000 then
    raise exception 'Review note must be 2,000 characters or fewer';
  end if;

  if p_report_type='crush' then
    select exists(select 1 from public.crush_reports where id=p_report_id) into v_exists;
  else
    select exists(select 1 from public.group_user_reports where id=p_report_id) into v_exists;
  end if;
  if not v_exists then raise exception 'Report not found'; end if;

  insert into public.moderation_reviews(report_type,report_id,action,note,reviewed_by,reviewed_at)
  values(p_report_type,p_report_id,p_action,left(coalesce(p_note,''),2000),v_actor,now())
  on conflict (report_type,report_id) do update
    set action=excluded.action,note=excluded.note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;

  insert into public.admin_audit_log(actor_id,action,target_type,target_id,details)
  values(v_actor,'moderation_report_'||p_action,p_report_type,p_report_id,
    jsonb_build_object('note',left(coalesce(p_note,''),2000)));

  return true;
end;
$function$;

revoke all on function public.admin_list_moderation_reports() from public, anon;
revoke all on function public.admin_review_moderation_report(text,uuid,text,text) from public, anon;
grant execute on function public.admin_list_moderation_reports() to authenticated;
grant execute on function public.admin_review_moderation_report(text,uuid,text,text) to authenticated;
