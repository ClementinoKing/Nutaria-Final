-- Allow one washing run per graded WIP output (within the same washing step run).
ALTER TABLE public.process_washing_runs
ADD COLUMN IF NOT EXISTS grading_output_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'process_washing_runs_grading_output_id_fkey'
  ) THEN
    ALTER TABLE public.process_washing_runs
      ADD CONSTRAINT process_washing_runs_grading_output_id_fkey
      FOREIGN KEY (grading_output_id) REFERENCES public.process_grading_outputs(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.process_washing_runs
DROP CONSTRAINT IF EXISTS process_washing_runs_process_step_run_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS process_washing_runs_step_run_grading_output_uidx
  ON public.process_washing_runs (process_step_run_id, grading_output_id);

CREATE UNIQUE INDEX IF NOT EXISTS process_washing_runs_step_run_null_grading_output_uidx
  ON public.process_washing_runs (process_step_run_id)
  WHERE grading_output_id IS NULL;

CREATE INDEX IF NOT EXISTS process_washing_runs_grading_output_id_idx
  ON public.process_washing_runs (grading_output_id);
