-- Allow users to remove their own sent email entries from the delivery history.
-- Pending and processing deliveries stay protected so scheduled email sending is unaffected.
grant delete on table public.renewme_reminder_deliveries to authenticated;

drop policy if exists "Users delete their own sent reminder history" on public.renewme_reminder_deliveries;
create policy "Users delete their own sent reminder history"
  on public.renewme_reminder_deliveries for delete to authenticated
  using ((select auth.uid()) = user_id and status = 'sent');
