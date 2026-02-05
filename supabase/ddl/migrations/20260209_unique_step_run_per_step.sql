-- Ensure exactly one step entry (washing/drying/metal session) per process_step_run_id.
-- Removes duplicates then adds unique constraints so upsert can be used safely.

-- 1. Washing: keep one row per process_step_run_id (keep lowest id), then add unique
delete from public.process_washing_runs a
using public.process_washing_runs b
where a.process_step_run_id = b.process_step_run_id and a.id > b.id;

alter table public.process_washing_runs
  drop constraint if exists process_washing_runs_process_step_run_id_key;
alter table public.process_washing_runs
  add constraint process_washing_runs_process_step_run_id_key unique (process_step_run_id);

-- 2. Drying: same
delete from public.process_drying_runs a
using public.process_drying_runs b
where a.process_step_run_id = b.process_step_run_id and a.id > b.id;

alter table public.process_drying_runs
  drop constraint if exists process_drying_runs_process_step_run_id_key;
alter table public.process_drying_runs
  add constraint process_drying_runs_process_step_run_id_key unique (process_step_run_id);

-- 3. Metal detector: one session per step run
delete from public.process_metal_detector a
using public.process_metal_detector b
where a.process_step_run_id = b.process_step_run_id and a.id > b.id;

alter table public.process_metal_detector
  drop constraint if exists process_metal_detector_process_step_run_id_key;
alter table public.process_metal_detector
  add constraint process_metal_detector_process_step_run_id_key unique (process_step_run_id);
