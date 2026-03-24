begin;

insert into public.user_roles (user_id, role_id)
select distinct
  up.auth_user_id,
  r.id
from public.user_profiles up
join public.roles r
  on r.name = public.map_legacy_role(up.role)
where up.auth_user_id is not null
  and up.deleted_at is null
  and public.map_legacy_role(up.role) is not null
on conflict do nothing;

create or replace function public.has_permission(p_permission_key text, p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when public.is_super_admin() then true
    else exists (
      select 1
      from (
        select ur.role_id
        from public.user_roles ur
        where ur.user_id = auth.uid()

        union

        select r.id as role_id
        from public.user_profiles up
        join public.roles r
          on r.name = public.map_legacy_role(up.role)
        where up.auth_user_id = auth.uid()
          and up.deleted_at is null
      ) effective_roles
      join public.role_permissions rp on rp.role_id = effective_roles.role_id
      join public.permissions p on p.id = rp.permission_id
      where p.key = p_permission_key
    )
  end
$$;

create or replace function public.my_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_legacy_role text;
  v_roles jsonb;
  v_permissions jsonb;
  v_is_super_admin boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'user_id', null,
      'legacy_role', null,
      'is_super_admin', false,
      'roles', '[]'::jsonb,
      'permissions', '[]'::jsonb
    );
  end if;

  select up.role into v_legacy_role
  from public.user_profiles up
  where up.auth_user_id = v_user_id
    and up.deleted_at is null
  limit 1;

  v_is_super_admin := public.is_super_admin() or v_legacy_role = 'Super Admin';

  select coalesce(
    jsonb_agg(role_obj order by role_name),
    '[]'::jsonb
  )
  into v_roles
  from (
    select distinct
      r.name as role_name,
      jsonb_build_object(
        'id', r.id,
        'name', r.name
      ) as role_obj
    from (
      select ur.role_id
      from public.user_roles ur
      where ur.user_id = v_user_id

      union

      select r.id as role_id
      from public.user_profiles up
      join public.roles r
        on r.name = public.map_legacy_role(up.role)
      where up.auth_user_id = v_user_id
        and up.deleted_at is null
    ) effective_roles
    join public.roles r on r.id = effective_roles.role_id
  ) role_rows;

  if v_is_super_admin then
    select coalesce(
      jsonb_agg(permission_key order by permission_key),
      '[]'::jsonb
    )
    into v_permissions
    from (
      select distinct p.key as permission_key
      from public.permissions p
    ) all_permissions;
  else
    select coalesce(
      jsonb_agg(permission_key order by permission_key),
      '[]'::jsonb
    )
    into v_permissions
    from (
      select distinct p.key as permission_key
      from (
        select ur.role_id
        from public.user_roles ur
        where ur.user_id = v_user_id

        union

        select r.id as role_id
        from public.user_profiles up
        join public.roles r
          on r.name = public.map_legacy_role(up.role)
        where up.auth_user_id = v_user_id
          and up.deleted_at is null
      ) effective_roles
      join public.role_permissions rp on rp.role_id = effective_roles.role_id
      join public.permissions p on p.id = rp.permission_id
    ) permission_rows;
  end if;

  return jsonb_build_object(
    'user_id', v_user_id,
    'legacy_role', v_legacy_role,
    'is_super_admin', v_is_super_admin,
    'roles', coalesce(v_roles, '[]'::jsonb),
    'permissions', coalesce(v_permissions, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.has_permission(text, uuid) to anon, authenticated, service_role;
grant execute on function public.my_access_context() to anon, authenticated, service_role;

commit;
