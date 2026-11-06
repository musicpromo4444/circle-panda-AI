begin;

-- Anonymous clients do not need direct table or sequence mutation privileges.
-- The only intentionally anonymous table read is the enabled coin-package catalogue.
revoke all privileges on all tables in schema public from anon;
grant select on table public.coin_packages to anon;
revoke all privileges on all sequences in schema public from anon;

-- Keep the one deliberately public, read-only provider availability getter.
revoke execute on all functions in schema public from anon;
grant execute on function public.get_public_auth_provider_settings() to anon;

-- RLS protects row-level access, but it does not protect TRUNCATE or maintenance
-- operations. Those privileges are not needed by the browser client.
revoke maintain, references, trigger, truncate
  on all tables in schema public
  from authenticated;

-- Harden future objects created by the current migration owner (postgres).
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public
  revoke maintain, references, trigger, truncate on tables from authenticated;

commit;
