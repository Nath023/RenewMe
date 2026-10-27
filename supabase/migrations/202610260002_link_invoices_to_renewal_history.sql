alter table public.renewme_subscription_invoices
  add column if not exists renewal_id uuid
  references public.renewme_subscription_renewals (id) on delete set null;

create index if not exists renewme_subscription_invoices_renewal_idx
  on public.renewme_subscription_invoices (user_id, renewal_id)
  where renewal_id is not null;

drop policy if exists "Users manage their own subscription invoices" on public.renewme_subscription_invoices;
create policy "Users manage their own subscription invoices"
  on public.renewme_subscription_invoices for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.subscriptions as subscriptions
      where subscriptions.id = renewme_subscription_invoices.subscription_id
        and subscriptions.user_id = (select auth.uid())
    )
    and (
      renewme_subscription_invoices.renewal_id is null
      or exists (
        select 1 from public.renewme_subscription_renewals as renewals
        where renewals.id = renewme_subscription_invoices.renewal_id
          and renewals.subscription_id = renewme_subscription_invoices.subscription_id
          and renewals.user_id = (select auth.uid())
      )
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.subscriptions as subscriptions
      where subscriptions.id = renewme_subscription_invoices.subscription_id
        and subscriptions.user_id = (select auth.uid())
    )
    and (
      renewme_subscription_invoices.renewal_id is null
      or exists (
        select 1 from public.renewme_subscription_renewals as renewals
        where renewals.id = renewme_subscription_invoices.renewal_id
          and renewals.subscription_id = renewme_subscription_invoices.subscription_id
          and renewals.user_id = (select auth.uid())
      )
    )
  );
