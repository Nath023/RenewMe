-- Allow each signed-in user to read their own reminder delivery history.
-- Provider message IDs and internal error details stay inaccessible to authenticated users.
-- Keep sent history if a user later removes the related subscription.
alter table public.renewme_reminder_deliveries
  alter column subscription_id drop not null;
alter table public.renewme_reminder_deliveries
  drop constraint if exists renewme_reminder_deliveries_subscription_id_fkey;
alter table public.renewme_reminder_deliveries
  add constraint renewme_reminder_deliveries_subscription_id_fkey
  foreign key (subscription_id) references public.subscriptions (id) on delete set null;

revoke all on table public.renewme_reminder_deliveries from authenticated;
grant select (
  id,
  user_id,
  subscription_id,
  reminder_type,
  due_date,
  status,
  attempt_count,
  last_attempt_at,
  sent_at,
  created_at
) on table public.renewme_reminder_deliveries to authenticated;

drop policy if exists "Users read their own reminder delivery history" on public.renewme_reminder_deliveries;
create policy "Users read their own reminder delivery history"
  on public.renewme_reminder_deliveries for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists renewme_reminder_deliveries_user_history_idx
  on public.renewme_reminder_deliveries (user_id, created_at desc);
