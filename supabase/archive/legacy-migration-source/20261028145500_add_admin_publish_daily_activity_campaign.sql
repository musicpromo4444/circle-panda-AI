CREATE OR REPLACE FUNCTION public.admin_publish_daily_activity_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role='admin'
  ) THEN RAISE EXCEPTION 'Administrator access is required'; END IF;
  UPDATE public.daily_activity_campaigns
  SET status='open', updated_at=now()
  WHERE id=p_campaign_id
    AND status='draft'
    AND (ends_at IS NULL OR ends_at > now());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This draft cannot be opened. Check its status and end time.';
  END IF;
  RETURN jsonb_build_object('opened',true,'campaign_id',p_campaign_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_publish_daily_activity_campaign(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_daily_activity_campaign(uuid) TO authenticated;
