drop function if exists public.admin_list_moderation_reports();
create function public.admin_list_moderation_reports()
returns table (
  report_type text, report_id uuid, target_user_id uuid, group_id uuid, reporter_id uuid,
  reason text, details text, created_at timestamptz, review_status text, reviewed_at timestamptz,
  review_note text, content_preview text
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
  select 'crush'::text,r.id,r.nominee_id,null::uuid,r.reporter_id,r.reason,coalesce(r.details,''),r.created_at,coalesce(m.action,'open'),m.reviewed_at,coalesce(m.note,''),''::text
  from public.crush_reports r left join public.moderation_reviews m on m.report_type='crush' and m.report_id=r.id
  union all
  select 'group_user'::text,r.id,r.reported_user_id,r.group_id,r.reporter_id,r.reason,coalesce(r.details,''),r.created_at,coalesce(m.action,'open'),m.reviewed_at,coalesce(m.note,''),''::text
  from public.group_user_reports r left join public.moderation_reviews m on m.report_type='group_user' and m.report_id=r.id
  union all
  select 'feed_post'::text,r.id,fp.author_id,null::uuid,r.reporter_id,r.reason,coalesce(r.details,''),r.created_at,coalesce(m.action,'open'),m.reviewed_at,coalesce(m.note,''),left(fp.body,500)
  from public.feed_content_reports r join public.feed_posts fp on fp.id=r.post_id
  left join public.moderation_reviews m on m.report_type='feed_post' and m.report_id=r.id
  order by 8 desc;
end;
$function$;
revoke all on function public.admin_list_moderation_reports() from public, anon;
grant execute on function public.admin_list_moderation_reports() to authenticated;
