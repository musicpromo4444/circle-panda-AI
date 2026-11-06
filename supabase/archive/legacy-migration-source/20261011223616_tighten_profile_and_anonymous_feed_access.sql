-- Tighten user-editable profile columns and keep anonymous post authors out of feed reads.
revoke update on table public.profiles from authenticated;
grant update (username, display_name, avatar_url, country, state, area, date_of_birth, gender, bio, updated_at)
on table public.profiles to authenticated;

create or replace view public.feed_posts_public as
select id, post_type, body, is_anonymous, created_at, updated_at
from public.feed_posts;

revoke select on table public.feed_posts from authenticated;
grant select on public.feed_posts_public to authenticated;
