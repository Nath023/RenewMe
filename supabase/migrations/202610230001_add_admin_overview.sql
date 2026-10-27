create table if not exists public.renewme_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table public.renewme_admins enable row level security;

drop policy if exists "Admins can read their own role" on public.renewme_admins;
create policy "Admins can read their own role"
  on public.renewme_admins for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.renewme_admins from anon, authenticated;
grant select on public.renewme_admins to authenticated;

create or replace function public.renewme_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.renewme_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.renewme_is_admin() from public, anon;
grant execute on function public.renewme_is_admin() to authenticated;

create or replace function public.renewme_admin_summary()
returns table (
  account_count bigint,
  subscription_count bigint,
  active_subscription_count bigint,
  review_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.renewme_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
    select
      (select count(*) from auth.users),
      (select count(*) from public.subscriptions),
      (select count(*) from public.subscriptions where status = 'active'),
      (select count(*) from public.subscriptions where status = 'needs_review');
end;
$$;

revoke all on function public.renewme_admin_summary() from public, anon;
grant execute on function public.renewme_admin_summary() to authenticated;
