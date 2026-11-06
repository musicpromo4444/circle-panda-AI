drop policy if exists "Users remove own crush vote" on public.crush_votes;
revoke delete on public.crush_votes from authenticated;
create or replace function public.cast_crush_vote(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_post public.crush_posts%rowtype; v_votes integer; v_count integer;
begin
  if v_user is null then raise exception 'Sign in to vote'; end if;
  select * into v_post from public.crush_posts where id=p_post_id;
  if not found then raise exception 'Crush post not found'; end if;
  if v_post.user_id=v_user then raise exception 'You cannot vote for your own crush post'; end if;
  if v_post.week_start <> date_trunc('week', now() at time zone 'UTC')::date then raise exception 'Voting for this week has closed'; end if;
  if exists(select 1 from public.crush_votes where post_id=p_post_id and user_id=v_user) then
    return jsonb_build_object('voted',true,'already_voted',true);
  end if;
  select count(*) into v_votes from public.crush_votes cv where cv.user_id=v_user and cv.created_at >= date_trunc('week', now() at time zone 'UTC') and cv.created_at < date_trunc('week', now() at time zone 'UTC') + interval '7 days';
  if v_votes >= 3 then raise exception 'Your 3 free weekly crush votes are used. Extra BC/ad voting is not available yet.'; end if;
  insert into public.crush_votes(post_id,user_id) values(p_post_id,v_user);
  select count(*) into v_count from public.crush_votes where post_id=p_post_id;
  return jsonb_build_object('voted',true,'free_votes_used',v_votes+1,'post_votes',v_count);
end;
$$;
revoke all on function public.cast_crush_vote(uuid) from public, anon;
grant execute on function public.cast_crush_vote(uuid) to authenticated;
