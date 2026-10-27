create table if not exists public.renewme_reminder_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.renewme_reminder_preferences enable row level security;
revoke all on table public.renewme_reminder_preferences from public, anon, authenticated;
grant select, insert, update on table public.renewme_reminder_preferences to authenticated;
grant all on table public.renewme_reminder_preferences to service_role;

drop policy if exists "Users read their reminder preference" on public.renewme_reminder_preferences;
create policy "Users read their reminder preference"
  on public.renewme_reminder_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their reminder preference" on public.renewme_reminder_preferences;
create policy "Users create their reminder preference"
  on public.renewme_reminder_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their reminder preference" on public.renewme_reminder_preferences;
create policy "Users update their reminder preference"
  on public.renewme_reminder_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists renewme_reminder_preferences_updated_at on public.renewme_reminder_preferences;
create trigger renewme_reminder_preferences_updated_at
  before update on public.renewme_reminder_preferences
  for each row execute function public.set_updated_at();

create table if not exists public.renewme_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  reminder_type text not null check (reminder_type in ('renewal_7_days', 'renewal_1_day', 'cancellation_7_days', 'cancellation_1_day')),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  unique (subscription_id, reminder_type, due_date)
);

alter table public.renewme_reminder_deliveries enable row level security;
revoke all on table public.renewme_reminder_deliveries from public, anon, authenticated;
grant all on table public.renewme_reminder_deliveries to service_role;
create index if not exists renewme_reminder_deliveries_retry_idx
  on public.renewme_reminder_deliveries (status, last_attempt_at, created_at);

drop function if exists public.renewme_claim_due_reminders(date);

