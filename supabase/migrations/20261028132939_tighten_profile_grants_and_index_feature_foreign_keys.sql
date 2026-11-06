-- Restrict profile table grants to the operations intended by the RLS policies.
-- Never leave table-level INSERT/DELETE/TRUNCATE rights on client roles.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;

-- Add covering indexes for foreign keys flagged by Supabase's performance advisor.
CREATE INDEX IF NOT EXISTS idx_daily_activity_campaign_entries_user_id
  ON public.daily_activity_campaign_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_activity_campaigns_created_by
  ON public.daily_activity_campaigns (created_by);
CREATE INDEX IF NOT EXISTS idx_daily_activity_campaigns_winner_id
  ON public.daily_activity_campaigns (winner_id);
CREATE INDEX IF NOT EXISTS idx_global_action_slot_updated_by
  ON public.global_action_slot (updated_by);
CREATE INDEX IF NOT EXISTS idx_user_activity_rewards_campaign_id
  ON public.user_activity_rewards (campaign_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_rewards_user_id
  ON public.user_activity_rewards (user_id);

-- Keep the self-update check, but avoid re-evaluating auth.uid() for every row.
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
