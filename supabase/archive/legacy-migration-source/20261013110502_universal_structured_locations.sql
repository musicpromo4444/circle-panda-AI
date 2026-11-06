-- Universal structured location fields for Circle Panda.
-- Existing country/state/area data is preserved; new city and event area fields are additive.
alter table public.profiles
  add column if not exists city text;

alter table public.events
  add column if not exists city text,
  add column if not exists area text;

create index if not exists profiles_country_state_city_idx
  on public.profiles (country, state, city);

create index if not exists events_country_state_city_idx
  on public.events (country, state, city);
