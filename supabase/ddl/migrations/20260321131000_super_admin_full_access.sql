begin;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = 'Super Admin'
  )
  or exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and public.map_legacy_role(up.role) = 'Super Admin'
  )
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
  limit 1;

  v_is_super_admin := public.is_super_admin();

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
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = v_user_id
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
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = v_user_id
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

grant execute on function public.my_access_context() to anon, authenticated, service_role;

commit;
