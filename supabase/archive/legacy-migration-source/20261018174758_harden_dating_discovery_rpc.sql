-- Harden the legacy Dating discovery RPC: actual DOB is authoritative, and
-- do not return the removed legacy intimacy/love-language/favorite-date fields.
CREATE OR REPLACE FUNCTION public.get_dating_discovery_filters_secure(
  p_age_min integer DEFAULT 18,
  p_age_max integer DEFAULT 120,
  p_country text DEFAULT '',
  p_state text DEFAULT '',
  p_location text DEFAULT '',
  p_gender text DEFAULT '',
  p_relationship_goal text DEFAULT '',
  p_looking_for text DEFAULT '',
  p_lifestyle text DEFAULT '',
  p_smoking text DEFAULT '',
  p_drinking text DEFAULT '',
  p_children text DEFAULT '',
  p_education text DEFAULT ''
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'user_id', d.user_id,
    'name', coalesce(d.name, p.display_name, p.username, 'Panda'),
    'age', extract(year FROM age(current_date, p.date_of_birth))::integer,
    'headline', d.headline,
    'about', coalesce(d.about, d.bio),
    'bio', coalesce(d.about, d.bio),
    'vibe', d.vibe,
    'emoji', d.emoji,
    'interests', d.interests,
    'location', d.location,
    'country', coalesce(d.country, p.country),
    'state_province', coalesce(d.state_province, p.state_province, p.state),
    'gender', p.gender,
    'relationship_goal', d.relationship_goal,
    'looking_for', d.looking_for,
    'personality', d.personality,
    'personality_tags', d.personality_tags,
    'smoking', d.smoking,
    'drinking', d.drinking,
    'children', d.children,
    'education', d.education,
    'occupation', d.occupation,
    'sexual_experience', d.sexual_experience,
    'photo_path', d.photo_path,
    'blurred_photo_path', d.blurred_photo_path,
    'gender_preferences', d.gender_preferences,
    'preferred_age_min', d.preferred_age_min,
    'preferred_age_max', d.preferred_age_max,
    'long_distance_ok', d.long_distance_ok,
    'communication_style', d.communication_style,
    'relationship_values', d.relationship_values,
    'ideal_weekend', d.ideal_weekend,
    'conversation_topic', d.conversation_topic,
    'smile_prompt', d.smile_prompt,
    'updated_at', d.updated_at
  )
  FROM public.dating_profiles AS d
  JOIN public.profiles AS p ON p.id = d.user_id
  WHERE d.is_published = true
    AND d.user_id <> (SELECT auth.uid())
    AND p.date_of_birth IS NOT NULL
    AND p.date_of_birth <= (current_date - interval '18 years')::date
    AND extract(year FROM age(current_date, p.date_of_birth))::integer >= greatest(coalesce(p_age_min, 18), 18)
    AND extract(year FROM age(current_date, p.date_of_birth))::integer <= least(coalesce(p_age_max, 120), 120)
    AND (coalesce(p_country, '') = '' OR lower(coalesce(d.country, p.country, '')) = lower(p_country))
    AND (coalesce(p_state, '') = '' OR lower(coalesce(d.state_province, p.state_province, p.state, '')) = lower(p_state))
    AND (coalesce(p_location, '') = '' OR lower(concat_ws(' ', d.location, p.city, p.area)) LIKE '%' || lower(p_location) || '%')
    AND (coalesce(p_gender, '') = '' OR lower(coalesce(p.gender, '')) = lower(p_gender))
    AND (coalesce(p_relationship_goal, '') = '' OR lower(coalesce(d.relationship_goal, '')) LIKE '%' || lower(p_relationship_goal) || '%')
    AND (coalesce(p_looking_for, '') = '' OR lower(array_to_string(d.looking_for, ' ')) LIKE '%' || lower(p_looking_for) || '%')
    AND (coalesce(p_lifestyle, '') = '' OR lower(array_to_string(d.lifestyle, ' ')) LIKE '%' || lower(p_lifestyle) || '%')
    AND (coalesce(p_smoking, '') = '' OR lower(coalesce(d.smoking, '')) = lower(p_smoking))
    AND (coalesce(p_drinking, '') = '' OR lower(coalesce(d.drinking, '')) = lower(p_drinking))
    AND (coalesce(p_children, '') = '' OR lower(coalesce(d.children, '')) = lower(p_children))
    AND (coalesce(p_education, '') = '' OR lower(coalesce(d.education, '')) = lower(p_education))
  ORDER BY d.updated_at DESC;
$function$;
