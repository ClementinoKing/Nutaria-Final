insert into public.user_roles (user_id, role_id)
select distinct
  up.auth_user_id,
  r.id
from public.user_profiles up
join public.roles r
  on r.name = public.map_legacy_role(up.role)
where up.deleted_at is null
  and up.role is not null
  and public.map_legacy_role(up.role) is not null
  and not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = up.auth_user_id
      and ur.role_id = r.id
  );

create or replace function public.sync_user_roles_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_name text;
  v_role_id uuid;
begin
  v_role_name := public.map_legacy_role(new.role);

  delete from public.user_roles
  where user_id = new.auth_user_id;

  if new.deleted_at is not null then
    return new;
  end if;

  if v_role_name is null then
    return new;
  end if;

  select id into v_role_id
  from public.roles
  where name = v_role_name;

  if v_role_id is null then
    return new;
  end if;

  insert into public.user_roles (user_id, role_id)
  values (new.auth_user_id, v_role_id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists sync_user_roles_from_profile_trigger on public.user_profiles;
create trigger sync_user_roles_from_profile_trigger
after insert or update of role, deleted_at on public.user_profiles
for each row
execute function public.sync_user_roles_from_profile();

grant execute on function public.sync_user_roles_from_profile() to authenticated, service_role;
