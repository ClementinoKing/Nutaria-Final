ALTER TABLE public.process_lot_run_batches
  ADD COLUMN IF NOT EXISTS allocated_qty numeric;

UPDATE public.process_lot_run_batches plrb
SET allocated_qty = COALESCE(NULLIF(sb.current_qty, 0), sb.received_qty, sb.accepted_qty, 0)
FROM public.supply_batches sb
WHERE sb.id = plrb.supply_batch_id
  AND plrb.allocated_qty IS NULL;

ALTER TABLE public.process_lot_run_batches
  ALTER COLUMN allocated_qty SET NOT NULL,
  ALTER COLUMN allocated_qty SET DEFAULT 0,
  ADD CONSTRAINT process_lot_run_batches_allocated_qty_non_negative CHECK (allocated_qty >= 0);

ALTER TABLE public.process_lot_run_batches
  DROP CONSTRAINT IF EXISTS process_lot_run_batches_batch_unique;

ALTER TABLE public.process_lot_runs
  DROP CONSTRAINT IF EXISTS process_lot_runs_batch_unique;

CREATE INDEX IF NOT EXISTS process_lot_run_batches_supply_batch_idx
  ON public.process_lot_run_batches USING btree (supply_batch_id);

CREATE OR REPLACE FUNCTION public.create_process_run_with_allocations(
  p_process_id bigint,
  p_allocations jsonb
)
RETURNS public.process_lot_runs
LANGUAGE plpgsql
AS $$
DECLARE
  v_allocation record;
  v_batch public.supply_batches%ROWTYPE;
  v_primary_supply_batch_id bigint;
  v_run public.process_lot_runs%ROWTYPE;
  v_remaining_qty numeric;
BEGIN
  IF p_process_id IS NULL THEN
    RAISE EXCEPTION 'Process is required';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Select at least one lot to start processing';
  END IF;

  SELECT (item->>'supply_batch_id')::bigint
  INTO v_primary_supply_batch_id
  FROM jsonb_array_elements(p_allocations) WITH ORDINALITY AS items(item, ordinality)
  ORDER BY ordinality
  LIMIT 1;

  IF v_primary_supply_batch_id IS NULL THEN
    RAISE EXCEPTION 'Primary lot is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT (item->>'supply_batch_id')::bigint AS supply_batch_id, count(*) AS row_count
      FROM jsonb_array_elements(p_allocations) AS items(item)
      GROUP BY (item->>'supply_batch_id')::bigint
    ) duplicates
    WHERE duplicates.supply_batch_id IS NULL OR duplicates.row_count > 1
  ) THEN
    RAISE EXCEPTION 'Each selected lot must be unique';
  END IF;

  INSERT INTO public.process_lot_runs (
    supply_batch_id,
    process_id,
    status,
    started_at
  )
  VALUES (
    v_primary_supply_batch_id,
    p_process_id,
    'IN_PROGRESS',
    now()
  )
  RETURNING * INTO v_run;

  FOR v_allocation IN
    SELECT
      supply_batch_id,
      allocated_qty
    FROM jsonb_to_recordset(p_allocations) AS allocation(
      supply_batch_id bigint,
      allocated_qty numeric
    )
    ORDER BY supply_batch_id
  LOOP
    IF v_allocation.supply_batch_id IS NULL THEN
      RAISE EXCEPTION 'Lot id is required';
    END IF;

    IF v_allocation.allocated_qty IS NULL OR v_allocation.allocated_qty <= 0 THEN
      RAISE EXCEPTION 'Allocated quantity must be greater than zero for lot %', v_allocation.supply_batch_id;
    END IF;

    SELECT *
    INTO v_batch
    FROM public.supply_batches
    WHERE id = v_allocation.supply_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lot % could not be loaded', v_allocation.supply_batch_id;
    END IF;

    IF COALESCE(v_batch.current_qty, 0) < v_allocation.allocated_qty THEN
      RAISE EXCEPTION 'Allocated quantity % exceeds available quantity % for lot %',
        v_allocation.allocated_qty,
        COALESCE(v_batch.current_qty, 0),
        v_allocation.supply_batch_id;
    END IF;

    IF UPPER(COALESCE(v_batch.process_status, '')) = 'PROCESSED' THEN
      RAISE EXCEPTION 'Lot % has already been fully processed', v_allocation.supply_batch_id;
    END IF;

    v_remaining_qty := COALESCE(v_batch.current_qty, 0) - v_allocation.allocated_qty;

    INSERT INTO public.process_lot_run_batches (
      process_lot_run_id,
      supply_batch_id,
      is_primary,
      allocated_qty
    )
    VALUES (
      v_run.id,
      v_allocation.supply_batch_id,
      v_allocation.supply_batch_id = v_primary_supply_batch_id,
      v_allocation.allocated_qty
    );

    UPDATE public.supply_batches
    SET
      current_qty = v_remaining_qty,
      process_status = CASE
        WHEN v_remaining_qty <= 0 THEN 'PROCESSING'
        ELSE 'UNPROCESSED'
      END
    WHERE id = v_allocation.supply_batch_id;
  END LOOP;

  RETURN v_run;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_process_run_with_allocations(bigint, jsonb) TO authenticated;
