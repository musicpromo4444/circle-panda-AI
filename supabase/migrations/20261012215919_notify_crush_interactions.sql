create or replace function public.notify_crush_interaction()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
  v_actor_name text;
  v_type text;
  v_title text;
  v_body text;
  v_post_id uuid;
begin
  v_post_id := new.post_id;
  select p.user_id into v_owner from public.crush_posts p where p.id=v_post_id;
  if v_owner is null or v_owner=new.user_id then return new; end if;
  select coalesce(p.display_name,p.username,'A Panda') into v_actor_name from public.profiles p where p.id=new.user_id;
  if tg_table_name='crush_votes' then
    v_type := 'crush_vote'; v_title := 'Your crush card received a vote'; v_body := coalesce(v_actor_name,'A Panda') || ' voted for your crush card.';
  elsif tg_table_name='crush_comments' then
    v_type := 'crush_comment'; v_title := 'New comment on your crush card'; v_body := coalesce(v_actor_name,'A Panda') || ' commented: ' || left(new.body,140);
  else
    v_type := 'crush_reaction'; v_title := 'Someone reacted to your crush card'; v_body := coalesce(v_actor_name,'A Panda') || ' reacted ' || new.reaction || ' to your crush card.';
  end if;
  insert into public.notifications(user_id,actor_id,notification_type,title,body,target_type,target_id)
  values(v_owner,new.user_id,v_type,v_title,v_body,'crush',v_post_id);
  return new;
end;
$$;
drop trigger if exists notify_crush_vote on public.crush_votes;
create trigger notify_crush_vote after insert on public.crush_votes for each row execute function public.notify_crush_interaction();
drop trigger if exists notify_crush_comment on public.crush_comments;
create trigger notify_crush_comment after insert on public.crush_comments for each row execute function public.notify_crush_interaction();
drop trigger if exists notify_crush_reaction on public.crush_reactions;
create trigger notify_crush_reaction after insert on public.crush_reactions for each row execute function public.notify_crush_interaction();
