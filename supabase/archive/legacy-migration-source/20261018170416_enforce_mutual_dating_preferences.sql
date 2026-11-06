-- Enforce the same mutual age and gender preferences in the trusted Dating request RPC.
CREATE OR REPLACE FUNCTION public.request_dating_match_secure(p_recipient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_existing uuid;
  v_thread uuid;
  v_result jsonb;
  v_sender_age integer;
  v_recipient_age integer;
  v_sender_gender text;
  v_recipient_gender text;
  v_sender_preferences text[];
  v_recipient_preferences text[];
  v_sender_age_min integer;
  v_sender_age_max integer;
  v_recipient_age_min integer;
  v_recipient_age_max integer;
  v_gender_norm text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;
  IF p_recipient_id IS NULL OR p_recipient_id = v_uid THEN
    RAISE EXCEPTION 'You cannot send a Dating request to yourself';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid
      AND p.date_of_birth IS NOT NULL
      AND p.date_of_birth <= (current_date - interval '18 years')::date
  ) THEN
    RAISE EXCEPTION 'Dating is available only to adults aged 18 and over';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_recipient_id
      AND p.date_of_birth IS NOT NULL
      AND p.date_of_birth <= (current_date - interval '18 years')::date
  ) THEN
    RAISE EXCEPTION 'That Dating profile is not available to your account';
  END IF;

  SELECT
    extract(year FROM age(current_date, p.date_of_birth))::integer,
    p.gender,
    d.gender_preferences,
    d.preferred_age_min,
    d.preferred_age_max
  INTO v_sender_age, v_sender_gender, v_sender_preferences, v_sender_age_min, v_sender_age_max
  FROM public.profiles p
  JOIN public.dating_profiles d ON d.user_id = p.id
  WHERE p.id = v_uid AND d.is_published = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Publish your Dating profile before sending requests'; END IF;

  SELECT
    d.id,
    extract(year FROM age(current_date, p.date_of_birth))::integer,
    p.gender,
    d.gender_preferences,
    d.preferred_age_min,
    d.preferred_age_max
  INTO v_profile_id, v_recipient_age, v_recipient_gender, v_recipient_preferences, v_recipient_age_min, v_recipient_age_max
  FROM public.profiles p
  JOIN public.dating_profiles d ON d.user_id = p.id
  WHERE p.id = p_recipient_id AND d.is_published = true
  LIMIT 1;

  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'That Dating profile is not available'; END IF;

  IF v_recipient_age < v_sender_age_min OR v_recipient_age > v_sender_age_max THEN
    RAISE EXCEPTION 'This profile is outside your preferred age range';
  END IF;
  IF v_sender_age < v_recipient_age_min OR v_sender_age > v_recipient_age_max THEN
    RAISE EXCEPTION 'This profile is outside their preferred age range';
  END IF;

  v_gender_norm := regexp_replace(lower(trim(coalesce(v_recipient_gender, ''))), '[^a-z]', '', 'g');
  IF coalesce(cardinality(v_sender_preferences), 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM unnest(v_sender_preferences) AS pref(value)
    WHERE lower(pref.value) = 'everyone'
       OR (lower(pref.value) = 'women' AND v_gender_norm IN ('woman','women','female'))
       OR (lower(pref.value) = 'men' AND v_gender_norm IN ('man','men','male'))
       OR (lower(pref.value) = 'non-binary people' AND v_gender_norm = 'nonbinary')
       OR regexp_replace(lower(pref.value), '[^a-z]', '', 'g') = v_gender_norm
  ) THEN
    RAISE EXCEPTION 'This profile does not match your dating preferences';
  END IF;

  v_gender_norm := regexp_replace(lower(trim(coalesce(v_sender_gender, ''))), '[^a-z]', '', 'g');
  IF coalesce(cardinality(v_recipient_preferences), 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM unnest(v_recipient_preferences) AS pref(value)
    WHERE lower(pref.value) = 'everyone'
       OR (lower(pref.value) = 'women' AND v_gender_norm IN ('woman','women','female'))
       OR (lower(pref.value) = 'men' AND v_gender_norm IN ('man','men','male'))
       OR (lower(pref.value) = 'non-binary people' AND v_gender_norm = 'nonbinary')
       OR regexp_replace(lower(pref.value), '[^a-z]', '', 'g') = v_gender_norm
  ) THEN
    RAISE EXCEPTION 'This profile does not match their dating preferences';
  END IF;

  SELECT id INTO v_existing
  FROM public.message_requests
  WHERE sender_id = p_recipient_id
    AND recipient_id = v_uid
    AND source_type = 'dating'
    AND source_id = (SELECT id FROM public.dating_profiles WHERE user_id = v_uid AND is_published LIMIT 1)
    AND status = 'pending'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    v_result := public.respond_direct_message_request_secure(v_existing, true);
    v_thread := (v_result->>'thread_id')::uuid;
    RETURN jsonb_build_object('status','matched','request_id',v_existing,'thread_id',v_thread);
  END IF;

  SELECT thread_id INTO v_thread
  FROM public.dating_matches
  WHERE status = 'matched'
    AND user_a = least(v_uid,p_recipient_id)
    AND user_b = greatest(v_uid,p_recipient_id)
  LIMIT 1;

  IF v_thread IS NOT NULL THEN
    RETURN jsonb_build_object('status','matched','thread_id',v_thread);
  END IF;

  v_existing := public.send_message_request(
    p_recipient_id,
    'dating',
    v_profile_id,
    'I would like to connect with you on Circle Panda Dating 💗'
  );
  RETURN jsonb_build_object('status','pending','request_id',v_existing);
END;
$function$;
