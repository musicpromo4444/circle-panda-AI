-- Persist the registration country used for country-targeted communities and sponsor campaigns.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_bonus bigint := 0;
begin
  insert into public.profiles(id, display_name, username, country)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    nullif(new.raw_user_meta_data ->> 'username',''),
    nullif(trim(new.raw_user_meta_data ->> 'country'),'')
  )
  on conflict (id) do nothing;

  select es.numeric_value into v_bonus
  from public.economy_settings es where es.setting_key = 'welcome_bonus';
  v_bonus := coalesce(v_bonus, 0);

  insert into public.wallet_accounts(user_id, bc_balance)
  values (new.id, v_bonus)
  on conflict (user_id) do nothing;

  insert into public.wallet_transactions(user_id, currency, amount, reason)
  values (new.id, 'BC', v_bonus, 'reward:welcome_bonus')
  on conflict do nothing;

  insert into public.user_xp(user_id, xp_total, level_name)
  values (new.id, 0, 'Novice')
  on conflict (user_id) do nothing;

  return new;
end;
$$;
