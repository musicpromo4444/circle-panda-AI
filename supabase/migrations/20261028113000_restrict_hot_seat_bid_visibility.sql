-- Bid amounts and bidder identity are not public feed data. Bidders may
-- read their own bids; the host of the associated session and admins may
-- read all bids for moderation/selection.
alter policy "hot seat bids readable own or host"
on public.hot_seat_bids
using (
  bidder_id = (select auth.uid())
  or exists (
    select 1
    from public.hot_seat_sessions s
    where s.id = hot_seat_bids.session_id
      and s.host_id = (select auth.uid())
  )
  or public.hot_seat_is_admin()
);