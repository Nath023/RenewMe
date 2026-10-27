create or replace function public.renewme_admin_user_ids()
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.renewme_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return query select admins.user_id from public.renewme_admins as admins;
end;
$$;

revoke all on function public.renewme_admin_user_ids() from public, anon;
grant execute on function public.renewme_admin_user_ids() to authenticated;

create or replace function public.renewme_is_admin_user(target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.renewme_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return exists (
    select 1 from public.renewme_admins as admins
    where admins.user_id = target_user_id
  );
end;
$$;

revoke all on function public.renewme_is_admin_user(uuid) from public, anon;
grant execute on function public.renewme_is_admin_user(uuid) to authenticated;
