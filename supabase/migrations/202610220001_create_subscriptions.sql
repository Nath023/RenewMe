create type public.subscription_status as enum ('active', 'trial', 'needs_review', 'archived');
create type public.billing_cycle as enum ('monthly', 'quarterly', 'annual');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vendor text not null check (length(trim(vendor)) > 0),
  service_details text,
  category text not null default 'Other',
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  billing_cycle public.billing_cycle not null default 'monthly',
  renewal_date date not null,
  cancel_by date,
  payment_instrument text,
  status public.subscription_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cancel_by_before_renewal check (cancel_by is null or cancel_by <= renewal_date)
);

create index subscriptions_user_renewal_idx
  on public.subscriptions (user_id, renewal_date)
  where status <> 'archived';

alter table public.subscriptions enable row level security;

create policy "Users read their own subscriptions"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users add their own subscriptions"
  on public.subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own subscriptions"
  on public.subscriptions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own subscriptions"
  on public.subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.subscriptions to authenticated;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();
