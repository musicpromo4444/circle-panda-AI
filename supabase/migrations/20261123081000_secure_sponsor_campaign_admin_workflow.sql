begin;

-- All sponsor campaign mutations are centralized in one authenticated admin
-- RPC. The RPC records an audit entry and derives created_by from auth.uid().
create or replace function public.admin_manage_sponsor_campaign(
  p_action text,
  p_campaign_id uuid default null,
  p_sponsor_name text default null,
  p_campaign_name text default null,
  p_description text default '',
  p_format text default 'native',
  p_target_url text default null,
  p_countries text[] default '{}'::text[],
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_budget_naira numeric default 0,
  p_cpm_naira numeric default 0,
  p_target_impressions bigint default 0,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_campaign public.sponsor_campaigns%rowtype;
  v_target_url text;
  v_countries text[];
  v_reveal_sponsor_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in is required';
  end if;

  if not exists (
    select 1
    from public.user_roles r
    where r.user_id = v_uid
      and r.role = 'admin'
  ) then
    raise exception 'Administrator access required';
  end if;

  if p_action is null or p_action not in ('create', 'set_status') then
    raise exception 'Unsupported sponsor campaign action';
  end if;

  if p_action = 'create' then
    if p_campaign_id is not null or p_status is not null then
      raise exception 'A new sponsor campaign must be created as a draft';
    end if;

    if p_sponsor_name is null
       or char_length(btrim(p_sponsor_name)) not between 1 and 160 then
      raise exception 'Sponsor name must contain 1 to 160 characters';
    end if;

    if p_campaign_name is null
       or char_length(btrim(p_campaign_name)) not between 1 and 160 then
      raise exception 'Campaign name must contain 1 to 160 characters';
    end if;

    if char_length(btrim(coalesce(p_description, ''))) not between 1 and 2000 then
      raise exception 'Campaign description must contain 1 to 2000 characters';
    end if;

    if p_format is null or p_format not in (
      'direct_sponsor', 'native', 'sponsor_reveal', 'banner',
      'interstitial', 'playable', 'rewarded'
    ) then
      raise exception 'Unsupported sponsor campaign format';
    end if;

    if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
      raise exception 'Campaign end time must follow its start time';
    end if;

    if p_budget_naira is null or p_budget_naira <= 0
       or p_cpm_naira is null or p_cpm_naira <= 0 then
      raise exception 'Campaign budget and CPM must be positive';
    end if;

    if p_target_impressions is null or p_target_impressions < 1 then
      raise exception 'Target impressions must be a positive whole number';
    end if;

    v_target_url := nullif(btrim(p_target_url), '');
    if v_target_url is not null
       and v_target_url !~* '^https://[^[:space:]]+$' then
      raise exception 'Campaign target URL must be a valid HTTPS URL';
    end if;

    select coalesce(array_agg(normalized.country order by normalized.country), array[]::text[])
    into v_countries
    from (
      select distinct btrim(input.country) as country
      from unnest(coalesce(p_countries, array[]::text[])) as input(country)
      where btrim(input.country) <> ''
    ) normalized;

    if cardinality(v_countries) not between 1 and 20 then
      raise exception 'Choose between 1 and 20 campaign countries';
    end if;

    if exists (
      select 1
      from unnest(v_countries) as selected(country)
      where char_length(selected.country) > 80
    ) then
      raise exception 'Each country value must be at most 80 characters';
    end if;

    insert into public.sponsor_campaigns (
      sponsor_name,
      campaign_name,
      description,
      format,
      target_url,
      countries,
      status,
      starts_at,
      ends_at,
      budget_naira,
      cpm_naira,
      target_impressions,
      created_by
    )
    values (
      btrim(p_sponsor_name),
      btrim(p_campaign_name),
      btrim(p_description),
      p_format,
      v_target_url,
      v_countries,
      'draft',
      p_starts_at,
      p_ends_at,
      p_budget_naira,
      p_cpm_naira,
      p_target_impressions,
      v_uid
    )
    returning * into v_campaign;

    insert into public.admin_audit_log (
      actor_id, action, target_type, target_id, details
    )
    values (
      v_uid,
      'sponsor_campaign_created',
      'sponsor_campaign',
      v_campaign.id,
      jsonb_build_object(
        'sponsor_name', v_campaign.sponsor_name,
        'campaign_name', v_campaign.campaign_name,
        'format', v_campaign.format,
        'status', v_campaign.status
      )
    );

    return jsonb_build_object(
      'action', 'created',
      'campaign', to_jsonb(v_campaign)
    );
  end if;

  if p_campaign_id is null then
    raise exception 'A campaign ID is required for status changes';
  end if;

  if p_status is null or p_status not in ('active', 'paused', 'completed') then
    raise exception 'Choose a supported campaign status';
  end if;

  select c.* into v_campaign
  from public.sponsor_campaigns c
  where c.id = p_campaign_id
  for update;

  if not found then
    raise exception 'Sponsor campaign not found';
  end if;

  if v_campaign.status = p_status then
    return jsonb_build_object(
      'action', 'unchanged',
      'campaign', to_jsonb(v_campaign)
    );
  end if;

  if not (
    (v_campaign.status = 'draft' and p_status = 'active')
    or (v_campaign.status = 'active' and p_status in ('paused', 'completed'))
    or (v_campaign.status = 'paused' and p_status in ('active', 'completed'))
  ) then
    raise exception 'This sponsor campaign status transition is not allowed';
  end if;

  if p_status = 'active' and v_campaign.ends_at <= now() then
    raise exception 'An expired campaign cannot be activated';
  end if;

  if p_status = 'active' and v_campaign.target_impressions <= v_campaign.impressions then
    raise exception 'Campaign impression target has already been reached';
  end if;

  update public.sponsor_campaigns
  set status = p_status,
      updated_at = now()
  where id = p_campaign_id
  returning * into v_campaign;

  insert into public.admin_audit_log (
    actor_id, action, target_type, target_id, details
  )
  values (
    v_uid,
    'sponsor_campaign_status_changed',
    'sponsor_campaign',
    v_campaign.id,
    jsonb_build_object(
      'campaign_name', v_campaign.campaign_name,
      'format', v_campaign.format,
      'new_status', v_campaign.status
    )
  );

  select count(distinct lower(btrim(c.sponsor_name)))::integer
  into v_reveal_sponsor_count
  from public.sponsor_campaigns c
  where c.status = 'active'
    and c.format = 'sponsor_reveal'
    and c.starts_at <= now()
    and c.ends_at > now();

  return jsonb_build_object(
    'action', 'status_changed',
    'campaign', to_jsonb(v_campaign),
    'active_sponsor_reveal_sponsors', v_reveal_sponsor_count,
    'guess_sponsor_ready', v_reveal_sponsor_count >= 2
  );
end
$function$;

revoke all on function public.admin_manage_sponsor_campaign(
  text, uuid, text, text, text, text, text, text[],
  timestamptz, timestamptz, numeric, numeric, bigint, text
) from public, anon, authenticated, service_role;
grant execute on function public.admin_manage_sponsor_campaign(
  text, uuid, text, text, text, text, text, text[],
  timestamptz, timestamptz, numeric, numeric, bigint, text
) to authenticated;

-- The browser can still read campaigns through the existing RLS policies,
-- but all campaign writes must pass through the validated, audited RPC.
revoke insert, update, delete on table public.sponsor_campaigns from anon, authenticated;
grant select on table public.sponsor_campaigns to authenticated;

comment on function public.admin_manage_sponsor_campaign(
  text, uuid, text, text, text, text, text, text[],
  timestamptz, timestamptz, numeric, numeric, bigint, text
) is
  'Creates draft sponsor campaigns and manages safe status transitions for authenticated administrators. Derives actor identity, validates database-supported formats and HTTPS destinations, and writes admin audit history.';

commit;
