create table if not exists public.renewme_subscription_renewals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  renewal_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  payment_status text not null default 'paid' check (payment_status in ('paid', 'pending', 'failed')),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists renewme_subscription_renewals_history_idx
  on public.renewme_subscription_renewals (user_id, subscription_id, renewal_date desc, created_at desc);

alter table public.renewme_subscription_renewals enable row level security;
revoke all on table public.renewme_subscription_renewals from public, anon, authenticated;
grant select, insert, update, delete on table public.renewme_subscription_renewals to authenticated;

drop policy if exists "Users manage their own subscription renewal history" on public.renewme_subscription_renewals;
create policy "Users manage their own subscription renewal history"
  on public.renewme_subscription_renewals for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.subscriptions as subscriptions
      where subscriptions.id = renewme_subscription_renewals.subscription_id
        and subscriptions.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.subscriptions as subscriptions
      where subscriptions.id = renewme_subscription_renewals.subscription_id
        and subscriptions.user_id = (select auth.uid())
    )
  );

drop trigger if exists renewme_subscription_renewals_updated_at on public.renewme_subscription_renewals;
create trigger renewme_subscription_renewals_updated_at
  before update on public.renewme_subscription_renewals
  for each row execute function public.set_updated_at();
