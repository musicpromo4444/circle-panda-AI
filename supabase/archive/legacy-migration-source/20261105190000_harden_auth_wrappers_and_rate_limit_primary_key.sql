-- Add a stable primary key to the internal signup rate-limit table.
-- The table was empty at rollout; existing inserts may continue omitting id.
ALTER TABLE public.signup_rate_limits
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.signup_rate_limits
  ALTER COLUMN id SET NOT NULL;
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.signup_rate_limits'::regclass
      AND conname = 'signup_rate_limits_pkey'
  ) THEN
    ALTER TABLE public.signup_rate_limits
      ADD CONSTRAINT signup_rate_limits_pkey PRIMARY KEY (id);
  END IF;
END;
$constraint$;

-- Make the authentication boundary explicit in SECURITY DEFINER RPC wrappers.
CREATE OR REPLACE FUNCTION public.claim_economy_reward(p_reward_key text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if p_reward_key = 'first_activity_reward' then
    raise exception 'The first-activity reward is granted automatically after your first activity';
  end if;
  if p_reward_key = 'ad_reward' then
    raise exception 'Ad rewards are only credited after trusted ad-completion verification';
  end if;
  if p_reward_key <> 'daily_login_reward' then
    raise exception 'This reward cannot be claimed directly';
  end if;
  return public.claim_economy_reward_internal(p_reward_key);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_group(
  p_name text,
  p_about text DEFAULT ''::text,
  p_limitations text DEFAULT NULL::text,
  p_country_restriction text DEFAULT NULL::text,
  p_is_vip boolean DEFAULT false,
  p_vip_scope text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_id uuid; v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 v_id:=public.create_chat_group(p_name,p_about,p_country_restriction,p_is_vip);
 update public.chat_groups
   set about=left(coalesce(p_about,''),2000),
       limitations=left(coalesce(p_limitations,''),2000),
       vip_scope=p_vip_scope
   where id=v_id and creator_id=v_uid;
 if not found then raise exception 'Group creation was not authorized'; end if;
 insert into public.group_settings(group_id) values(v_id) on conflict(group_id) do nothing;
 return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_context_message_secure(
  p_recipient_id uuid,
  p_message text,
  p_context_type text,
  p_context_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_id uuid; v_source text := p_context_type;
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if v_source not in ('dating','event','group','feed','profile','wcw','mcm','confession') then
   raise exception 'Unsupported message request source';
 end if;
 v_id := public.send_message_request(p_recipient_id,v_source,p_context_id,p_message);
 return jsonb_build_object('id',v_id,'status','pending');
end;
$function$;
