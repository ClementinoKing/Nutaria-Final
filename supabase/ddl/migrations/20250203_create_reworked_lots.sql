-- Create reworked_lots table to track reworked batches
create table if not exists public.reworked_lots (
  id bigserial primary key,
  original_supply_batch_id bigint not null references public.supply_batches (id) on delete cascade,
  rework_supply_batch_id bigint not null references public.supply_batches (id) on delete cascade,
  sorting_output_id bigint references public.process_sorting_outputs (id) on delete set null,
  process_step_run_id bigint not null references public.process_step_runs (id) on delete cascade,
  quantity_kg numeric not null,
  reason text,
  created_at timestamp with time zone not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint reworked_lots_rework_batch_unique unique (rework_supply_batch_id)
);

create index if not exists reworked_lots_original_batch_idx
  on public.reworked_lots using btree (original_supply_batch_id);

create index if not exists reworked_lots_rework_batch_idx
  on public.reworked_lots using btree (rework_supply_batch_id);

create index if not exists reworked_lots_sorting_output_idx
  on public.reworked_lots using btree (sorting_output_id);

create index if not exists reworked_lots_process_step_run_idx
  on public.reworked_lots using btree (process_step_run_id);

comment on table public.reworked_lots is 'Tracks batches that have been reworked, linking them to their original batches';
comment on column public.reworked_lots.original_supply_batch_id is 'The original supply batch that was reworked';
comment on column public.reworked_lots.rework_supply_batch_id is 'The new supply batch created for the rework';
comment on column public.reworked_lots.sorting_output_id is 'The sorting output that triggered the rework';
comment on column public.reworked_lots.process_step_run_id is 'The sorting step run that created the rework';
