-- Move storage allocation from shipment authoring to packaging.
-- New rows in shipment_pack_items can reference finalized packaging allocations.

create table if not exists public.process_packaging_storage_allocations (
  id bigserial not null,
  packaging_run_id bigint not null,
  pack_entry_id bigint not null,
  storage_type text not null,
  units_count integer not null,
  packs_per_unit integer not null,
  total_packs integer not null,
  total_quantity_kg numeric not null,
  notes text null,
  created_by uuid null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_packaging_storage_allocations_pkey primary key (id),
  constraint process_packaging_storage_allocations_packaging_run_id_fkey
    foreign key (packaging_run_id) references public.process_packaging_runs (id) on delete cascade,
  constraint process_packaging_storage_allocations_pack_entry_id_fkey
    foreign key (pack_entry_id) references public.process_packaging_pack_entries (id) on delete restrict,
  constraint process_packaging_storage_allocations_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint process_packaging_storage_allocations_storage_type_check
    check (storage_type in ('BOX', 'BAG', 'SHOP_PACKING')),
  constraint process_packaging_storage_allocations_units_count_check
    check (units_count > 0),
  constraint process_packaging_storage_allocations_packs_per_unit_check
    check (packs_per_unit > 0),
  constraint process_packaging_storage_allocations_total_packs_check
    check (total_packs = (units_count * packs_per_unit)),
  constraint process_packaging_storage_allocations_total_quantity_kg_check
    check (total_quantity_kg > 0)
) tablespace pg_default;

create index if not exists process_packaging_storage_allocations_packaging_run_id_idx
  on public.process_packaging_storage_allocations using btree (packaging_run_id)
  tablespace pg_default;

create index if not exists process_packaging_storage_allocations_pack_entry_id_idx
  on public.process_packaging_storage_allocations using btree (pack_entry_id)
  tablespace pg_default;

create index if not exists process_packaging_storage_allocations_storage_type_idx
  on public.process_packaging_storage_allocations using btree (storage_type)
  tablespace pg_default;

create index if not exists process_packaging_storage_allocations_created_at_desc_idx
  on public.process_packaging_storage_allocations using btree (created_at desc)
  tablespace pg_default;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'process_packaging_storage_allocations_set_updated_at'
  ) then
    create trigger process_packaging_storage_allocations_set_updated_at
      before update on public.process_packaging_storage_allocations
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;

alter table public.shipment_pack_items
  add column if not exists packaging_allocation_id bigint null;

alter table public.shipment_pack_items
  add column if not exists units_count integer null;

alter table public.shipment_pack_items
  add column if not exists storage_type text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shipment_pack_items_packaging_allocation_id_fkey'
  ) then
    alter table public.shipment_pack_items
      add constraint shipment_pack_items_packaging_allocation_id_fkey
      foreign key (packaging_allocation_id)
      references public.process_packaging_storage_allocations (id)
      on delete restrict;
  end if;
end
$$;

alter table public.shipment_pack_items
  drop constraint if exists shipment_pack_items_units_count_check;

alter table public.shipment_pack_items
  add constraint shipment_pack_items_units_count_check
  check (units_count is null or units_count > 0);

alter table public.shipment_pack_items
  drop constraint if exists shipment_pack_items_storage_type_check;

alter table public.shipment_pack_items
  add constraint shipment_pack_items_storage_type_check
  check (storage_type is null or storage_type in ('BOX', 'BAG', 'SHOP_PACKING'));

create index if not exists shipment_pack_items_packaging_allocation_id_idx
  on public.shipment_pack_items using btree (packaging_allocation_id);

-- Guard: storage allocations cannot be reduced below already-shipped units (non-cancelled shipments).
create or replace function public.guard_packaging_storage_allocation_mutation()
returns trigger
language plpgsql
as $$
declare
  shipped_units integer;
begin
  select coalesce(sum(spi.units_count), 0)::integer
  into shipped_units
  from public.shipment_pack_items spi
  join public.shipments s on s.id = spi.shipment_id
  where spi.packaging_allocation_id = old.id
    and s.doc_status <> 'CANCELLED';

  if tg_op = 'DELETE' then
    if shipped_units > 0 then
      raise exception 'Cannot delete allocation %, % units already shipped', old.id, shipped_units;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.units_count < shipped_units then
      raise exception 'Cannot reduce units_count below shipped units (%). Allocation %', shipped_units, old.id;
    end if;
    return new;
  end if;

  return coalesce(new, old);
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'guard_packaging_storage_allocation_mutation_trg'
  ) then
    create trigger guard_packaging_storage_allocation_mutation_trg
      before update or delete on public.process_packaging_storage_allocations
      for each row
      execute function public.guard_packaging_storage_allocation_mutation();
  end if;
end
$$;

-- Guard: shipments cannot over-consume storage allocation units.
create or replace function public.guard_shipment_pack_item_units()
returns trigger
language plpgsql
as $$
declare
  allocation_units integer;
  consumed_other integer;
  next_units integer;
begin
  if new.packaging_allocation_id is null then
    return new;
  end if;

  next_units := coalesce(new.units_count, 0);
  if next_units <= 0 then
    raise exception 'units_count must be > 0 when packaging_allocation_id is set';
  end if;

  select units_count into allocation_units
  from public.process_packaging_storage_allocations
  where id = new.packaging_allocation_id;

  if allocation_units is null then
    raise exception 'Packaging allocation % not found', new.packaging_allocation_id;
  end if;

  select coalesce(sum(spi.units_count), 0)::integer
  into consumed_other
  from public.shipment_pack_items spi
  join public.shipments s on s.id = spi.shipment_id
  where spi.packaging_allocation_id = new.packaging_allocation_id
    and s.doc_status <> 'CANCELLED'
    and (tg_op <> 'UPDATE' or spi.id <> old.id);

  if next_units > (allocation_units - consumed_other) then
    raise exception 'Requested units (%) exceed allocation remaining units (%)',
      next_units, (allocation_units - consumed_other);
  end if;

  return new;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'guard_shipment_pack_item_units_trg'
  ) then
    create trigger guard_shipment_pack_item_units_trg
      before insert or update on public.shipment_pack_items
      for each row
      execute function public.guard_shipment_pack_item_units();
  end if;
end
$$;
