create table if not exists public.renewme_telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.renewme_telegram_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chat_id text not null unique,
  linked_at timestamptz not null default now()
);

create table if not exists public.renewme_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now()
);

alter table public.renewme_telegram_link_codes enable row level security;
alter table public.renewme_telegram_connections enable row level security;
alter table public.renewme_push_subscriptions enable row level security;
revoke all on public.renewme_telegram_link_codes from public, anon, authenticated;
revoke all on public.renewme_telegram_connections from public, anon, authenticated;
revoke all on public.renewme_push_subscriptions from public, anon, authenticated;
grant all on public.renewme_telegram_link_codes to service_role;
grant all on public.renewme_telegram_connections to service_role;
grant select, insert, update, delete on public.renewme_push_subscriptions to authenticated;
grant all on public.renewme_push_subscriptions to service_role;

drop policy if exists "Users read their push subscriptions" on public.renewme_push_subscriptions;
create policy "Users read their push subscriptions"
  on public.renewme_push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users create their push subscriptions" on public.renewme_push_subscriptions;
create policy "Users create their push subscriptions"
  on public.renewme_push_subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users update their push subscriptions" on public.renewme_push_subscriptions;
create policy "Users update their push subscriptions"
  on public.renewme_push_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users delete their push subscriptions" on public.renewme_push_subscriptions;
create policy "Users delete their push subscriptions"
  on public.renewme_push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.renewme_create_telegram_link(p_code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;
  if p_code !~ '^[a-f0-9]{48}$' then
    raise exception 'Invalid link code' using errcode = '22023';
  end if;

  insert into public.renewme_reminder_preferences (user_id, email_enabled)
  values (current_user_id, false)
  on conflict (user_id) do nothing;
  delete from public.renewme_telegram_link_codes where user_id = current_user_id;
  insert into public.renewme_telegram_link_codes (code, user_id, expires_at)
  values (p_code, current_user_id, now() + interval '15 minutes');
  return true;
end;
$$;

revoke all on function public.renewme_create_telegram_link(text) from public, anon;
grant execute on function public.renewme_create_telegram_link(text) to authenticated;

create or replace function public.renewme_telegram_link_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.renewme_telegram_connections as connection
    where connection.user_id = (select auth.uid())
  );
$$;

revoke all on function public.renewme_telegram_link_status() from public, anon;
grant execute on function public.renewme_telegram_link_status() to authenticated;

create or replace function public.renewme_unlink_telegram()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;
  delete from public.renewme_telegram_connections where user_id = current_user_id;
  delete from public.renewme_telegram_link_codes where user_id = current_user_id;
  return true;
end;
$$;

revoke all on function public.renewme_unlink_telegram() from public, anon;
grant execute on function public.renewme_unlink_telegram() to authenticated;

create or replace function public.renewme_link_telegram_chat(p_code text, p_chat_id text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service access required' using errcode = '42501';
  end if;

  select link.user_id into target_user_id
  from public.renewme_telegram_link_codes as link
  where link.code = p_code and link.expires_at > now();
  if target_user_id is null or p_chat_id !~ '^-?[0-9]{1,24}$' then
    return false;
  end if;

  insert into public.renewme_telegram_connections (user_id, chat_id, linked_at)
  values (target_user_id, p_chat_id, now())
  on conflict (user_id) do update set chat_id = excluded.chat_id, linked_at = now();
  delete from public.renewme_telegram_link_codes where code = p_code;
  return true;
end;
$$;

revoke all on function public.renewme_link_telegram_chat(text, text) from public, anon, authenticated;
grant execute on function public.renewme_link_telegram_chat(text, text) to service_role;

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
  result_attempt_count integer,
  result_email_enabled boolean,
  result_telegram_chat_id text,
  result_user_id uuid
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
    select subscriptions.id, subscriptions.user_id, subscriptions.vendor,
      subscriptions.service_details, subscriptions.amount, subscriptions.currency,
      subscriptions.billing_cycle, subscriptions.renewal_date, subscriptions.cancel_by,
      case subscriptions.billing_cycle when 'annual' then 12 when 'quarterly' then 3 else 1 end as month_step
    from public.subscriptions as subscriptions
    join public.renewme_reminder_preferences as preferences
      on preferences.user_id = subscriptions.user_id
    left join public.renewme_telegram_connections as telegram
      on telegram.user_id = subscriptions.user_id
    where subscriptions.status <> 'archived'
      and (preferences.email_enabled or telegram.user_id is not null or exists (
        select 1 from public.renewme_push_subscriptions as push where push.user_id = subscriptions.user_id
      ))
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
    join public.renewme_reminder_preferences as preferences on preferences.user_id = deliveries.user_id
    left join public.renewme_telegram_connections as telegram on telegram.user_id = deliveries.user_id
    where deliveries.attempt_count < 3
      and (preferences.email_enabled or telegram.user_id is not null or exists (
        select 1 from public.renewme_push_subscriptions as push where push.user_id = deliveries.user_id
      ))
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
    claimed.reminder_type, claimed.due_date, claimed.attempt_count,
    preferences.email_enabled, telegram.chat_id, claimed.user_id
  from claimed
  join auth.users as users on users.id = claimed.user_id
  join public.subscriptions as subscriptions on subscriptions.id = claimed.subscription_id
  join public.renewme_reminder_preferences as preferences on preferences.user_id = claimed.user_id
  left join public.renewme_telegram_connections as telegram on telegram.user_id = claimed.user_id;
end;
$$;

revoke all on function public.renewme_claim_due_reminders(date) from public, anon, authenticated;
grant execute on function public.renewme_claim_due_reminders(date) to service_role;
