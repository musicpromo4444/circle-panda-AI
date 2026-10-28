CREATE OR REPLACE FUNCTION public.admin_create_daily_activity_campaign(
  p_campaign_type text,
  p_title text,
  p_description text,
  p_icon text,
  p_prize_type text,
  p_prize_amount bigint,
  p_prize_label text,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone,
  p_max_entries integer,
  p_status text
)
RETURNS public.daily_activity_campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE c public.daily_activity_campaigns; effective_start timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role='admin'
  ) THEN RAISE EXCEPTION 'Administrator access is required'; END IF;
  IF p_campaign_type NOT IN ('sweepstake','challenge','gift','giveaway','icon') THEN
    RAISE EXCEPTION 'Choose a valid activity type';
  END IF;
  IF p_prize_type NOT IN ('BC','WC','gift','icon','badge') THEN
    RAISE EXCEPTION 'Choose a valid reward type';
  END IF;
  IF length(trim(coalesce(p_title,''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Enter an activity title';
  END IF;
  IF length(coalesce(p_description,'')) > 2000 THEN
    RAISE EXCEPTION 'Description must be 2000 characters or fewer';
  END IF;
  IF length(trim(coalesce(p_icon,''))) > 12 THEN
    RAISE EXCEPTION 'Icon must be 12 characters or fewer';
  END IF;
  IF length(coalesce(p_prize_label,'')) > 120 THEN
    RAISE EXCEPTION 'Prize label must be 120 characters or fewer';
  END IF;
  IF coalesce(p_prize_amount,0) < 0 THEN
    RAISE EXCEPTION 'Reward amount cannot be negative';
  END IF;
  IF p_status NOT IN ('draft','open') THEN
    RAISE EXCEPTION 'Initial status must be draft or open';
  END IF;
  IF p_max_entries IS NOT NULL AND p_max_entries < 1 THEN
    RAISE EXCEPTION 'Maximum entries must be at least one';
  END IF;
  effective_start := coalesce(p_starts_at,now());
  IF p_ends_at IS NOT NULL AND p_ends_at <= effective_start THEN
    RAISE EXCEPTION 'End time must be later than the start time';
  END IF;
  INSERT INTO public.daily_activity_campaigns(
    campaign_type,title,description,icon,prize_type,prize_amount,prize_label,
    starts_at,ends_at,max_entries,status,created_by
  )
  VALUES(
    p_campaign_type,trim(p_title),coalesce(p_description,''),
    coalesce(nullif(trim(p_icon),''),'🎁'),p_prize_type,coalesce(p_prize_amount,0),
    coalesce(p_prize_label,''),effective_start,p_ends_at,p_max_entries,p_status,auth.uid()
  )
  RETURNING * INTO c;
  RETURN c;
END;
$function$;
