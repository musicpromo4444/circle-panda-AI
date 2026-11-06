-- Do not expose a user's date of birth to other signed-in users.
revoke select on table public.profiles from authenticated;
grant select (id, username, display_name, avatar_url, country, state, area, gender, bio, is_vip, created_at, updated_at)
on table public.profiles to authenticated;

create or replace function public.get_my_date_of_birth()
returns date language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  return (select p.date_of_birth from public.profiles p where p.id = auth.uid());
end;
$$;
revoke all on function public.get_my_date_of_birth() from public;
grant execute on function public.get_my_date_of_birth() to authenticated;

create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then return false; end if;
  return exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
  );
end;
$$;
revoke all on function public.is_conversation_member(uuid, uuid) from public;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
