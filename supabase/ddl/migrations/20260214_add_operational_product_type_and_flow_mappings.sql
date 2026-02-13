-- Add OP as supported product type
alter table public.products
  drop constraint if exists products_product_type_check;

alter table public.products
  add constraint products_product_type_check
  check (product_type = any (array['RAW'::text, 'WIP'::text, 'FINISHED'::text, 'OP'::text]));

-- Operational supply flow templates
create table if not exists public.operational_supply_flows (
  id bigserial primary key,
  code text not null unique,
  supply_name text not null,
  receiving_note text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_supply_flow_products (
  id bigserial primary key,
  flow_id bigint not null references public.operational_supply_flows (id) on delete cascade,
  product_id integer not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (flow_id, product_id)
);

create index if not exists operational_supply_flow_products_flow_id_idx
  on public.operational_supply_flow_products (flow_id);

create index if not exists operational_supply_flow_products_product_id_idx
  on public.operational_supply_flow_products (product_id);

-- Seed 6 operational supply flow templates
insert into public.operational_supply_flows (code, supply_name, receiving_note)
values
  ('AIR_PRODUCTS_NITROGEN_GAS', 'Nitrogen gas', 'Confirm cylinder count, pressure status, and safety labels before receiving.'),
  ('BAG_IN_A_BOX_VACUUM_BAGS', 'Vacuum bags', 'Check seal integrity, micron spec, and box condition before acceptance.'),
  ('WANG_ON_FIBRE_POLY_BAGS', 'Poly bags', 'Check bag gauge, print quality, and contamination-free packing.'),
  ('UPCRAFT_SOLUTIONS_PALLETS', 'Pallets', 'Inspect pallet strength, dimensions, and broken-board count.'),
  ('GREEK_DISTRIBUTORS_PALLET_WRAP', 'Pallet wrap', 'Confirm roll width/thickness and verify no tears or deformation.'),
  ('DELUXE_CHEMICALS_PROCESSING_AND_CLEANING_CHEMICALS', 'Processing and cleaning chemicals', 'Validate SDS availability, batch/expiry, and hazard label compliance.')
on conflict (code) do update
set
  supply_name = excluded.supply_name,
  receiving_note = excluded.receiving_note,
  is_active = true,
  updated_at = now();

-- Guard mapping rows so only OP products can be mapped to operational flows
create or replace function public.validate_operational_flow_product_type()
returns trigger
language plpgsql
as $$
declare
  v_type text;
begin
  select product_type into v_type
  from public.products
  where id = new.product_id;

  if v_type is distinct from 'OP' then
    raise exception 'Only products with product_type=OP can be mapped to operational supply flows. product_id=% type=%', new.product_id, coalesce(v_type, 'NULL');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_operational_flow_product_type on public.operational_supply_flow_products;
create trigger trg_validate_operational_flow_product_type
before insert or update on public.operational_supply_flow_products
for each row
execute function public.validate_operational_flow_product_type();
