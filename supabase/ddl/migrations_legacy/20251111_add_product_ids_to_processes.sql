alter table public.processes
  add column if not exists product_ids integer[]
    not null default '{}'::integer[];

create index if not exists processes_product_ids_idx
  on public.processes using gin (product_ids);

