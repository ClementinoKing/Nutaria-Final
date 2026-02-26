-- Move pricing to batches and remove legacy supply_lines table.
ALTER TABLE public.supply_batches
ADD COLUMN IF NOT EXISTS unit_price numeric;

UPDATE public.supply_batches AS sb
SET unit_price = sl.unit_price
FROM public.supply_lines AS sl
WHERE sb.supply_line_id = sl.id
  AND sb.unit_price IS NULL;

ALTER TABLE public.supply_batches
DROP CONSTRAINT IF EXISTS supply_batches_supply_line_id_fkey;

ALTER TABLE public.supply_batches
DROP COLUMN IF EXISTS supply_line_id;

DROP TABLE IF EXISTS public.supply_lines CASCADE;
