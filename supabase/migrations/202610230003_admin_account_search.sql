create or replace function public.renewme_admin_search_accounts(
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  is_admin boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  search_value text := lower(btrim(coalesce(p_search, '')));
begin
  if not public.renewme_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query
    with matching_accounts as (
      select
        users.id,
        users.email::text,
        users.created_at,
        users.last_sign_in_at,
        users.email_confirmed_at,
        users.banned_until,
        exists (
          select 1 from public.renewme_admins as admins
          where admins.user_id = users.id
        ) as is_admin
      from auth.users as users
      where search_value = ''
        or strpos(lower(coalesce(users.email, '')), search_value) > 0
    ),
    counted_accounts as (
      select matches.*, count(*) over () as total_count
      from matching_accounts as matches
    )
    select
      accounts.id,
      accounts.email,
      accounts.created_at,
      accounts.last_sign_in_at,
      accounts.email_confirmed_at,
      accounts.banned_until,
      accounts.is_admin,
      accounts.total_count
    from counted_accounts as accounts
    order by accounts.created_at desc nulls last, accounts.id
    limit safe_page_size
    offset (safe_page - 1) * safe_page_size;
end;
$$;

revoke all on function public.renewme_admin_search_accounts(text, integer, integer) from public, anon;
grant execute on function public.renewme_admin_search_accounts(text, integer, integer) to authenticated;
