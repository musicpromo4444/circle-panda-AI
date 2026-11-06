alter table public.dating_profiles
  add column if not exists gender_preferences text[] not null default '{}',
  add column if not exists preferred_age_min integer not null default 18,
  add column if not exists preferred_age_max integer not null default 99,
  add column if not exists long_distance_ok boolean not null default false,
  add column if not exists communication_style text,
  add column if not exists relationship_values text[] not null default '{}',
  add column if not exists ideal_weekend text,
  add column if not exists conversation_topic text,
  add column if not exists smile_prompt text;
alter table public.dating_profiles
  add constraint dating_profiles_preferred_age_range_check
  check (preferred_age_min >= 18 and preferred_age_max >= preferred_age_min and preferred_age_max <= 120);
