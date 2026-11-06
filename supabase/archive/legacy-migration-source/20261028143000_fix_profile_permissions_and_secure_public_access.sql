-- Restore the least-privilege profile permissions required by the signed-in app.
-- Existing RLS policies remain authoritative: users can update only their own profile.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;
