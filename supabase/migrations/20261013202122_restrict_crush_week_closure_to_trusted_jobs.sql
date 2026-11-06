REVOKE EXECUTE ON FUNCTION public.close_crush_week_secure() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_crush_week_secure() TO service_role;
