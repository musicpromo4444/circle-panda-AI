drop policy if exists "Users vote for others only" on public.crush_votes;
revoke insert, update, delete on public.crush_votes from authenticated;
revoke all on public.crush_votes from anon;
-- Voting is accepted only through cast_crush_vote(), which enforces ownership,
-- live schedule and the combined three-vote weekly limit.
