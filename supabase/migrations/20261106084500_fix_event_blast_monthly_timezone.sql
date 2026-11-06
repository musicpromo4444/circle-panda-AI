-- Align the monthly free Event Blast eligibility window with each user's profile timezone.
CREATE OR REPLACE FUNCTION public.get_event_promotion_status_secure()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_vip boolean := false;
  v_reach integer := 100;
  v_used boolean := false;
  v_timezone text;
  v_local_month_start timestamp;
  v_month_start timestamptz;
  v_next_month_start timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in is required';
  END IF;

  SELECT
    coalesce(p.is_vip, false)
      AND (p.vip_expires_at IS NULL OR p.vip_expires_at > now()),
    p.timezone
  INTO v_vip, v_timezone
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF coalesce(v_timezone, '') = ''
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_timezone_names z
       WHERE z.name = v_timezone
     ) THEN
    v_timezone := 'UTC';
  END IF;

  v_local_month_start := date_trunc('month', now() AT TIME ZONE v_timezone);
  v_month_start := v_local_month_start AT TIME ZONE v_timezone;
  v_next_month_start := (v_local_month_start + interval '1 month') AT TIME ZONE v_timezone;
  v_reach := CASE WHEN coalesce(v_vip, false) THEN 500 ELSE 100 END;

  SELECT EXISTS (
    SELECT 1
    FROM public.event_blasts b
    WHERE b.user_id = v_uid
      AND b.payment_method = 'free'
      AND b.created_at >= v_month_start
      AND b.created_at < v_next_month_start
  )
  INTO v_used;

  RETURN jsonb_build_object(
    'eligible', NOT v_used,
    'base_reach', v_reach,
    'notification_cap', v_reach * 2,
    'is_vip', coalesce(v_vip, false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_free_event_promotion_secure(
  p_event_id uuid,
  p_target_scope text DEFAULT 'worldwide',
  p_target_country text DEFAULT NULL,
  p_target_state text DEFAULT NULL,
  p_target_city text DEFAULT NULL,
  p_target_area text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_vip boolean := false;
  v_reach integer := 100;
  v_id uuid;
  v_actual integer;
  v_cap integer;
  v_ends timestamptz;
  v_timezone text;
  v_local_month_start timestamp;
  v_month_start timestamptz;
  v_next_month_start timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.events
    WHERE id = p_event_id
      AND creator_id = v_uid
      AND is_published = true
  ) THEN
    RAISE EXCEPTION 'Only the event creator can promote this event';
  END IF;

  IF p_target_scope IS NULL OR p_target_scope NOT IN ('worldwide', 'country', 'state', 'city', 'area') THEN
    RAISE EXCEPTION 'Invalid target audience';
  END IF;

  SELECT
    coalesce(p.is_vip, false)
      AND (p.vip_expires_at IS NULL OR p.vip_expires_at > now()),
    p.timezone
  INTO v_vip, v_timezone
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF coalesce(v_timezone, '') = ''
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_timezone_names z
       WHERE z.name = v_timezone
     ) THEN
    v_timezone := 'UTC';
  END IF;

  v_local_month_start := date_trunc('month', now() AT TIME ZONE v_timezone);
  v_month_start := v_local_month_start AT TIME ZONE v_timezone;
  v_next_month_start := (v_local_month_start + interval '1 month') AT TIME ZONE v_timezone;
  v_reach := CASE WHEN coalesce(v_vip, false) THEN 500 ELSE 100 END;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('circle-panda:event-blast-free:' || v_uid::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.event_blasts b
    WHERE b.user_id = v_uid
      AND b.payment_method = 'free'
      AND b.created_at >= v_month_start
      AND b.created_at < v_next_month_start
  ) THEN
    RAISE EXCEPTION 'Your free Event Blast for this month has already been used';
  END IF;

  v_ends := now() + interval '24 hours';

  INSERT INTO public.event_blasts(
    event_id, user_id, plan_id, payment_method,
    target_scope, target_country, target_state, target_city, target_area,
    unique_reach, notification_cap, status, ends_at
  )
  VALUES (
    p_event_id, v_uid, 'monthly_free', 'free',
    p_target_scope,
    nullif(trim(coalesce(p_target_country, '')), ''),
    nullif(trim(coalesce(p_target_state, '')), ''),
    nullif(trim(coalesce(p_target_city, '')), ''),
    nullif(trim(coalesce(p_target_area, '')), ''),
    v_reach, v_reach * 2, 'active', v_ends
  )
  RETURNING id INTO v_id;

  SELECT unique_reach, notification_cap, ends_at
  INTO v_actual, v_cap, v_ends
  FROM public.event_blasts
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'unique_reach', v_actual,
    'notification_cap', v_cap,
    'ends_at', v_ends
  );
END;
$function$;
