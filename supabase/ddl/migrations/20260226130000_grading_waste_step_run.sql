-- Allow grading to record waste directly at step-run level without grading outputs.
ALTER TABLE public.process_grading_waste
  ADD COLUMN IF NOT EXISTS process_step_run_id bigint;

-- Backfill step run from existing grading output links (if any historical rows exist).
UPDATE public.process_grading_waste gw
SET process_step_run_id = go.process_step_run_id
FROM public.process_grading_outputs go
WHERE gw.process_step_run_id IS NULL
  AND gw.sorting_run_id = go.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'process_grading_waste_process_step_run_id_fkey'
  ) THEN
    ALTER TABLE public.process_grading_waste
      ADD CONSTRAINT process_grading_waste_process_step_run_id_fkey
      FOREIGN KEY (process_step_run_id) REFERENCES public.process_step_runs(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS process_grading_waste_process_step_run_id_idx
  ON public.process_grading_waste(process_step_run_id);

-- Keep sorting_run_id for backward compatibility; it is no longer required.
ALTER TABLE public.process_grading_waste
  ALTER COLUMN sorting_run_id DROP NOT NULL;
