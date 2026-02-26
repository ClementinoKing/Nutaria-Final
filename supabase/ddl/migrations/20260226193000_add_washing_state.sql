ALTER TABLE public.process_washing_runs
ADD COLUMN IF NOT EXISTS washing_state text NOT NULL DEFAULT 'PENDING';

UPDATE public.process_washing_runs
SET washing_state = 'WASHED'
WHERE coalesce(washing_state, '') = '';

ALTER TABLE public.process_washing_runs
DROP CONSTRAINT IF EXISTS process_washing_runs_washing_state_check;

ALTER TABLE public.process_washing_runs
ADD CONSTRAINT process_washing_runs_washing_state_check
CHECK (washing_state IN ('PENDING', 'WASHED'));
