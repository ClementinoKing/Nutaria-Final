-- Ensure only one packaging run per process step run
alter table if exists public.process_packaging_runs
  add constraint process_packaging_runs_step_run_unique unique (process_step_run_id);
