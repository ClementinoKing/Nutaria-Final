-- Add is_rework flag and original_process_lot_run_id to process_lot_runs
alter table public.process_lot_runs
  add column if not exists is_rework boolean not null default false;

alter table public.process_lot_runs
  add column if not exists original_process_lot_run_id bigint references public.process_lot_runs (id) on delete set null;

create index if not exists process_lot_runs_is_rework_idx
  on public.process_lot_runs using btree (is_rework);

create index if not exists process_lot_runs_original_lot_run_idx
  on public.process_lot_runs using btree (original_process_lot_run_id);

comment on column public.process_lot_runs.is_rework is 'Indicates if this process lot run is for a reworked batch';
comment on column public.process_lot_runs.original_process_lot_run_id is 'Links rework process runs to their original process lot run';
