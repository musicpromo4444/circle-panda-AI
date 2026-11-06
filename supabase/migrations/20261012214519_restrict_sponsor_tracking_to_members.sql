-- Explicitly prevent anonymous callers from reaching sponsor event tracking.
revoke all on function public.track_sponsor_event(uuid,text,text) from public;
revoke all on function public.track_sponsor_event(uuid,text,text) from anon;
grant execute on function public.track_sponsor_event(uuid,text,text) to authenticated;
