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
select up.auth_user_id, r.id
from public.user_profiles up
join public.roles r on r.name = public.map_legacy_role(up.role)
where up.auth_user_id is not null
  and public.map_legacy_role(up.role) is not null
on conflict do nothing;

commit;
