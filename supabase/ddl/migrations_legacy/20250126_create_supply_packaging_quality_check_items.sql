-- Create supply_packaging_quality_check_items table
create table if not exists public.supply_packaging_quality_check_items (
  id bigserial primary key,
  packaging_check_id bigint not null references public.supply_packaging_quality_checks (id) on delete cascade,
  parameter_id integer not null references public.packaging_quality_parameters (id) on delete restrict,
  value text null,
  numeric_value numeric null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint supply_packaging_quality_check_items_packaging_check_parameter_unique unique (packaging_check_id, parameter_id)
) tablespace pg_default;

create index if not exists supply_packaging_quality_check_items_packaging_check_id_idx
  on public.supply_packaging_quality_check_items using btree (packaging_check_id) tablespace pg_default;

create index if not exists supply_packaging_quality_check_items_parameter_id_idx
  on public.supply_packaging_quality_check_items using btree (parameter_id) tablespace pg_default;

create trigger trg_audit_supply_packaging_quality_check_items
after INSERT
or DELETE
or UPDATE on supply_packaging_quality_check_items for EACH row
execute FUNCTION audit_if_write ();
