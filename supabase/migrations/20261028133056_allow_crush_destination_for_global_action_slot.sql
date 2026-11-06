CREATE OR REPLACE FUNCTION public.admin_configure_global_action_slot(
  p_enabled boolean,
  p_catalog_key text,
  p_action_key text,
  p_icon text,
  p_label text,
  p_description text,
  p_action_type text,
  p_destination text,
  p_popup_title text,
  p_popup_body text,
  p_target_url text DEFAULT NULL::text
)
RETURNS public.global_action_slot
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE updated_row public.global_action_slot;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role='admin'
  ) THEN
    RAISE EXCEPTION 'Administrator access is required';
  END IF;
  IF p_catalog_key NOT IN ('hot_seat','daily_activities','games','sweepstake_room','giveaway','sponsor_ad','confessions','dating','events','groups','wcw_mcm','messages','wallet','vip') THEN
    RAISE EXCEPTION 'Choose an activity from the library';
  END IF;
  IF p_action_key NOT IN ('HotSeat','DailyActivities','Wallet','Events','Groups','Dating','Messages','VIP','Confessions','Crush') OR
     p_destination NOT IN ('HotSeat','DailyActivities','Wallet','Events','Groups','Dating','Messages','VIP','Confessions','Crush') THEN
    RAISE EXCEPTION 'Choose a supported app destination';
  END IF;
  IF p_action_type NOT IN ('navigate','popup','ad','giveaway') THEN RAISE EXCEPTION 'Choose a supported click action'; END IF;
  IF length(trim(coalesce(p_icon,'')))=0 OR length(trim(p_icon))>12 THEN RAISE EXCEPTION 'Enter an icon (up to 12 characters)'; END IF;
  IF length(trim(coalesce(p_label,'')))=0 OR length(trim(p_label))>32 THEN RAISE EXCEPTION 'Enter a label between 1 and 32 characters'; END IF;
  IF length(coalesce(p_description,''))>180 THEN RAISE EXCEPTION 'Description must be 180 characters or fewer'; END IF;
  IF length(trim(coalesce(p_popup_title,'')))=0 OR length(trim(p_popup_title))>80 THEN RAISE EXCEPTION 'Enter a popup title up to 80 characters'; END IF;
  IF length(trim(coalesce(p_popup_body,'')))=0 OR length(trim(p_popup_body))>1500 THEN RAISE EXCEPTION 'Enter popup directions up to 1500 characters'; END IF;
  IF p_target_url IS NOT NULL AND length(trim(p_target_url))>0 AND p_target_url !~ '^https?://' THEN RAISE EXCEPTION 'Ad links must begin with http:// or https://'; END IF;
  UPDATE public.global_action_slot
    SET enabled=p_enabled,catalog_key=p_catalog_key,action_key=p_action_key,icon=trim(p_icon),label=trim(p_label),
      description=trim(coalesce(p_description,'')),action_type=p_action_type,destination=p_destination,
      popup_title=trim(p_popup_title),popup_body=trim(p_popup_body),
      target_url=nullif(trim(coalesce(p_target_url,'')),''),updated_at=now(),updated_by=auth.uid()
    WHERE slot_key='primary' RETURNING * INTO updated_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Global activity slot is not initialized'; END IF;
  RETURN updated_row;
END;
$function$;
