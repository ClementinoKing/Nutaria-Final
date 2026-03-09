drop index if exists public.supply_quality_checks_supply_id_idx;

create unique index if not exists supply_quality_checks_supply_lot_unique_idx
  on public.supply_quality_checks (supply_id, lot_id)
  where lot_id is not null;
