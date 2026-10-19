-- Social sign-in buttons are shown only when an administrator enables the provider.
insert into public.economy_settings(setting_key,numeric_value,updated_at)
values ('google_auth_enabled',0,now()),('apple_auth_enabled',0,now())
on conflict(setting_key) do nothing;

create or replace function public.get_public_auth_provider_settings()
returns table(google_enabled boolean,apple_enabled boolean)
language sql stable security definer set search_path to ''
as $function$
  select
    coalesce(max(es.numeric_value) filter (where es.setting_key='google_auth_enabled'),0)=1,
    coalesce(max(es.numeric_value) filter (where es.setting_key='apple_auth_enabled'),0)=1
  from public.economy_settings es;
$function$;

revoke all on function public.get_public_auth_provider_settings() from public;
grant execute on function public.get_public_auth_provider_settings() to anon, authenticated;
