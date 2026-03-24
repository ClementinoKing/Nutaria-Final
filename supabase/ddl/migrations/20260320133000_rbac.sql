begin;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text null,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text null,
  module text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists user_roles_user_id_idx on public.user_roles(user_id);
create index if not exists user_roles_role_id_idx on public.user_roles(role_id);

alter table public.user_roles
  add constraint user_roles_unique unique (user_id, role_id);

alter table public.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (
    role = any (
      array[
        'Super Admin'::text,
        'Admin'::text,
        'Production Administrator'::text,
        'Production Manager'::text,
        'Operator'::text,
        'admin'::text,
        'planner'::text,
        'qa'::text,
        'viewer'::text
      ]
    )
  );

alter table public.audit_logs
  add column if not exists actor_user_id uuid null,
  add column if not exists action text null,
  add column if not exists entity_type text null,
  add column if not exists entity_id text null,
  add column if not exists previous_value jsonb null,
  add column if not exists new_value jsonb null,
  add column if not exists created_at timestamptz not null default now();

create index if not exists audit_logs_actor_user_id_idx on public.audit_logs(actor_user_id);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

create or replace function public.map_legacy_role(p_role text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case lower(coalesce(trim(p_role), ''))
    when 'super admin' then 'Super Admin'
    when 'admin' then 'Admin'
    when 'production administrator' then 'Production Administrator'
    when 'production manager' then 'Production Manager'
    when 'operator' then 'Operator'
    when 'planner' then 'Production Administrator'
    when 'qa' then 'Production Manager'
    when 'viewer' then 'Operator'
    else null
  end
$$;

create or replace function public.workflow_permission_key(p_stage text, p_action text)
returns text
language sql
immutable
security definer
set search_path = public
as $$
  select 'workflow.' || lower(trim(coalesce(p_stage, ''))) || '.' || lower(trim(coalesce(p_action, '')))
$$;

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
    when public.is_super_admin() then true
    else exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = auth.uid()
        and p.key = p_permission_key
    )
  end
$$;

create or replace function public.has_any_permission(p_permissions text[], p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from unnest(coalesce(p_permissions, array[]::text[])) as permission_key
      where public.has_permission(permission_key, p_organization_id)
    ),
    false
  )
$$;

