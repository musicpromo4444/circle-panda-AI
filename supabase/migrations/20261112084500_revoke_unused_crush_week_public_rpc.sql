-- The current CrushFeature reads crush_posts directly under RLS.
-- This legacy SECURITY DEFINER getter is not referenced by the application and
-- returns scheduled rows without applying the table's scheduled_for visibility
-- policy. Keep it unavailable to browser roles to prevent a future scheduled
-- card from being disclosed through the RPC.
revoke all on function public.get_wcw_mcm_current_week() from public, anon, authenticated;
