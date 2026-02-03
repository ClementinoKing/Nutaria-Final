-- Add SKIPPED status to process_step_runs and skip tracking fields
alter table public.process_step_runs
  drop constraint if exists process_step_runs_status_check;

alter table public.process_step_runs
  add constraint process_step_runs_status_check check (
    status = any (array['PENDING'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'FAILED'::text, 'SKIPPED'::text])
  );

alter table public.process_step_runs
  add column if not exists skipped_at timestamp with time zone null;

alter table public.process_step_runs
  add column if not exists skipped_by uuid references auth.users (id) on delete set null;

create index if not exists process_step_runs_skipped_by_idx
  on public.process_step_runs using btree (skipped_by);

comment on column public.process_step_runs.skipped_at is 'Timestamp when the step was skipped';
comment on column public.process_step_runs.skipped_by is 'User who skipped the step';
