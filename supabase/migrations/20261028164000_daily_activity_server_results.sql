create or replace function public.record_daily_activity_action(p_activity_key text,p_action text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 v_uid uuid:=auth.uid(); v_start date; v_day integer; v_attempt public.user_daily_activity_attempts;
 v_outcome text:='Action recorded.'; v_target text; v_correct boolean:=false;
begin
 if v_uid is null then raise exception 'Sign in is required'; end if;
 if p_action is null or length(trim(p_action))<1 or length(p_action)>80 then raise exception 'Invalid activity action'; end if;
 select cycle_start_date into v_start from public.user_daily_activity_state where user_id=v_uid for update;
 if v_start is null then raise exception 'Open Daily Activities first'; end if;
 v_day:=((now() at time zone 'utc')::date-v_start)+1;
 if v_day<1 or v_day>7 then raise exception 'Your activity cycle needs refreshing'; end if;
 select * into v_attempt from public.user_daily_activity_attempts where user_id=v_uid and cycle_start_date=v_start and day_number=v_day for update;
 if v_attempt.id is null or v_attempt.activity_key<>p_activity_key then raise exception 'Start the assigned activity first'; end if;
 if v_attempt.completed_at is not null then raise exception 'This activity is already completed'; end if;
 if now()-v_attempt.started_at>interval '30 minutes' then raise exception 'This activity attempt expired'; end if;
 if v_attempt.action_count>=20 then raise exception 'Activity action limit reached'; end if;
 if p_action='start_round' then
  case p_activity_key
   when 'wheel_spin' then v_target:=(array['Golden Panda','Bamboo Boost','Lucky Lantern','Silver Paw'])[1+floor(random()*4)::int]; v_outcome:='The wheel landed on '||v_target||'.';
   when 'secret_reveal' then v_outcome:=(array['Your prompt: leave a kind comment on a confession.','Your prompt: send someone an encouraging message.','Your prompt: share a positive thought.','Your prompt: celebrate someone in your circle.'])[1+floor(random()*4)::int];
   when 'guess_sponsor' then v_outcome:='Look at the featured sponsor banner, then choose the matching option.';
   else v_outcome:='Your round is ready. Make your move.';
  end case;
 elsif p_activity_key='panda_cup_shuffle' then
  v_target:=(array['Left cup','Middle cup','Right cup'])[1+floor(random()*3)::int]; v_correct:=p_action=v_target;
  v_outcome:=case when v_correct then 'You found the panda token under the '||v_target||'!' else 'The panda token was under the '||v_target||'. Try again tomorrow.' end;
 elsif p_activity_key='lucky_cards' then
  v_target:=(array['Golden Panda','Bamboo Boost','Lucky Lantern'])[1+floor(random()*3)::int]; v_outcome:='Your card revealed: '||v_target||'.';
 elsif p_activity_key='mystery_box' then
  v_target:=(array['Golden Gift','Panda Badge','Lucky Bamboo','Mystery Icon'])[1+floor(random()*4)::int]; v_outcome:='Your mystery box revealed: '||v_target||'.';
 elsif p_activity_key='panda_target' then
  v_target:=(array['Target left','Bullseye','Target right'])[1+floor(random()*3)::int]; v_correct:=p_action=v_target;
  v_outcome:=case when v_correct then 'Bullseye! You hit the target.' else 'The target was '||v_target||'.' end;
 elsif p_activity_key='panda_puzzle' then
  v_target:=(array['Panda face','Golden coin','Green bamboo'])[1+floor(random()*3)::int]; v_correct:=p_action=v_target;
  v_outcome:=case when v_correct then 'Puzzle solved! You found the right piece.' else 'The matching piece was '||v_target||'.' end;
 elsif p_activity_key='guess_sponsor' then v_outcome:='Your sponsor choice has been recorded.';
 end if;
 update public.user_daily_activity_attempts set action_count=action_count+1 where id=v_attempt.id returning * into v_attempt;
 return jsonb_build_object('action_count',v_attempt.action_count,'activity_key',v_attempt.activity_key,'outcome',v_outcome,'correct',v_correct);
end $$;
revoke all on function public.record_daily_activity_action(text,text) from public,anon;
grant execute on function public.record_daily_activity_action(text,text) to authenticated;
