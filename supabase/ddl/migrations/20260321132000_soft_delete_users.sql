begin;

alter table public.user_profiles
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null;

create index if not exists user_profiles_deleted_at_idx on public.user_profiles(deleted_at);

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
    join public.user_profiles up on up.auth_user_id = ur.user_id
    where ur.user_id = auth.uid()
      and r.name = 'Super Admin'
      and up.deleted_at is null
  )
  or exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.deleted_at is null
      and public.map_legacy_role(up.role) = 'Super Admin'
  )
$$;

create or replace function public.has_permission(p_permission_key text, p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    when exists (
      select 1
      from public.user_profiles up
      where up.auth_user_id = auth.uid()
        and up.deleted_at is null
        and public.map_legacy_role(up.role) = 'Super Admin'
    ) then true
    when public.is_super_admin() then true
    else exists (
      select 1
      from public.user_roles ur
      join public.user_profiles up on up.auth_user_id = ur.user_id
      join public.roles r on r.id = ur.role_id
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = auth.uid()
        and up.deleted_at is null
        and p.key = p_permission_key
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
    from public.user_roles ur
    join public.user_profiles up on up.auth_user_id = ur.user_id
    join public.roles r on r.id = ur.role_id
    where ur.user_id = v_user_id
      and up.deleted_at is null
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
      join public.user_profiles up on up.auth_user_id = ur.user_id
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = v_user_id
        and up.deleted_at is null
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

create or replace function public.soft_delete_user_profile(p_profile_id uuid)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.user_profiles%rowtype;
begin
  perform public.require_permission('users.manage');

  update public.user_profiles
  set deleted_at = now(),
      deleted_by = auth.uid()
  where id = p_profile_id
    and deleted_at is null
  returning * into v_profile;

  if not found then
    raise exception 'user profile not found or already deleted' using errcode = 'P0002';
  end if;

  return v_profile;
end;
$$;

grant execute on function public.soft_delete_user_profile(uuid) to authenticated, service_role;
grant execute on function public.my_access_context() to anon, authenticated, service_role;
grant execute on function public.has_permission(text, uuid) to anon, authenticated, service_role;
grant execute on function public.has_any_permission(text[], uuid) to anon, authenticated, service_role;
grant execute on function public.require_permission(text, uuid) to anon, authenticated, service_role;
grant execute on function public.has_stage_permission(text, text, uuid) to anon, authenticated, service_role;

commit;
