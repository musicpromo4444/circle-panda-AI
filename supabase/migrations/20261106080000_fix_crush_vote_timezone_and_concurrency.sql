-- Keep free and paid weekly Crush votes on the voter's local week.
-- Serialize each voter's free/paid vote claims so parallel requests cannot exceed the weekly quota.
CREATE OR REPLACE FUNCTION public.cast_crush_vote(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_post public.crush_posts%rowtype;
  v_votes integer;
  v_count integer;
  v_timezone text;
  v_week_start timestamptz;
  v_week_date date;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in to vote';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('circle-panda:crush-vote:' || v_user::text, 0)
  );

  SELECT * INTO v_post
  FROM public.crush_posts
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crush post not found';
  END IF;
  IF v_post.user_id = v_user THEN
    RAISE EXCEPTION 'You cannot vote for your own crush post';
  END IF;
  IF v_post.scheduled_for > now() THEN
    RAISE EXCEPTION 'This crush card is not live yet';
  END IF;

  SELECT p.timezone INTO v_timezone
  FROM public.profiles p
  WHERE p.id = v_user;

  IF coalesce(v_timezone, '') = ''
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_timezone_names z
       WHERE z.name = v_timezone
     ) THEN
    v_timezone := 'UTC';
  END IF;

  v_week_date := date_trunc('week', now() AT TIME ZONE v_timezone)::date;
  v_week_start := v_week_date::timestamp AT TIME ZONE v_timezone;

  IF v_post.week_start IS DISTINCT FROM v_week_date THEN
    RAISE EXCEPTION 'Voting for this week has closed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.crush_votes
    WHERE post_id = p_post_id AND user_id = v_user
  ) THEN
    RETURN jsonb_build_object('voted', true, 'already_voted', true);
  END IF;

  SELECT count(*)::integer INTO v_votes
  FROM public.crush_votes cv
  WHERE cv.user_id = v_user
    AND cv.created_at >= v_week_start
    AND cv.created_at < v_week_start + interval '7 days';

  IF v_votes >= 3 THEN
    RAISE EXCEPTION 'FREE_VOTES_EXHAUSTED';
  END IF;

  INSERT INTO public.crush_votes(post_id, user_id)
  VALUES (p_post_id, v_user);

  SELECT count(*)::integer INTO v_count
  FROM public.crush_votes
  WHERE post_id = p_post_id;

  PERFORM public.award_xp_for_activity(v_user, 'wcw_vote', p_post_id);

  RETURN jsonb_build_object(
    'voted', true,
    'free_votes_used', v_votes + 1,
    'post_votes', v_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cast_crush_vote_secure(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in is required';
  END IF;

  -- The underlying function performs the same timezone-aware quota check
  -- under the per-user transaction lock.
  RETURN public.cast_crush_vote(p_post_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cast_crush_vote_paid_secure(p_nominee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_post public.crush_posts%rowtype;
  v_used integer;
  v_limit integer;
  v_cost bigint;
  v_balance bigint;
  v_timezone text;
  v_week_start timestamptz;
  v_week_date date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in is required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('circle-panda:crush-vote:' || v_uid::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.crush_votes
    WHERE post_id = p_nominee_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('voted', true, 'already_voted', true, 'charged_bc', 0);
  END IF;

  SELECT * INTO v_post
  FROM public.crush_posts
  WHERE id = p_nominee_id
    AND user_id <> v_uid
    AND scheduled_for <= now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can vote only for another Panda''s live crush card';
  END IF;

  SELECT p.timezone INTO v_timezone
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

  v_week_date := date_trunc('week', now() AT TIME ZONE v_timezone)::date;
  v_week_start := v_week_date::timestamp AT TIME ZONE v_timezone;

  IF v_post.week_start IS DISTINCT FROM v_week_date THEN
    RAISE EXCEPTION 'Voting for this week has closed';
  END IF;

  SELECT coalesce(numeric_value, 3)::integer INTO v_limit
  FROM public.economy_settings
  WHERE setting_key = 'weekly_free_votes';
  v_limit := greatest(0, coalesce(v_limit, 3));

  SELECT count(*)::integer INTO v_used
  FROM public.crush_votes
  WHERE user_id = v_uid
    AND created_at >= v_week_start
    AND created_at < v_week_start + interval '7 days';

  IF v_used < v_limit THEN
    RAISE EXCEPTION 'Use your free weekly votes before buying an extra vote';
  END IF;

  SELECT coalesce(numeric_value, 50)::bigint INTO v_cost
  FROM public.economy_settings
  WHERE setting_key = 'extra_vote_cost';
  v_cost := coalesce(v_cost, 50);

  IF v_cost < 0 THEN
    RAISE EXCEPTION 'Extra vote cost cannot be negative';
  END IF;

  INSERT INTO public.wallet_accounts(user_id, bc_balance)
  VALUES (v_uid, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT bc_balance INTO v_balance
  FROM public.wallet_accounts
  WHERE user_id = v_uid
  FOR UPDATE;

  IF coalesce(v_balance, 0) < v_cost THEN
    RAISE EXCEPTION 'Not enough BC for an extra vote';
  END IF;

  UPDATE public.wallet_accounts
  SET bc_balance = bc_balance - v_cost,
      updated_at = now()
  WHERE user_id = v_uid;

  INSERT INTO public.wallet_transactions(user_id, currency, amount, reason, reference_id)
  VALUES (v_uid, 'BC', -v_cost, 'crush:extra_vote', p_nominee_id);

  INSERT INTO public.crush_votes(post_id, user_id)
  VALUES (p_nominee_id, v_uid);

  PERFORM public.award_xp_for_activity(v_uid, 'wcw_vote', p_nominee_id);

  RETURN jsonb_build_object(
    'voted', true,
    'charged_bc', v_cost,
    'balance', v_balance - v_cost
  );
END;
$function$;
