
revoke all on function public.add_event_blast_reach() from public,anon,authenticated;
revoke all on function public.enforce_group_not_closed_on_message() from public,anon,authenticated;
revoke all on function public.sync_dating_request_projection() from public,anon,authenticated;
revoke all on function public.sync_group_message_projection() from public,anon,authenticated;
drop policy if exists "Administrators can review crush reports" on public.crush_reports;
create policy "Administrators can review crush reports" on public.crush_reports for select to authenticated using (
 exists(select 1 from public.user_roles r where r.user_id=(select auth.uid()) and r.role='admin')
);
