-- Trigger functions are invoked by PostgreSQL triggers, not through the public RPC API.
revoke all on function public.keep_circle_panda_admin_vip() from public, anon, authenticated;
