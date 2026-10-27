create table if not exists public.renewme_subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  file_path text not null unique,
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  content_type text not null check (content_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  file_size bigint not null check (file_size between 1 and 26214400),
  created_at timestamptz not null default now(),
  constraint renewme_invoice_path_matches_owner check (
    file_path like user_id::text || '/' || subscription_id::text || '/%'
  )
);

create index if not exists renewme_subscription_invoices_subscription_idx
  on public.renewme_subscription_invoices (user_id, subscription_id, created_at desc);

alter table public.renewme_subscription_invoices enable row level security;
revoke all on table public.renewme_subscription_invoices from public, anon, authenticated;
grant select, insert, delete on table public.renewme_subscription_invoices to authenticated;

drop policy if exists "Users manage their own subscription invoices" on public.renewme_subscription_invoices;
create policy "Users manage their own subscription invoices"
  on public.renewme_subscription_invoices for all to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.subscriptions as subscriptions
      where subscriptions.id = subscription_id
        and subscriptions.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.subscriptions as subscriptions
      where subscriptions.id = subscription_id
        and subscriptions.user_id = (select auth.uid())
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'renewme-invoices',
  'renewme-invoices',
  false,
  26214400,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their own invoice files" on storage.objects;
create policy "Users read their own invoice files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'renewme-invoices'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.subscriptions as subscriptions
      where subscriptions.id::text = (storage.foldername(name))[2]
        and subscriptions.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users upload their own invoice files" on storage.objects;
create policy "Users upload their own invoice files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'renewme-invoices'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.subscriptions as subscriptions
      where subscriptions.id::text = (storage.foldername(name))[2]
        and subscriptions.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users delete their own invoice files" on storage.objects;
create policy "Users delete their own invoice files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'renewme-invoices'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.subscriptions as subscriptions
      where subscriptions.id::text = (storage.foldername(name))[2]
        and subscriptions.user_id = (select auth.uid())
    )
  );
