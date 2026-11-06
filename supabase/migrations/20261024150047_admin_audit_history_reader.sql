create or replace function public.admin_list_audit_history(p_limit integer default 50)
returns table (
  id bigint,
  actor_id uuid,
  actor_label text,
  action text,
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz
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
  select a.id, a.actor_id, coalesce(p.display_name,p.username,'Admin')::text,
         a.action, a.target_type, a.target_id, a.details, a.created_at
  from public.admin_audit_log a
  left join public.profiles p on p.id=a.actor_id
  order by a.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
end;
$function$;

revoke all on function public.admin_list_audit_history(integer) from public, anon;
grant execute on function public.admin_list_audit_history(integer) to authenticated;
