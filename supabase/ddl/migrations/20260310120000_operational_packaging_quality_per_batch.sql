alter table if exists public.supply_packaging_quality_checks
  add column if not exists lot_id bigint references public.supply_batches(id) on delete cascade;

drop index if exists public.supply_packaging_quality_checks_supply_id_idx;

alter table if exists public.supply_packaging_quality_checks
  drop constraint if exists supply_packaging_quality_checks_supply_id_unique;

create index if not exists supply_packaging_quality_checks_supply_id_idx
  on public.supply_packaging_quality_checks using btree (supply_id);

create unique index if not exists supply_packaging_quality_checks_supply_lot_unique
  on public.supply_packaging_quality_checks using btree (supply_id, lot_id)
  where lot_id is not null;
