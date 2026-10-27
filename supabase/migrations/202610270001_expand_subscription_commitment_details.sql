alter table public.subscriptions
  add column if not exists service_url varchar(2048),
  add column if not exists contract_start_date date,
  add column if not exists actual_ngn_amount numeric(12, 2),
  add column if not exists cost_center varchar(100),
  add column if not exists accountable_operator varchar(150),
  add column if not exists notes varchar(2000);

alter table public.subscriptions
  drop constraint if exists subscriptions_actual_ngn_amount_nonnegative,
  add constraint subscriptions_actual_ngn_amount_nonnegative
    check (actual_ngn_amount is null or actual_ngn_amount >= 0),
  drop constraint if exists subscriptions_service_url_http,
  add constraint subscriptions_service_url_http
    check (service_url is null or service_url ~* '^https?://');