create or replace function public.require_permission(p_permission_key text, p_organization_id uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission(p_permission_key, p_organization_id) then
    raise exception 'insufficient permissions for %', p_permission_key using errcode = '42501';
  end if;
end;
$$;

create or replace function public.has_stage_permission(p_stage text, p_action text, p_organization_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case lower(trim(coalesce(p_action, 'view')))
    when 'view' then public.has_any_permission(
      array[
        public.workflow_permission_key(p_stage, 'create'),
        public.workflow_permission_key(p_stage, 'edit'),
        public.workflow_permission_key(p_stage, 'manage'),
        public.workflow_permission_key(p_stage, 'approve')
      ],
      p_organization_id
    )
    else public.has_permission(public.workflow_permission_key(p_stage, p_action), p_organization_id)
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
begin
  if v_user_id is null then
    return jsonb_build_object(
      'user_id', null,
      'legacy_role', null,
      'roles', '[]'::jsonb,
      'permissions', '[]'::jsonb
    );
  end if;

  select up.role into v_legacy_role
  from public.user_profiles up
  where up.auth_user_id = v_user_id
  limit 1;

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

  return jsonb_build_object(
    'user_id', v_user_id,
    'legacy_role', v_legacy_role,
    'roles', coalesce(v_roles, '[]'::jsonb),
    'permissions', coalesce(v_permissions, '[]'::jsonb)
  );
end;
$$;

create or replace function public.sync_user_profile_role_to_user_roles()
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

  if v_role_name is null then
    return new;
  end if;

  select id into v_role_id
  from public.roles
  where name = v_role_name;

  if v_role_id is null then
    return new;
  end if;

  delete from public.user_roles
  where user_id = new.auth_user_id
    and role_id <> v_role_id;

  insert into public.user_roles (user_id, role_id)
  values (new.auth_user_id, v_role_id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_sync_user_profile_role_to_user_roles on public.user_profiles;
create trigger trg_sync_user_profile_role_to_user_roles
after insert or update of role on public.user_profiles
for each row execute function public.sync_user_profile_role_to_user_roles();

create or replace function public.audit_if_write() returns trigger
language plpgsql
as $$
declare
  v_operation text := tg_op;
  v_old jsonb;
  v_new jsonb;
  v_pk_cols text[];
  v_pk jsonb := '{}'::jsonb;
  v_col text;
  v_user_text text;
  v_user_uuid uuid := null;
  v_entity_id text := null;
  v_action text := lower(tg_op);
begin
  if tg_table_name = 'audit_logs' and tg_table_schema = 'public' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_old := null;
  elsif tg_op = 'UPDATE' then
    v_new := to_jsonb(new);
    v_old := to_jsonb(old);
    if v_new = v_old then
      return null;
    end if;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_new := null;
  end if;

  begin
    v_user_text := current_setting('audit.user', true);
  exception when others then
    v_user_text := null;
  end;

  if v_user_text is null then
    begin
      v_user_text := current_setting('jwt.claims.user_id', true);
    exception when others then
      v_user_text := null;
    end;
  end if;

  if v_user_text is not null then
    begin
      v_user_uuid := v_user_text::uuid;
    exception when others then
      v_user_uuid := null;
    end;
  end if;

  select array_agg(a.attname::text order by a.attnum)
  into v_pk_cols
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = format('%I.%I', tg_table_schema, tg_table_name)::regclass
    and i.indisprimary;

  if v_pk_cols is null then
    if (v_new is not null and v_new ? 'id') or (v_old is not null and v_old ? 'id') then
      v_pk_cols := array['id'];
    else
      if v_new is not null then
        v_pk_cols := array[(select jsonb_object_keys(v_new)::text limit 1)];
      elsif v_old is not null then
        v_pk_cols := array[(select jsonb_object_keys(v_old)::text limit 1)];
      else
        v_pk_cols := array[]::text[];
      end if;
    end if;
  end if;

  foreach v_col in array v_pk_cols loop
    if v_col is null then
      continue;
    end if;

    if v_new is not null and (v_new ? v_col) then
      v_pk := v_pk || jsonb_build_object(v_col, v_new -> v_col);
    elsif v_old is not null and (v_old ? v_col) then
      v_pk := v_pk || jsonb_build_object(v_col, v_old -> v_col);
    else
      v_pk := v_pk || jsonb_build_object(v_col, null);
    end if;
  end loop;

  v_entity_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_pk::text);

  if tg_table_name = 'user_roles' then
    if tg_op = 'INSERT' then
      v_action := 'role_assigned';
    elsif tg_op = 'DELETE' then
      v_action := 'role_revoked';
    else
      v_action := 'role_updated';
    end if;
  elsif tg_table_name = 'role_permissions' then
    if tg_op = 'INSERT' then
      v_action := 'permission_granted';
    elsif tg_op = 'DELETE' then
      v_action := 'permission_revoked';
    else
      v_action := 'permission_updated';
    end if;
  end if;

  insert into public.audit_logs(
    id,
    table_schema,
    table_name,
    operation,
    changed_by,
    change_time,
    primary_key,
    old_data,
    new_data,
    change_summary,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    previous_value,
    new_value,
    created_at
  )
  values (
    gen_random_uuid(),
    tg_table_schema,
    tg_table_name,
    v_operation,
    v_user_uuid,
    now(),
    v_pk,
    v_old,
    v_new,
    case
      when v_action = 'role_assigned' then 'Assigned role'
      when v_action = 'role_revoked' then 'Revoked role'
      when v_action = 'permission_granted' then 'Granted permission'
      when v_action = 'permission_revoked' then 'Revoked permission'
      when v_operation = 'INSERT' then format('Inserted %s row', tg_table_name)
      when v_operation = 'UPDATE' then format('Updated %s row', tg_table_name)
      when v_operation = 'DELETE' then format('Deleted %s row', tg_table_name)
      else null
    end,
    v_user_uuid,
    v_action,
    tg_table_name,
    v_entity_id,
    v_old,
    v_new,
    now()
  );

  return null;
end;
$$;

alter function public.audit_if_write() owner to postgres;

drop trigger if exists trg_audit_roles on public.roles;
create trigger trg_audit_roles
after insert or update or delete on public.roles
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_permissions on public.permissions;
create trigger trg_audit_permissions
after insert or update or delete on public.permissions
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_role_permissions on public.role_permissions;
create trigger trg_audit_role_permissions
after insert or update or delete on public.role_permissions
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_user_roles on public.user_roles;
create trigger trg_audit_user_roles
after insert or update or delete on public.user_roles
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_user_profiles on public.user_profiles;
create trigger trg_audit_user_profiles
after insert or update or delete on public.user_profiles
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_audit_logs on public.audit_logs;
create trigger trg_audit_audit_logs
after insert or update or delete on public.audit_logs
for each row execute function public.audit_if_write();

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_profiles enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists roles_read on public.roles;
create policy roles_read
on public.roles
for select
to authenticated
using (public.has_any_permission(array['users.manage', 'settings.manage']));

drop policy if exists roles_write on public.roles;
create policy roles_write
on public.roles
for all
to authenticated
using (public.has_any_permission(array['users.manage', 'settings.manage']))
with check (public.has_any_permission(array['users.manage', 'settings.manage']));

drop policy if exists permissions_read on public.permissions;
create policy permissions_read
on public.permissions
for select
to authenticated
using (public.has_any_permission(array['users.manage', 'settings.manage']));

drop policy if exists permissions_write on public.permissions;
create policy permissions_write
on public.permissions
for all
to authenticated
using (public.has_any_permission(array['users.manage', 'settings.manage']))
with check (public.has_any_permission(array['users.manage', 'settings.manage']));

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read
on public.role_permissions
for select
to authenticated
using (public.has_any_permission(array['users.manage', 'settings.manage']));

drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write
on public.role_permissions
for all
to authenticated
using (public.has_any_permission(array['users.manage', 'settings.manage']))
with check (public.has_any_permission(array['users.manage', 'settings.manage']));

drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read
on public.user_roles
for select
to authenticated
using (public.has_any_permission(array['users.manage', 'settings.manage']));

drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_write
on public.user_roles
for all
to authenticated
using (public.has_permission('users.manage'))
with check (public.has_permission('users.manage'));

drop policy if exists user_profiles_read on public.user_profiles;
create policy user_profiles_read
on public.user_profiles
for select
to authenticated
using (true);

drop policy if exists user_profiles_write on public.user_profiles;
create policy user_profiles_write
on public.user_profiles
for all
to authenticated
using (public.has_permission('users.manage'))
with check (public.has_permission('users.manage'));

drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read
on public.audit_logs
for select
to authenticated
using (public.has_permission('audit_logs.view'));

drop policy if exists audit_logs_write on public.audit_logs;
create policy audit_logs_write
on public.audit_logs
for insert
to authenticated
with check (false);

alter table public.supplies enable row level security;
alter table public.supply_batches enable row level security;
alter table public.shipments enable row level security;
alter table public.daily_checks enable row level security;
alter table public.metal_detector_hourly_checks enable row level security;
alter table public.supply_quality_checks enable row level security;
alter table public.supply_supplier_sign_offs enable row level security;
alter table public.supply_vehicle_inspections enable row level security;
alter table public.process_lot_runs enable row level security;
alter table public.process_step_runs enable row level security;

drop policy if exists daily_checks_read on public.daily_checks;
create policy daily_checks_read
on public.daily_checks
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists supplies_read on public.supplies;
create policy supplies_read
on public.supplies
for select
to authenticated
using (true);

drop policy if exists supplies_write on public.supplies;
create policy supplies_write
on public.supplies
for all
to authenticated
using (public.has_any_permission(array['workflow.supply.create', 'workflow.supply.edit']))
with check (public.has_any_permission(array['workflow.supply.create', 'workflow.supply.edit']));

drop policy if exists supply_batches_read on public.supply_batches;
create policy supply_batches_read
on public.supply_batches
for select
to authenticated
using (true);

drop policy if exists supply_batches_write on public.supply_batches;
create policy supply_batches_write
on public.supply_batches
for all
to authenticated
using (public.has_any_permission(array['workflow.supply.create', 'workflow.supply.edit']))
with check (public.has_any_permission(array['workflow.supply.create', 'workflow.supply.edit']));

drop policy if exists shipments_read on public.shipments;
create policy shipments_read
on public.shipments
for select
to authenticated
using (true);

drop policy if exists shipments_write on public.shipments;
create policy shipments_write
on public.shipments
for all
to authenticated
using (public.has_any_permission(array['workflow.shipment.create', 'workflow.shipment.edit']))
with check (public.has_any_permission(array['workflow.shipment.create', 'workflow.shipment.edit']));

drop policy if exists metal_detector_hourly_checks_read on public.metal_detector_hourly_checks;
create policy metal_detector_hourly_checks_read
on public.metal_detector_hourly_checks
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists daily_checks_write on public.daily_checks;
create policy daily_checks_write
on public.daily_checks
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists metal_detector_hourly_checks_write on public.metal_detector_hourly_checks;
create policy metal_detector_hourly_checks_write
on public.metal_detector_hourly_checks
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists supply_quality_checks_write on public.supply_quality_checks;
create policy supply_quality_checks_write
on public.supply_quality_checks
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists supply_quality_checks_read on public.supply_quality_checks;
create policy supply_quality_checks_read
on public.supply_quality_checks
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists supply_supplier_sign_offs_write on public.supply_supplier_sign_offs;
create policy supply_supplier_sign_offs_write
on public.supply_supplier_sign_offs
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists supply_supplier_sign_offs_read on public.supply_supplier_sign_offs;
create policy supply_supplier_sign_offs_read
on public.supply_supplier_sign_offs
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists supply_vehicle_inspections_write on public.supply_vehicle_inspections;
create policy supply_vehicle_inspections_write
on public.supply_vehicle_inspections
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists supply_vehicle_inspections_read on public.supply_vehicle_inspections;
create policy supply_vehicle_inspections_read
on public.supply_vehicle_inspections
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists process_lot_runs_write on public.process_lot_runs;
create policy process_lot_runs_write
on public.process_lot_runs
for all
to authenticated
using (public.has_any_permission(array['workflow.supply.edit', 'workflow.approve', 'workflow.checklist.manage']))
with check (public.has_any_permission(array['workflow.supply.edit', 'workflow.approve', 'workflow.checklist.manage']));

drop policy if exists process_step_runs_write on public.process_step_runs;
create policy process_step_runs_write
on public.process_step_runs
for all
to authenticated
using (public.has_any_permission(array['workflow.supply.edit', 'workflow.approve', 'workflow.checklist.manage']))
with check (public.has_any_permission(array['workflow.supply.edit', 'workflow.approve', 'workflow.checklist.manage']));

drop policy if exists process_lot_runs_read on public.process_lot_runs;
create policy process_lot_runs_read
on public.process_lot_runs
for select
to authenticated
using (public.has_any_permission(array['workflow.supply.create', 'workflow.supply.edit', 'workflow.approve', 'workflow.checklist.manage']));

drop policy if exists process_step_runs_read on public.process_step_runs;
create policy process_step_runs_read
on public.process_step_runs
for select
to authenticated
using (public.has_any_permission(array['workflow.supply.create', 'workflow.supply.edit', 'workflow.approve', 'workflow.checklist.manage']));

drop policy if exists public_reports_read on public.supplies;
drop policy if exists public_reports_read on public.supply_batches;
drop policy if exists public_reports_read on public.shipments;

create or replace function public.get_reports_payload()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  perform public.require_permission('reports.view');

  select jsonb_build_object(
    'supplies', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.received_at desc nulls last)
      from (
        select id, doc_no, supplier_id, received_at
        from public.supplies
        order by received_at desc nulls last
        limit 1000
      ) s
    ), '[]'::jsonb),
    'supply_batches', coalesce((
      select jsonb_agg(to_jsonb(sb))
      from (
        select id, supply_id, received_qty, accepted_qty, rejected_qty, current_qty, quality_status, unit_price
        from public.supply_batches
      ) sb
    ), '[]'::jsonb),
    'suppliers', coalesce((
      select jsonb_agg(to_jsonb(sup) order by sup.name)
      from (
        select id, name, supplier_type, country, created_at
        from public.suppliers
        order by name
        limit 1000
      ) sup
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(p))
      from (
        select id, supply_id, amount, paid_at, reference
        from public.supply_payments
      ) p
    ), '[]'::jsonb),
    'shipments', coalesce((
      select jsonb_agg(to_jsonb(sh))
      from (
        select id, doc_status, planned_ship_date, shipped_at, created_at
        from public.shipments
      ) sh
    ), '[]'::jsonb)
  ) into v_payload;

  return coalesce(v_payload, '{}'::jsonb);
end;
$$;

grant execute on function public.map_legacy_role(text) to anon, authenticated, service_role;
grant execute on function public.workflow_permission_key(text, text) to anon, authenticated, service_role;
grant execute on function public.is_super_admin() to anon, authenticated, service_role;
grant execute on function public.has_permission(text, uuid) to anon, authenticated, service_role;
grant execute on function public.has_any_permission(text[], uuid) to anon, authenticated, service_role;
grant execute on function public.require_permission(text, uuid) to anon, authenticated, service_role;
grant execute on function public.has_stage_permission(text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.my_access_context() to anon, authenticated, service_role;
grant execute on function public.get_reports_payload() to anon, authenticated, service_role;

commit;
