-- Allow deleting process steps that already have execution rows by cascading
-- to process_step_runs (and onward to step-run child tables via existing cascades).

alter table public.process_step_runs
  drop constraint if exists process_step_runs_step_fkey;

alter table public.process_step_runs
  drop constraint if exists process_step_runs_process_step_id_fkey;

alter table public.process_step_runs
  add constraint process_step_runs_step_fkey
  foreign key (process_step_id)
  references public.process_steps (id)
  on delete cascade;
