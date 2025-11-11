-- Supply batches schema definition
create table if not exists public.supply_batches (
  id bigserial primary key,
  supply_id bigint not null references public.supplies (id) on delete cascade,
  supply_line_id bigint references public.supply_lines (id),
  product_id integer not null references public.products (id),
  unit_id integer references public.units (id),
  lot_no text not null constraint supply_batches_lot_no_key unique,
  received_qty numeric,
  accepted_qty numeric,
  rejected_qty numeric,
  current_qty numeric,
  quality_status text,
  process_status text not null default 'UNPROCESSED',
  expiry_date date,
  created_at timestamp with time zone default now(),
  constraint supply_batches_quality_status_check check (
    quality_status = any (array['PENDING'::text, 'PASSED'::text, 'FAILED'::text, 'HOLD'::text])
  ),
  constraint supply_batches_process_status_check check (
    process_status = any (array['UNPROCESSED'::text, 'PROCESSED'::text])
  )
) tablespace pg_default;

create index if not exists supply_batches_supply_id_idx on public.supply_batches using btree (supply_id) tablespace pg_default;
create index if not exists supply_batches_product_idx on public.supply_batches using btree (product_id) tablespace pg_default;
create index if not exists supply_batches_quality_idx on public.supply_batches using btree (quality_status) tablespace pg_default;
create index if not exists supply_batches_process_status_idx on public.supply_batches using btree (process_status) tablespace pg_default;

