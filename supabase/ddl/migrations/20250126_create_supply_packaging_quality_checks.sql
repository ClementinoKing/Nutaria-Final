-- Create supply_packaging_quality_checks table
create table if not exists public.supply_packaging_quality_checks (
  id bigserial primary key,
  supply_id bigint not null references public.supplies (id) on delete cascade,
  checked_by bigint null references public.user_profiles (id) on delete set null,
  checked_at timestamp with time zone default now(),
  remarks text null,
  constraint supply_packaging_quality_checks_supply_id_unique unique (supply_id)
) tablespace pg_default;

create index if not exists supply_packaging_quality_checks_supply_id_idx
  on public.supply_packaging_quality_checks using btree (supply_id) tablespace pg_default;

create trigger trg_audit_supply_packaging_quality_checks
after INSERT
or DELETE
or UPDATE on supply_packaging_quality_checks for EACH row
execute FUNCTION audit_if_write ();
