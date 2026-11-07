-- The current app reads the feed_posts_public view, which intentionally omits author IDs
-- for anonymous confessions. The legacy RPC bypasses that view and returned author_id,
-- so signed-in clients could correlate anonymous posts with account IDs.
-- No current frontend source calls this RPC; revoke its client execution safely.
REVOKE EXECUTE ON FUNCTION public.get_public_confessions(integer) FROM authenticated;
