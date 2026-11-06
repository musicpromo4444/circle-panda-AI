
create or replace function public.decide_dating_match_secure(p_match_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_match public.dating_matches%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if p_decision not in ('ignore','continue') then raise exception 'Invalid Dating decision'; end if;
 select * into v_match from public.dating_matches where id=p_match_id and (user_a=auth.uid() or user_b=auth.uid()) for update;
 if not found then raise exception 'Dating match not found'; end if;
 if p_decision='ignore' then
   update public.dating_matches set status='ignored',updated_at=now() where id=p_match_id;
   return jsonb_build_object('status','ignored');
 end if;
 if now() < v_match.free_until then raise exception 'The 72-hour Dating waiting period is still active'; end if;
 update public.dating_matches set
   user_a_confirmed=case when user_a=auth.uid() then true else user_a_confirmed end,
   user_b_confirmed=case when user_b=auth.uid() then true else user_b_confirmed end,
   photos_revealed=(case when user_a=auth.uid() then true else user_a_confirmed end)
                   and (case when user_b=auth.uid() then true else user_b_confirmed end),
   updated_at=now()
 where id=p_match_id returning * into v_match;
 return jsonb_build_object('status',case when v_match.photos_revealed then 'matched' else 'waiting' end);
end;
$$;
