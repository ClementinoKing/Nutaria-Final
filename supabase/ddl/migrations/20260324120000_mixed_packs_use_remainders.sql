BEGIN;

ALTER TABLE public.mixed_pack_batch_items
  ALTER COLUMN source_allocation_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS mixed_pack_batch_items_source_pack_entry_id_idx
  ON public.mixed_pack_batch_items(source_pack_entry_id);

CREATE OR REPLACE FUNCTION public.populate_and_guard_mixed_pack_batch_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remainder_kg numeric;
  v_used_kg numeric;
  v_available_kg numeric;
  v_product_id integer;
  v_lot_run_id bigint;
  v_source_warehouse_id integer;
  v_batch_warehouse_id integer;
BEGIN
  IF NEW.source_pack_entry_id IS NULL THEN
    RAISE EXCEPTION 'source_pack_entry_id is required';
  END IF;

  IF NEW.quantity_used IS NULL OR NEW.quantity_used <= 0 THEN
    RAISE EXCEPTION 'quantity_used must be greater than zero';
  END IF;

  SELECT
    COALESCE(pe.remainder_kg, 0),
    COALESCE(pe.product_id, so.product_id)::integer,
    plr.id,
    sup.warehouse_id
  INTO
    v_remainder_kg,
    v_product_id,
    v_lot_run_id,
    v_source_warehouse_id
  FROM public.process_packaging_pack_entries pe
  LEFT JOIN public.process_sorting_outputs so
    ON so.id = pe.sorting_output_id
  JOIN public.process_packaging_runs pr
    ON pr.id = pe.packaging_run_id
  JOIN public.process_step_runs psr
    ON psr.id = pr.process_step_run_id
  JOIN public.process_lot_runs plr
    ON plr.id = psr.process_lot_run_id
  JOIN public.supply_batches sb
    ON sb.id = plr.supply_batch_id
  JOIN public.supplies sup
    ON sup.id = sb.supply_id
  WHERE pe.id = NEW.source_pack_entry_id
  FOR UPDATE OF pe;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Source pack entry % not found', NEW.source_pack_entry_id;
  END IF;

  SELECT warehouse_id
  INTO v_batch_warehouse_id
  FROM public.mixed_pack_batches
  WHERE id = NEW.mixed_pack_batch_id;

  IF v_batch_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Mixed pack batch % not found', NEW.mixed_pack_batch_id;
  END IF;

  IF v_source_warehouse_id IS DISTINCT FROM v_batch_warehouse_id THEN
    RAISE EXCEPTION 'Source remainder % does not belong to warehouse %', NEW.source_pack_entry_id, v_batch_warehouse_id;
  END IF;

  SELECT COALESCE(SUM(u.quantity_kg), 0)
  INTO v_used_kg
  FROM public.process_packaging_remainder_usages u
  WHERE u.source_pack_entry_id = NEW.source_pack_entry_id;

  v_available_kg := GREATEST(v_remainder_kg - COALESCE(v_used_kg, 0), 0);

  IF NEW.quantity_used > v_available_kg + 0.000001 THEN
    RAISE EXCEPTION 'Requested quantity (%) exceeds available remainder (%) for pack entry %',
      NEW.quantity_used,
      v_available_kg,
      NEW.source_pack_entry_id;
  END IF;

  NEW.source_product_id := v_product_id;
  NEW.source_lot_run_id := v_lot_run_id;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.mixed_pack_source_remainders AS
WITH used AS (
  SELECT
    u.source_pack_entry_id,
    COALESCE(SUM(u.quantity_kg), 0) AS used_remainder_kg
  FROM public.process_packaging_remainder_usages u
  GROUP BY u.source_pack_entry_id
)
SELECT
  pe.id AS pack_entry_id,
  COALESCE(pe.product_id, so.product_id)::integer AS product_id,
  prod.name AS product_name,
  prod.sku AS product_sku,
  pe.pack_identifier,
  sb.lot_no,
  plr.id AS lot_run_id,
  COALESCE(pe.remainder_kg, 0) AS remainder_kg,
  COALESCE(used.used_remainder_kg, 0) AS used_remainder_kg,
  GREATEST(COALESCE(pe.remainder_kg, 0) - COALESCE(used.used_remainder_kg, 0), 0) AS available_remainder_kg,
  COALESCE(pe.quantity_kg, 0) AS quantity_kg,
  pe.pack_count,
  pe.created_at AS packed_at,
  sup.warehouse_id,
  wh.name AS warehouse_name,
  prod.base_unit_id AS unit_id,
  unit_ref.name AS unit_name,
  unit_ref.symbol AS unit_symbol
