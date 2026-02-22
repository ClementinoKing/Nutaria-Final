-- Create supply_vehicle_inspections table
create table if not exists public.supply_vehicle_inspections (
  id bigserial primary key,
  supply_id bigint not null references public.supplies (id) on delete cascade,
  vehicle_clean text not null,
  no_foreign_objects text not null,
  no_pest_infestation text not null,
  inspected_by bigint null references public.user_profiles (id) on delete set null,
  inspected_at timestamp with time zone default now(),
  remarks text null,
  constraint supply_vehicle_inspections_supply_id_unique unique (supply_id),
  constraint supply_vehicle_inspections_vehicle_clean_check check (
    vehicle_clean = any (array['YES'::text, 'NO'::text, 'NA'::text])
  ),
  constraint supply_vehicle_inspections_no_foreign_objects_check check (
    no_foreign_objects = any (array['YES'::text, 'NO'::text, 'NA'::text])
  ),
  constraint supply_vehicle_inspections_no_pest_infestation_check check (
    no_pest_infestation = any (array['YES'::text, 'NO'::text, 'NA'::text])
  )
) tablespace pg_default;

create index if not exists supply_vehicle_inspections_supply_id_idx
  on public.supply_vehicle_inspections using btree (supply_id) tablespace pg_default;

create trigger trg_audit_supply_vehicle_inspections
after INSERT
or DELETE
or UPDATE on supply_vehicle_inspections for EACH row
execute FUNCTION audit_if_write ();
