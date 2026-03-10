alter table public.supply_batches
  add column if not exists outer_unit_id integer references public.units(id),
  add column if not exists outer_unit_qty numeric,
  add column if not exists inner_units_per_outer numeric;