FROM public.process_packaging_pack_entries pe
LEFT JOIN public.process_sorting_outputs so
  ON so.id = pe.sorting_output_id
JOIN public.products prod
  ON prod.id = COALESCE(pe.product_id, so.product_id)::integer
JOIN public.process_packaging_runs pr
  ON pr.id = pe.packaging_run_id
JOIN public.process_step_runs psr
  ON psr.id = pr.process_step_run_id
JOIN public.process_lot_runs plr
  ON plr.id = psr.process_lot_run_id
JOIN public.supply_batches sb
  ON sb.id = plr.supply_batch_id
JOIN public.supplies sup
  ON sup.id = sb.supply_id
LEFT JOIN public.warehouses wh
  ON wh.id = sup.warehouse_id
LEFT JOIN public.units unit_ref
  ON unit_ref.id = prod.base_unit_id
LEFT JOIN used
  ON used.source_pack_entry_id = pe.id
WHERE plr.status = 'COMPLETED'
  AND prod.product_type = 'FINISHED'
  AND COALESCE(pe.source_mode, 'SORTING_OUTPUT') = 'SORTING_OUTPUT'
  AND COALESCE(pe.remainder_kg, 0) > 0
  AND GREATEST(COALESCE(pe.remainder_kg, 0) - COALESCE(used.used_remainder_kg, 0), 0) > 0;

