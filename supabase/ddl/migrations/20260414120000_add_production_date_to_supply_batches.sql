alter table public.supply_batches
  add column if not exists production_date date;
