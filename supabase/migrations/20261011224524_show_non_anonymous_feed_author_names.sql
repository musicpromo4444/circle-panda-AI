create or replace view public.feed_posts_public as
select
  fp.id,
  fp.post_type,
  fp.body,
  fp.is_anonymous,
  fp.created_at,
  fp.updated_at,
  case when fp.is_anonymous then null else coalesce(p.display_name, p.username, 'Panda') end as author_name
from public.feed_posts fp
left join public.profiles p on p.id = fp.author_id;
revoke select on table public.feed_posts from authenticated;
grant select on public.feed_posts_public to authenticated;