CREATE OR REPLACE FUNCTION public.create_mixed_pack(
  p_pack_name text,
  p_defined_pack_size numeric DEFAULT NULL,
  p_warehouse_id integer DEFAULT NULL,
  p_unit_id integer DEFAULT NULL,
  p_require_exact_total boolean DEFAULT true,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_packet_unit_code text DEFAULT NULL,
  p_pack_identifier text DEFAULT NULL,
  p_pack_size_kg numeric DEFAULT NULL,
  p_packing_type text DEFAULT NULL,
  p_storage_type text DEFAULT NULL,
  p_box_unit_code text DEFAULT NULL,
  p_units_count integer DEFAULT NULL,
  p_packs_per_unit integer DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE(mixed_pack_batch_id bigint, batch_no text, pack_entry_id bigint, storage_allocation_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id bigint;
  v_batch_no text;
  v_total_qty numeric;
  v_line_count integer;
  v_default_unit_id integer;
  v_source_warehouse_id integer;
  v_mismatch_count integer;
  v_bridge record;
  v_pack_entry_id bigint;
  v_storage_allocation_id bigint;
  v_total_packs integer;
BEGIN
  IF COALESCE(trim(p_pack_name), '') = '' THEN
    RAISE EXCEPTION 'Pack name is required';
  END IF;

  IF p_defined_pack_size IS NOT NULL AND p_defined_pack_size <= 0 THEN
    RAISE EXCEPTION 'Defined pack size must be greater than zero';
  END IF;

  IF p_pack_size_kg IS NULL OR p_pack_size_kg <= 0 THEN
    RAISE EXCEPTION 'Pack size is required and must be greater than zero';
  END IF;

  IF COALESCE(trim(p_packet_unit_code), '') = '' THEN
    RAISE EXCEPTION 'Packet unit code is required';
  END IF;

  IF COALESCE(trim(p_storage_type), '') = '' THEN
    RAISE EXCEPTION 'Storage type is required';
  END IF;

  IF p_units_count IS NULL OR p_units_count <= 0 THEN
    RAISE EXCEPTION 'Units count must be greater than zero';
  END IF;

  IF p_packs_per_unit IS NULL OR p_packs_per_unit <= 0 THEN
    RAISE EXCEPTION 'Packs per unit must be greater than zero';
  END IF;

  IF upper(p_storage_type) = 'BOX' AND COALESCE(trim(p_box_unit_code), '') = '' THEN
    RAISE EXCEPTION 'Box unit code is required for box allocations';
  END IF;

  IF jsonb_typeof(COALESCE(p_lines, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Lines payload must be an array';
  END IF;

  CREATE TEMP TABLE tmp_mixed_pack_lines (
    source_pack_entry_id bigint PRIMARY KEY,
    quantity_used numeric NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_mixed_pack_lines (source_pack_entry_id, quantity_used)
  SELECT
    (row->>'source_pack_entry_id')::bigint,
    SUM((row->>'quantity_used')::numeric)
  FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS row
  GROUP BY (row->>'source_pack_entry_id')::bigint;

  SELECT COUNT(*), COALESCE(SUM(quantity_used), 0)
  INTO v_line_count, v_total_qty
  FROM tmp_mixed_pack_lines;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'At least one source line is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_mixed_pack_lines
    WHERE source_pack_entry_id IS NULL
      OR quantity_used IS NULL
      OR quantity_used <= 0
  ) THEN
    RAISE EXCEPTION 'Every source line must include a valid remainder source and a quantity greater than zero';
  END IF;

  IF p_require_exact_total AND p_defined_pack_size IS NOT NULL AND abs(v_total_qty - p_defined_pack_size) > 0.000001 THEN
    RAISE EXCEPTION 'Selected total (%) does not match defined pack size (%)', v_total_qty, p_defined_pack_size;
  END IF;

  CREATE TEMP TABLE tmp_selected_remainders ON COMMIT DROP AS
  SELECT
    pe.id AS source_pack_entry_id,
    COALESCE(pe.product_id, so.product_id)::integer AS product_id,
    prod.base_unit_id,
    COALESCE(pe.remainder_kg, 0) AS remainder_kg,
    plr.id AS lot_run_id,
    sup.warehouse_id
  FROM public.process_packaging_pack_entries pe
  JOIN tmp_mixed_pack_lines lines
    ON lines.source_pack_entry_id = pe.id
  LEFT JOIN public.process_sorting_outputs so
    ON so.id = pe.sorting_output_id
  JOIN public.products prod
    ON prod.id = COALESCE(pe.product_id, so.product_id)::integer
  JOIN public.process_packaging_runs pr
    ON pr.id = pe.packaging_run_id
  JOIN public.process_step_runs psr
    ON psr.id = pr.process_step_run_id
  JOIN public.process_lot_runs plr
    ON plr.id = psr.process_lot_run_id
  JOIN public.supply_batches sb
    ON sb.id = plr.supply_batch_id
  JOIN public.supplies sup
    ON sup.id = sb.supply_id
  WHERE plr.status = 'COMPLETED'
    AND prod.product_type = 'FINISHED'
    AND COALESCE(pe.source_mode, 'SORTING_OUTPUT') = 'SORTING_OUTPUT'
  FOR UPDATE OF pe;

  IF (SELECT COUNT(*) FROM tmp_selected_remainders) <> v_line_count THEN
    RAISE EXCEPTION 'One or more selected remainder sources are not eligible for mixed packs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_selected_remainders src
    JOIN tmp_mixed_pack_lines lines
      ON lines.source_pack_entry_id = src.source_pack_entry_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(u.quantity_kg), 0) AS used_kg
      FROM public.process_packaging_remainder_usages u
      WHERE u.source_pack_entry_id = src.source_pack_entry_id
    ) usage ON true
    WHERE lines.quantity_used > GREATEST(src.remainder_kg - COALESCE(usage.used_kg, 0), 0) + 0.000001
  ) THEN
    RAISE EXCEPTION 'One or more selected remainder quantities exceed the currently available remainder balance';
  END IF;

  SELECT MIN(warehouse_id), COUNT(DISTINCT warehouse_id)
  INTO v_source_warehouse_id, v_mismatch_count
  FROM tmp_selected_remainders;

  IF v_mismatch_count <> 1 THEN
    RAISE EXCEPTION 'All source remainders must belong to the same warehouse';
  END IF;

  IF p_warehouse_id IS NOT NULL AND p_warehouse_id <> v_source_warehouse_id THEN
    RAISE EXCEPTION 'Selected source remainders do not belong to warehouse %', p_warehouse_id;
  END IF;

  IF p_unit_id IS NULL THEN
    SELECT base_unit_id
    INTO v_default_unit_id
    FROM tmp_selected_remainders
    GROUP BY base_unit_id
    ORDER BY COUNT(*) DESC, base_unit_id NULLS LAST
    LIMIT 1;
  ELSE
    v_default_unit_id := p_unit_id;
  END IF;

  INSERT INTO public.mixed_pack_batches (
    pack_name,
    defined_pack_size,
    actual_total_qty,
    warehouse_id,
    unit_id,
    require_exact_total,
    notes,
    created_by
  ) VALUES (
    trim(p_pack_name),
    p_defined_pack_size,
    v_total_qty,
    COALESCE(p_warehouse_id, v_source_warehouse_id),
    v_default_unit_id,
    COALESCE(p_require_exact_total, true),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    auth.uid()
  )
  RETURNING id, mixed_pack_batches.batch_no
  INTO v_batch_id, v_batch_no;

  SELECT *
  INTO v_bridge
  FROM public.ensure_mixed_pack_bridge(
    v_batch_id,
    COALESCE(p_warehouse_id, v_source_warehouse_id),
    v_default_unit_id,
    trim(p_pack_name),
    v_total_qty,
    p_notes
  );

  INSERT INTO public.process_packaging_pack_entries (
    packaging_run_id,
    sorting_output_id,
    mixed_pack_batch_id,
    source_mode,
    product_id,
    packet_unit_code,
    pack_identifier,
    quantity_kg,
    packing_type,
    pack_size_kg,
    damaged_pack_count,
    metal_check_status,
    metal_check_attempts
  ) VALUES (
    v_bridge.packaging_run_id,
    NULL,
    v_batch_id,
    'MIXED_PACK',
    v_bridge.mixed_product_id,
    trim(p_packet_unit_code),
    COALESCE(NULLIF(trim(COALESCE(p_pack_identifier, '')), ''), trim(p_packet_unit_code)),
    v_total_qty,
    NULLIF(trim(COALESCE(p_packing_type, '')), ''),
    p_pack_size_kg,
    0,
    NULL,
    0
  )
  RETURNING id, pack_count INTO v_pack_entry_id, v_total_packs;

  IF v_total_packs IS NULL OR v_total_packs <= 0 THEN
    RAISE EXCEPTION 'The selected quantity does not produce any full packs for pack size %', p_pack_size_kg;
  END IF;

  INSERT INTO public.mixed_pack_batch_items (
    mixed_pack_batch_id,
    source_pack_entry_id,
    quantity_used
  )
  SELECT
    v_batch_id,
    source_pack_entry_id,
    quantity_used
  FROM tmp_mixed_pack_lines
  ORDER BY source_pack_entry_id;

  INSERT INTO public.process_packaging_remainder_usages (
    source_pack_entry_id,
    consumer_pack_entry_id,
    quantity_kg,
    created_by
  )
  SELECT
    source_pack_entry_id,
    v_pack_entry_id,
    quantity_used,
    auth.uid()
  FROM tmp_mixed_pack_lines
  ORDER BY source_pack_entry_id;

  IF (p_units_count * p_packs_per_unit) > v_total_packs THEN
    RAISE EXCEPTION 'Requested allocation packs (%) exceed produced packs (%)', (p_units_count * p_packs_per_unit), v_total_packs;
  END IF;

  INSERT INTO public.process_packaging_storage_allocations (
    packaging_run_id,
    pack_entry_id,
    storage_type,
    box_unit_code,
    units_count,
    packs_per_unit,
    total_packs,
    total_quantity_kg,
    notes,
    created_by
  ) VALUES (
    v_bridge.packaging_run_id,
    v_pack_entry_id,
    upper(p_storage_type),
    CASE WHEN upper(p_storage_type) = 'BOX' THEN trim(p_box_unit_code) ELSE NULL END,
    p_units_count,
    p_packs_per_unit,
    p_units_count * p_packs_per_unit,
    (p_units_count * p_packs_per_unit) * p_pack_size_kg,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_storage_allocation_id;

  UPDATE public.mixed_pack_batches
  SET
    supply_id = v_bridge.supply_id,
    supply_batch_id = v_bridge.supply_batch_id,
    process_id = v_bridge.process_id,
    process_step_id = v_bridge.process_step_id,
    process_lot_run_id = v_bridge.process_lot_run_id,
    process_step_run_id = v_bridge.process_step_run_id,
    packaging_run_id = v_bridge.packaging_run_id,
    pack_entry_id = v_pack_entry_id,
    storage_allocation_id = v_storage_allocation_id,
    updated_at = now()
  WHERE id = v_batch_id;

  RETURN QUERY
  SELECT v_batch_id, v_batch_no, v_pack_entry_id, v_storage_allocation_id;
END;
$$;

GRANT SELECT ON public.mixed_pack_source_remainders TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_mixed_pack(text, numeric, integer, integer, boolean, jsonb, text, text, numeric, text, text, text, integer, integer, text) TO authenticated, service_role;

COMMIT;
