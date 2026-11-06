do $$
declare t text;
begin
  foreach t in array array[
    'hot_seat_sessions',
    'hot_seat_questions',
    'hot_seat_comments',
    'hot_seat_reactions',
    'hot_seat_gift_transactions',
    'hot_seat_bids',
    'hot_seat_giveaways',
    'hot_seat_giveaway_entries',
    'hot_seat_polls',
    'hot_seat_poll_votes',
    'hot_seat_follows'
  ]
  loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = t
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
