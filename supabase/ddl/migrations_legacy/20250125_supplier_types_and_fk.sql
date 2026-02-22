-- Supplier types lookup table and suppliers FK migration
-- Creates supplier_types, seeds NUT/OPERATIONAL, drops CHECK, makes supplier_type nullable, adds FK.

create table if not exists public.supplier_types (
  code text not null,
  name text not null,
  constraint supplier_types_pkey primary key (code)
) tablespace pg_default;

-- Seed existing types so current supplier data remains valid
insert into public.supplier_types (code, name)
values
  ('NUT', 'Nut Supplier'),
  ('OPERATIONAL', 'Operational Supplier')
on conflict (code) do nothing;

-- Drop CHECK constraint and make supplier_type nullable
alter table if exists public.suppliers
  drop constraint if exists suppliers_supplier_type_check;

alter table if exists public.suppliers
  alter column supplier_type drop not null;

-- Add FK to supplier_types
alter table if exists public.suppliers
  add constraint suppliers_supplier_type_fkey
  foreign key (supplier_type) references public.supplier_types (code);
