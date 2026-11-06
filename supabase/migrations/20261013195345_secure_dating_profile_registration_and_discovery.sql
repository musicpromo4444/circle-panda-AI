
create or replace function public.register_dating_profile_secure(
 p_vibe text, p_about_traits text[], p_interests text[], p_relationship_goal text,
 p_looking_for text[], p_lifestyle text[], p_personality text[], p_love_language text,
 p_smoking text, p_drinking text, p_children text, p_education text, p_occupation text,
 p_sexual_experience text, p_intimacy_preference text, p_height_cm integer, p_zodiac text,
 p_favorite_date text, p_emoji text, p_photo_path text, p_blurred_photo_path text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
 v_uid uuid := auth.uid();
 v_profile public.profiles%rowtype;
 v_age integer;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 select * into v_profile from public.profiles where id = v_uid for update;
 if not found then raise exception 'Complete your Circle Panda profile first'; end if;
 v_age := coalesce(v_profile.age, extract(year from age(current_date, v_profile.date_of_birth))::integer);
 if v_age is null or v_age < 18 then raise exception 'Dating is available to adults aged 18 and over'; end if;
 if coalesce(trim(v_profile.gender),'') = '' or coalesce(trim(v_profile.country),'') = '' then
   raise exception 'Complete your gender and country in your Circle Panda profile first';
 end if;
 if coalesce(trim(p_relationship_goal),'') = '' then raise exception 'Choose a relationship goal'; end if;
 if coalesce(trim(p_photo_path),'') = '' or coalesce(trim(p_blurred_photo_path),'') = '' then
   raise exception 'Upload a Dating photo before publishing';
 end if;
 insert into public.dating_profiles(
  user_id,headline,about,personality,sexual_experience,looking_for,photos,is_published,
  name,age,vibe,emoji,bio,interests,location,country,state_province,gender,relationship_goal,
  about_traits,lifestyle,personality_tags,love_language,smoking,drinking,children,education,
  occupation,intimacy_preference,relationship_status,height_cm,zodiac,favorite_date,photo_path,
  blurred_photo_path,updated_at
 ) values (
  v_uid,left(coalesce(p_vibe,''),160),'',array_to_string(coalesce(p_personality,'{}'::text[]),', '),
  coalesce(p_sexual_experience,''),array_to_string(coalesce(p_looking_for,'{}'::text[]),', '),
  array[p_blurred_photo_path],true,
  coalesce(nullif(trim(v_profile.display_name),''),'Anonymous Panda'),v_age,coalesce(p_vibe,''),
  coalesce(nullif(p_emoji,''),'🐼'),'',
  coalesce(p_interests,'{}'::text[]),
  coalesce(nullif(v_profile.area,''),nullif(v_profile.city,''),nullif(v_profile.state_province,''),nullif(v_profile.state,''),v_profile.country,''),
  v_profile.country,coalesce(v_profile.state_province,v_profile.state),v_profile.gender,p_relationship_goal,
  coalesce(p_about_traits,'{}'::text[]),coalesce(p_lifestyle,'{}'::text[]),coalesce(p_personality,'{}'::text[]),
  '',coalesce(p_smoking,''),coalesce(p_drinking,''),coalesce(p_children,''),coalesce(p_education,''),
  coalesce(p_occupation,''),'','single',null,'','',p_photo_path,p_blurred_photo_path,now()
 )
 on conflict (user_id) do update set
  headline=excluded.headline,about='',personality=excluded.personality,
  sexual_experience=excluded.sexual_experience,looking_for=excluded.looking_for,photos=excluded.photos,
  is_published=true,name=excluded.name,age=excluded.age,vibe=excluded.vibe,emoji=excluded.emoji,
  interests=excluded.interests,location=excluded.location,country=excluded.country,
  state_province=excluded.state_province,gender=excluded.gender,relationship_goal=excluded.relationship_goal,
  about_traits=excluded.about_traits,lifestyle=excluded.lifestyle,personality_tags=excluded.personality_tags,
  love_language='',smoking=excluded.smoking,drinking=excluded.drinking,children=excluded.children,
  education=excluded.education,occupation=excluded.occupation,intimacy_preference='',
  relationship_status='single',height_cm=null,zodiac='',favorite_date='',photo_path=excluded.photo_path,
  blurred_photo_path=excluded.blurred_photo_path,updated_at=now();
 return true;
end;
$$;

create or replace function public.get_my_dating_profile_secure()
returns jsonb language sql stable security definer set search_path = ''
as $$
 select jsonb_build_object(
  'user_id',d.user_id,'name',d.name,'age',d.age,'vibe',d.vibe,'emoji',d.emoji,'bio',d.bio,
  'interests',d.interests,'location',d.location,'country',d.country,'state_province',d.state_province,
  'gender',d.gender,'relationship_goal',d.relationship_goal,'looking_for',string_to_array(coalesce(d.looking_for,''),', '),
  'about_traits',d.about_traits,'lifestyle',d.lifestyle,'personality',d.personality_tags,
  'love_language',d.love_language,'smoking',d.smoking,'drinking',d.drinking,'children',d.children,
  'education',d.education,'occupation',d.occupation,'sexual_experience',d.sexual_experience,
  'intimacy_preference',d.intimacy_preference,'relationship_status',d.relationship_status,
  'height_cm',d.height_cm,'zodiac',d.zodiac,'favorite_date',d.favorite_date,
  'photo_path',d.photo_path,'blurred_photo_path',d.blurred_photo_path,'updated_at',d.updated_at
 ) from public.dating_profiles d where d.user_id=auth.uid() and d.is_published=true limit 1;
$$;

create or replace function public.get_dating_discovery_filters_secure(
 p_age_min integer default 18,p_age_max integer default 120,p_country text default '',
 p_state text default '',p_location text default '',p_gender text default '',
 p_relationship_goal text default '',p_looking_for text default '',p_lifestyle text default '',
 p_smoking text default '',p_drinking text default '',p_children text default '',p_education text default ''
) returns setof jsonb language sql stable security definer set search_path = ''
as $$
 select jsonb_build_object(
  'user_id',d.user_id,'name',d.name,'age',d.age,'vibe',d.vibe,'emoji',d.emoji,'bio',d.bio,
  'interests',d.interests,'location',d.location,'country',d.country,'state_province',d.state_province,
  'gender',d.gender,'relationship_goal',d.relationship_goal,'looking_for',string_to_array(coalesce(d.looking_for,''),', '),
  'about_traits',d.about_traits,'lifestyle',d.lifestyle,'personality',d.personality_tags,
  'love_language',d.love_language,'smoking',d.smoking,'drinking',d.drinking,'children',d.children,
  'education',d.education,'occupation',d.occupation,'sexual_experience',d.sexual_experience,
  'intimacy_preference',d.intimacy_preference,'relationship_status',d.relationship_status,
  'height_cm',d.height_cm,'zodiac',d.zodiac,'favorite_date',d.favorite_date,
  'photo_path',d.photo_path,'blurred_photo_path',d.blurred_photo_path,'updated_at',d.updated_at
 )
 from public.dating_profiles d
 where d.is_published=true and d.user_id<>auth.uid()
 and d.age>=greatest(coalesce(p_age_min,18),18) and d.age<=least(coalesce(p_age_max,120),120)
 and (coalesce(p_country,'')='' or lower(coalesce(d.country,''))=lower(p_country))
 and (coalesce(p_state,'')='' or lower(coalesce(d.state_province,''))=lower(p_state))
 and (coalesce(p_location,'')='' or lower(coalesce(d.location,'')) like '%'||lower(p_location)||'%')
 and (coalesce(p_gender,'')='' or lower(coalesce(d.gender,''))=lower(p_gender))
 and (coalesce(p_relationship_goal,'')='' or lower(coalesce(d.relationship_goal,'')) like '%'||lower(p_relationship_goal)||'%')
 and (coalesce(p_looking_for,'')='' or lower(coalesce(d.looking_for,'')) like '%'||lower(p_looking_for)||'%')
 and (coalesce(p_lifestyle,'')='' or lower(array_to_string(d.lifestyle,' ')) like '%'||lower(p_lifestyle)||'%')
 and (coalesce(p_smoking,'')='' or lower(coalesce(d.smoking,''))=lower(p_smoking))
 and (coalesce(p_drinking,'')='' or lower(coalesce(d.drinking,''))=lower(p_drinking))
 and (coalesce(p_children,'')='' or lower(coalesce(d.children,''))=lower(p_children))
 and (coalesce(p_education,'')='' or lower(coalesce(d.education,''))=lower(p_education))
 order by d.updated_at desc;
$$;

revoke all on function public.register_dating_profile_secure(text,text[],text[],text,text[],text[],text[],text,text,text,text,text,text,text,text,integer,text,text,text,text,text) from public,anon;
grant execute on function public.register_dating_profile_secure(text,text[],text[],text,text[],text[],text[],text,text,text,text,text,text,text,text,integer,text,text,text,text,text) to authenticated;
revoke all on function public.get_my_dating_profile_secure() from public,anon;
grant execute on function public.get_my_dating_profile_secure() to authenticated;
revoke all on function public.get_dating_discovery_filters_secure(integer,integer,text,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.get_dating_discovery_filters_secure(integer,integer,text,text,text,text,text,text,text,text,text,text,text) to authenticated;
