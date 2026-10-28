-- Keep profile discovery usable while protecting DOB/address and membership fields.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, country, state, area, gender, bio,
  is_vip, created_at, updated_at, welcome_popup_seen_at, app_tour_seen_at,
  timezone, city, age, state_province, avatar_id, vip_expires_at
) ON public.profiles TO authenticated;
GRANT UPDATE (
  username, display_name, avatar_url, country, state, area, date_of_birth,
  gender, bio, updated_at, timezone, city, age, state_province, address_line, avatar_id
) ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  SELECT to_jsonb(p) INTO result
  FROM public.profiles AS p
  WHERE p.id = auth.uid();
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;
