alter table public.supply_batches
  add column if not exists process_status text
    not null default 'UNPROCESSED';

alter table public.supply_batches
  add constraint supply_batches_process_status_check
    check (process_status = any (array['UNPROCESSED'::text, 'PROCESSED'::text]));

update public.supply_batches
  set process_status = 'UNPROCESSED'
  where coalesce(process_status, '') = '';

create index if not exists supply_batches_process_status_idx
  on public.supply_batches using btree (process_status);