create function public.renewme_claim_due_reminders(p_today date default (now() at time zone 'utc')::date)
returns table (
  result_delivery_id uuid,
  result_recipient_email text,
  result_vendor text,
  result_service_details text,
  result_amount numeric,
  result_currency text,
  result_billing_cycle text,
  result_reminder_type text,
  result_due_date date,
  result_attempt_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service access required' using errcode = '42501';
  end if;

  with eligible_subscriptions as (
    select
      subscriptions.id,
      subscriptions.user_id,
      subscriptions.vendor,
      subscriptions.service_details,
      subscriptions.amount,
      subscriptions.currency,
      subscriptions.billing_cycle,
      subscriptions.renewal_date,
      subscriptions.cancel_by,
      case subscriptions.billing_cycle
        when 'annual' then 12
        when 'quarterly' then 3
        else 1
      end as month_step
    from public.subscriptions as subscriptions
    join public.renewme_reminder_preferences as preferences
      on preferences.user_id = subscriptions.user_id
     and preferences.email_enabled
    where subscriptions.status <> 'archived'
  ),
  month_offsets as (
    select eligible_subscriptions.*,
      greatest(0,
        (extract(year from p_today)::integer - extract(year from renewal_date)::integer) * 12
        + extract(month from p_today)::integer - extract(month from renewal_date)::integer
      ) as month_difference
    from eligible_subscriptions
  ),
  cycle_months as (
    select month_offsets.*,
      (date_trunc('month', renewal_date)::date
        + make_interval(months => (floor(month_difference::numeric / month_step)::integer * month_step)))::date as candidate_month
    from month_offsets
  ),
  first_candidates as (
    select cycle_months.*,
      candidate_month + least(
        extract(day from renewal_date)::integer,
        extract(day from (candidate_month + interval '1 month' - interval '1 day')::date)::integer
      ) - 1 as first_candidate
    from cycle_months
  ),
  next_months as (
    select first_candidates.*,
      case when first_candidate < p_today
        then (candidate_month + make_interval(months => month_step))::date
        else candidate_month
      end as next_month
    from first_candidates
  ),
  occurrences as (
    select next_months.*,
      next_month + least(
        extract(day from renewal_date)::integer,
        extract(day from (next_month + interval '1 month' - interval '1 day')::date)::integer
      ) - 1 as next_renewal
    from next_months
  ),
  due_events as (
    select occurrence.id as subscription_id, occurrence.user_id, occurrence.vendor,
      occurrence.service_details, occurrence.amount, occurrence.currency, occurrence.billing_cycle,
      'renewal_7_days'::text as kind, occurrence.next_renewal as event_date
    from occurrences as occurrence where occurrence.next_renewal = p_today + 7
    union all
    select occurrence.id, occurrence.user_id, occurrence.vendor, occurrence.service_details,
      occurrence.amount, occurrence.currency, occurrence.billing_cycle,
      'renewal_1_day'::text, occurrence.next_renewal
    from occurrences as occurrence where occurrence.next_renewal = p_today + 1
    union all
    select occurrence.id, occurrence.user_id, occurrence.vendor, occurrence.service_details,
      occurrence.amount, occurrence.currency, occurrence.billing_cycle,
      'cancellation_7_days'::text,
      occurrence.next_renewal - (occurrence.renewal_date - occurrence.cancel_by)
    from occurrences as occurrence
    where occurrence.cancel_by is not null
      and occurrence.next_renewal - (occurrence.renewal_date - occurrence.cancel_by) = p_today + 7
    union all
    select occurrence.id, occurrence.user_id, occurrence.vendor, occurrence.service_details,
      occurrence.amount, occurrence.currency, occurrence.billing_cycle,
      'cancellation_1_day'::text,
      occurrence.next_renewal - (occurrence.renewal_date - occurrence.cancel_by)
    from occurrences as occurrence
    where occurrence.cancel_by is not null
      and occurrence.next_renewal - (occurrence.renewal_date - occurrence.cancel_by) = p_today + 1
  )
  insert into public.renewme_reminder_deliveries (user_id, subscription_id, reminder_type, due_date)
  select user_id, subscription_id, kind, event_date from due_events
  on conflict do nothing;

  return query
  with claimable as (
    select deliveries.id
    from public.renewme_reminder_deliveries as deliveries
    join public.renewme_reminder_preferences as preferences
      on preferences.user_id = deliveries.user_id
     and preferences.email_enabled
    where deliveries.attempt_count < 3
      and (
        deliveries.status = 'pending'
        or (deliveries.status = 'failed' and deliveries.last_attempt_at < now() - interval '15 minutes')
        or (deliveries.status = 'processing' and deliveries.last_attempt_at < now() - interval '15 minutes')
      )
    order by deliveries.created_at
    for update of deliveries skip locked
  ),
  claimed as (
    update public.renewme_reminder_deliveries as deliveries
    set status = 'processing', attempt_count = deliveries.attempt_count + 1,
        last_attempt_at = now(), last_error = null
    from claimable
    where deliveries.id = claimable.id
    returning deliveries.*
  )
  select claimed.id, users.email::text, subscriptions.vendor, subscriptions.service_details,
    subscriptions.amount, subscriptions.currency, subscriptions.billing_cycle::text,
    claimed.reminder_type, claimed.due_date, claimed.attempt_count
  from claimed
  join auth.users as users on users.id = claimed.user_id
  join public.subscriptions as subscriptions on subscriptions.id = claimed.subscription_id;
end;
$$;

revoke all on function public.renewme_claim_due_reminders(date) from public, anon, authenticated;
grant execute on function public.renewme_claim_due_reminders(date) to service_role;

create or replace function public.renewme_finish_reminder(
  p_delivery_id uuid,
  p_sent boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service access required' using errcode = '42501';
  end if;

  update public.renewme_reminder_deliveries as deliveries
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then now() else null end,
      provider_message_id = case when p_sent then p_provider_message_id else null end,
      last_error = case when p_sent then null else left(coalesce(p_error, 'Email delivery failed'), 1000) end
  where deliveries.id = p_delivery_id and deliveries.status = 'processing';
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.renewme_finish_reminder(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.renewme_finish_reminder(uuid, boolean, text, text) to service_role;
