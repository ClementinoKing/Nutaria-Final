-- Remove notes column from process_step_runs (step-level notes removed from UI; use step data remarks where needed)
alter table public.process_step_runs
  drop column if exists notes;
