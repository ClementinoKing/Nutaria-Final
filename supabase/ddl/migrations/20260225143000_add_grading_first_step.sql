BEGIN;

INSERT INTO public.process_step_names (code, name, description, created_at, updated_at)
VALUES ('GRAD', 'GRADING', 'Grading step (sorting-equivalent)', now(), now())
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = now();

WITH grading_name AS (
  SELECT id
  FROM public.process_step_names
  WHERE upper(code) = 'GRAD'
  LIMIT 1
),
active_processes AS (
  SELECT DISTINCT pp.process_id
  FROM public.product_processes pp
  WHERE (pp.effective_from IS NULL OR pp.effective_from <= CURRENT_DATE)
    AND (pp.effective_to IS NULL OR pp.effective_to >= CURRENT_DATE)
),
missing_grading AS (
  SELECT ap.process_id, gn.id AS grading_step_name_id
  FROM active_processes ap
  CROSS JOIN grading_name gn
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.process_steps ps
    JOIN public.process_step_names psn ON psn.id = ps.step_name_id
    WHERE ps.process_id = ap.process_id
      AND upper(psn.code) = 'GRAD'
  )
)
UPDATE public.process_steps ps
SET seq = ps.seq + 1
FROM missing_grading mg
WHERE ps.process_id = mg.process_id;

WITH grading_name AS (
  SELECT id
  FROM public.process_step_names
  WHERE upper(code) = 'GRAD'
  LIMIT 1
),
active_processes AS (
  SELECT DISTINCT pp.process_id
  FROM public.product_processes pp
  WHERE (pp.effective_from IS NULL OR pp.effective_from <= CURRENT_DATE)
    AND (pp.effective_to IS NULL OR pp.effective_to >= CURRENT_DATE)
),
missing_grading AS (
  SELECT ap.process_id, gn.id AS grading_step_name_id
  FROM active_processes ap
  CROSS JOIN grading_name gn
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.process_steps ps
    JOIN public.process_step_names psn ON psn.id = ps.step_name_id
    WHERE ps.process_id = ap.process_id
      AND upper(psn.code) = 'GRAD'
  )
)
INSERT INTO public.process_steps (
  process_id,
  seq,
  description,
  requires_qc,
  default_location_id,
  estimated_duration,
  created_at,
  updated_at,
  can_be_skipped,
  step_name_id
)
SELECT
  mg.process_id,
  1,
  COALESCE(sort_step.description, 'Grading step'),
  COALESCE(sort_step.requires_qc, false),
  sort_step.default_location_id,
  sort_step.estimated_duration,
  now(),
  now(),
  COALESCE(sort_step.can_be_skipped, false),
  mg.grading_step_name_id
FROM missing_grading mg
LEFT JOIN LATERAL (
  SELECT
    ps.description,
    ps.requires_qc,
    ps.default_location_id,
    ps.estimated_duration,
    ps.can_be_skipped
  FROM public.process_steps ps
  JOIN public.process_step_names psn ON psn.id = ps.step_name_id
  WHERE ps.process_id = mg.process_id
    AND upper(psn.code) = 'SORT'
  ORDER BY ps.seq ASC
  LIMIT 1
) sort_step ON true;

COMMIT;
