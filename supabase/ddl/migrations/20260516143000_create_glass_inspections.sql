create table if not exists public.glass_inspections (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'DRAFT',
  inspection_date date,
  checked_by uuid references public.user_profiles(id) on delete set null,
  recorded_by uuid references public.user_profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint glass_inspections_status_check check (status in ('DRAFT', 'COMPLETED')),
  constraint glass_inspections_completed_consistency check (
    (status = 'DRAFT' and completed_at is null)
    or (status = 'COMPLETED' and completed_at is not null and checked_by is not null and inspection_date is not null)
  )
);

create table if not exists public.glass_inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.glass_inspections(id) on delete cascade,
  item_key text not null,
  area_name text not null,
  item_name text not null,
  total_quantity integer not null,
  qty_intact integer,
  qty_not_intact integer,
  action_required_nc_no text,
  risk_class text,
  action_completed boolean,
  signature text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint glass_inspection_items_quantity_check check (
    total_quantity >= 0
    and (qty_intact is null or qty_intact >= 0)
    and (qty_not_intact is null or qty_not_intact >= 0)
  ),
  constraint glass_inspection_items_risk_class_check check (risk_class is null or risk_class in ('1', '2', '3')),
  constraint glass_inspection_items_unique_key unique (inspection_id, item_key)
);

create index if not exists glass_inspections_status_idx
  on public.glass_inspections(status);

create index if not exists glass_inspections_inspection_date_idx
  on public.glass_inspections(inspection_date desc);

create index if not exists glass_inspections_checked_by_idx
  on public.glass_inspections(checked_by);

create index if not exists glass_inspection_items_inspection_id_idx
  on public.glass_inspection_items(inspection_id, sort_order);

create or replace trigger glass_inspections_set_updated_at
before update on public.glass_inspections
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger glass_inspection_items_set_updated_at
before update on public.glass_inspection_items
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_audit_glass_inspections on public.glass_inspections;
create trigger trg_audit_glass_inspections
after insert or update or delete on public.glass_inspections
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_glass_inspection_items on public.glass_inspection_items;
create trigger trg_audit_glass_inspection_items
after insert or update or delete on public.glass_inspection_items
for each row execute function public.audit_if_write();

alter table public.glass_inspections enable row level security;
alter table public.glass_inspection_items enable row level security;

drop policy if exists glass_inspections_read on public.glass_inspections;
create policy glass_inspections_read
on public.glass_inspections
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists glass_inspections_write on public.glass_inspections;
create policy glass_inspections_write
on public.glass_inspections
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists glass_inspection_items_read on public.glass_inspection_items;
create policy glass_inspection_items_read
on public.glass_inspection_items
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists glass_inspection_items_write on public.glass_inspection_items;
create policy glass_inspection_items_write
on public.glass_inspection_items
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

create or replace function public.upsert_glass_inspection(
  p_inspection_id uuid,
  p_status text,
  p_checked_by uuid,
  p_inspection_date date,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(trim(coalesce(p_status, 'DRAFT')));
  v_inspection_id uuid := p_inspection_id;
  v_recorded_by uuid;
  v_existing_status text;
  v_item jsonb;
  v_qty_intact integer;
  v_qty_not_intact integer;
  v_total_quantity integer;
  v_sort_order integer := 0;
begin
  perform public.require_permission('workflow.checklist.manage');

  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid glass inspection status: %', p_status using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'glass inspection items must be a JSON array' using errcode = '22023';
  end if;

  if v_status = 'COMPLETED' and (p_checked_by is null or p_inspection_date is null) then
    raise exception 'checked by and inspection date are required before submission' using errcode = '23514';
  end if;

  select id
  into v_recorded_by
  from public.user_profiles
  where auth_user_id = auth.uid()
    and deleted_at is null
  limit 1;

  if v_recorded_by is null then
    raise exception 'current user profile was not found' using errcode = '42501';
  end if;

  if v_inspection_id is not null then
    select status
    into v_existing_status
    from public.glass_inspections
    where id = v_inspection_id
    for update;

    if not found then
      raise exception 'glass inspection % was not found', v_inspection_id using errcode = 'P0002';
    end if;

    if v_existing_status = 'COMPLETED' then
      raise exception 'completed glass inspections are read-only' using errcode = '23514';
    end if;

    update public.glass_inspections
    set status = v_status,
        checked_by = p_checked_by,
        recorded_by = v_recorded_by,
        inspection_date = p_inspection_date,
        completed_at = case when v_status = 'COMPLETED' then now() else null end
    where id = v_inspection_id;
  else
    insert into public.glass_inspections (
      status,
      checked_by,
      recorded_by,
      inspection_date,
      completed_at
    )
    values (
      v_status,
      p_checked_by,
      v_recorded_by,
      p_inspection_date,
      case when v_status = 'COMPLETED' then now() else null end
    )
    returning id into v_inspection_id;
  end if;

  delete from public.glass_inspection_items
  where inspection_id = v_inspection_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;
    v_total_quantity := nullif(v_item->>'total_quantity', '')::integer;
    v_qty_intact := nullif(v_item->>'qty_intact', '')::integer;
    v_qty_not_intact := nullif(v_item->>'qty_not_intact', '')::integer;

    if nullif(trim(v_item->>'item_key'), '') is null
      or nullif(trim(v_item->>'area_name'), '') is null
      or nullif(trim(v_item->>'item_name'), '') is null
      or v_total_quantity is null
    then
      raise exception 'each glass inspection item needs an item key, area, item name, and total quantity' using errcode = '23514';
    end if;

    if v_status = 'COMPLETED' then
      if v_qty_intact is null or v_qty_not_intact is null then
        raise exception 'all glass inspection quantities are required before submission' using errcode = '23514';
      end if;

      if v_qty_intact + v_qty_not_intact <> v_total_quantity then
        raise exception 'intact and not intact quantities must equal total quantity for %', v_item->>'item_name' using errcode = '23514';
      end if;

      if nullif(trim(v_item->>'signature'), '') is null then
        raise exception 'each glass inspection row needs a signature before submission' using errcode = '23514';
      end if;

      if v_qty_not_intact > 0 and (
        nullif(trim(v_item->>'action_required_nc_no'), '') is null
        or nullif(trim(v_item->>'risk_class'), '') is null
        or nullif(trim(v_item->>'action_completed'), '') is null
      ) then
        raise exception 'non-intact glass rows need NC number, risk class, and action status' using errcode = '23514';
      end if;
    end if;

    insert into public.glass_inspection_items (
      inspection_id,
      item_key,
      area_name,
      item_name,
      total_quantity,
      qty_intact,
      qty_not_intact,
      action_required_nc_no,
      risk_class,
      action_completed,
      signature,
      sort_order
    )
    values (
      v_inspection_id,
      trim(v_item->>'item_key'),
      trim(v_item->>'area_name'),
      trim(v_item->>'item_name'),
      v_total_quantity,
      v_qty_intact,
      v_qty_not_intact,
      nullif(trim(v_item->>'action_required_nc_no'), ''),
      nullif(trim(v_item->>'risk_class'), ''),
      case
        when v_item ? 'action_completed' then (v_item->>'action_completed')::boolean
        else null
      end,
      nullif(trim(v_item->>'signature'), ''),
      coalesce(nullif(v_item->>'sort_order', '')::integer, v_sort_order)
    );
  end loop;

  return v_inspection_id;
end;
$$;

grant all on table public.glass_inspections to authenticated;
grant all on table public.glass_inspection_items to authenticated;
grant execute on function public.upsert_glass_inspection(uuid, text, uuid, date, jsonb) to authenticated;
