begin;

-- PUBLIC EXECUTE is inherited by anon and authenticated roles. The only
-- intentionally anonymous RPC is the read-only provider-availability getter.
-- Revoke accidental PUBLIC execution from internal helpers and trigger functions.
revoke execute on all functions in schema public from public;
grant execute on function public.get_public_auth_provider_settings() to anon;

commit;
