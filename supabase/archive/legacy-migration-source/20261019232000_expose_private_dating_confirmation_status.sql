-- Return confirmation state only to a participant in their own Dating match.
create or replace function public.get_my_dating_matches_review_secure()
returns table(
  id uuid,
  user_a uuid,
  user_b uuid,
  free_until timestamptz,
  photos_revealed boolean,
  thread_id uuid,
  status text,
  my_confirmed boolean,
  other_confirmed boolean
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    m.id,
    m.user_a,
    m.user_b,
    m.free_until,
    m.photos_revealed,
    m.thread_id,
    m.status,
    case when auth.uid() = m.user_a then m.user_a_confirmed else m.user_b_confirmed end as my_confirmed,
    case when auth.uid() = m.user_a then m.user_b_confirmed else m.user_a_confirmed end as other_confirmed
  from public.dating_matches m
  where auth.uid() is not null
    and (auth.uid() = m.user_a or auth.uid() = m.user_b)
  order by m.created_at desc;
$function$;

revoke all on function public.get_my_dating_matches_review_secure() from public, anon;
grant execute on function public.get_my_dating_matches_review_secure() to authenticated;
