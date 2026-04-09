begin;

insert into public.roles (name, description)
values
  ('Super Admin', 'Full system-wide access'),
  ('Admin', 'Full access within the platform'),
  ('Production Administrator', 'Operational access for supply, shipment, and checklist workflows'),
  ('Production Manager', 'Operational access plus approvals and reporting'),
  ('Operator', 'Data capture only for production workflows')
on conflict (name) do update
set description = excluded.description;

insert into public.permissions (key, description, module)
values
  ('users.manage', 'Manage users and assignments', 'access'),
  ('users.reset_password', 'Reset user passwords', 'access'),
  ('workflow.supply.create', 'Create supply workflow records', 'workflow'),
  ('workflow.supply.edit', 'Edit supply workflow records', 'workflow'),
  ('workflow.supply.view', 'View supply workflow records', 'workflow'),
  ('workflow.shipment.create', 'Create shipment workflow records', 'workflow'),
  ('workflow.shipment.edit', 'Edit shipment workflow records', 'workflow'),
  ('workflow.shipment.view', 'View shipment workflow records', 'workflow'),
  ('workflow.checklist.manage', 'Manage checklist records', 'workflow'),
  ('workflow.checklist.view', 'View checklist records', 'workflow'),
  ('workflow.approve', 'Approve or validate workflow entries', 'workflow'),
  ('reports.view', 'View reports', 'reports'),
  ('dashboards.view', 'View dashboards and KPIs', 'reports'),
  ('settings.manage', 'Manage system settings', 'settings'),
  ('audit_logs.view', 'View audit logs', 'audit')
on conflict (key) do update
set description = excluded.description,
    module = excluded.module;

with selected_roles as (
  select id, name
  from public.roles
),
selected_permissions as (
  select id, key
  from public.permissions
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from selected_roles r
join selected_permissions p on true
where
  r.name = 'Super Admin'
  or (
    r.name = 'Admin'
    and p.key in (
      'users.manage',
      'users.reset_password',
      'workflow.supply.create',
      'workflow.supply.edit',
      'workflow.supply.view',
      'workflow.shipment.create',
      'workflow.shipment.edit',
      'workflow.shipment.view',
      'workflow.checklist.manage',
      'workflow.checklist.view',
      'workflow.approve',
      'reports.view',
      'dashboards.view',
      'settings.manage',
      'audit_logs.view'
    )
  )
  or (
    r.name = 'Production Administrator'
    and p.key in (
      'workflow.supply.create',
      'workflow.supply.edit',
      'workflow.supply.view',
      'workflow.shipment.create',
      'workflow.shipment.edit',
      'workflow.shipment.view',
      'workflow.checklist.manage',
      'workflow.checklist.view',
      'reports.view',
      'dashboards.view',
      'audit_logs.view'
    )
  )
  or (
    r.name = 'Production Manager'
    and p.key in (
      'workflow.supply.create',
      'workflow.supply.edit',
      'workflow.supply.view',
      'workflow.shipment.create',
      'workflow.shipment.edit',
      'workflow.shipment.view',
      'workflow.checklist.manage',
      'workflow.checklist.view',
      'workflow.approve',
      'reports.view',
      'dashboards.view',
      'audit_logs.view'
    )
  )
  or (
    r.name = 'Operator'
    and p.key in (
      'workflow.supply.create',
      'workflow.supply.edit',
      'workflow.supply.view',
      'workflow.shipment.create',
      'workflow.shipment.edit',
      'workflow.shipment.view',
      'workflow.checklist.manage',
      'workflow.checklist.view'
    )
  )
on conflict do nothing;

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

grant execute on function public.has_permission(text, uuid) to anon, authenticated, service_role;
grant execute on function public.my_access_context() to anon, authenticated, service_role;
grant execute on function public.sync_user_roles_from_profile() to authenticated, service_role;

commit;
