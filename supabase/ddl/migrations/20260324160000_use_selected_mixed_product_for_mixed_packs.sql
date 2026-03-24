BEGIN;

DROP FUNCTION IF EXISTS public.create_mixed_pack(
  text,
  numeric,
  integer,
  integer,
  boolean,
  jsonb,
  text,
  text,
  numeric,
  text,
  text,
  text,
  integer,
  integer,
  text
);

DROP FUNCTION IF EXISTS public.ensure_mixed_pack_bridge(
  bigint,
  integer,
  integer,
  text,
  numeric,
  text
);

CREATE OR REPLACE FUNCTION public.ensure_mixed_pack_bridge(
  p_batch_id bigint,
  p_warehouse_id integer,
  p_unit_id integer,
  p_pack_name text,
  p_total_qty numeric,
  p_notes text DEFAULT NULL,
  p_mixed_product_id integer DEFAULT NULL
)
RETURNS TABLE(
  mixed_product_id integer,
  process_id bigint,
  process_step_id bigint,
  supply_id bigint,
  supply_batch_id bigint,
  process_lot_run_id bigint,
  process_step_run_id bigint,
  packaging_run_id bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_no text;
  v_mixed_product_id integer;
  v_process_id bigint;
  v_process_step_id bigint;
  v_pack_step_name_id bigint;
  v_supply_id bigint;
  v_supply_batch_id bigint;
  v_process_lot_run_id bigint;
  v_process_step_run_id bigint;
  v_packaging_run_id bigint;
  v_selected_product_type text;
BEGIN
  SELECT batch_no
  INTO v_batch_no
  FROM public.mixed_pack_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_batch_no IS NULL THEN
    RAISE EXCEPTION 'Mixed pack batch % not found', p_batch_id;
  END IF;

  IF p_mixed_product_id IS NOT NULL THEN
    SELECT upper(coalesce(product_type, ''))
    INTO v_selected_product_type
    FROM public.products
    WHERE id = p_mixed_product_id;

    IF v_selected_product_type IS NULL THEN
      RAISE EXCEPTION 'Selected mixed product % was not found', p_mixed_product_id;
    END IF;

    IF v_selected_product_type <> 'FINISHED' THEN
      RAISE EXCEPTION 'Selected mixed product % must be a FINISHED product', p_mixed_product_id;
    END IF;

    v_mixed_product_id := p_mixed_product_id;

    IF p_unit_id IS NOT NULL THEN
      UPDATE public.products
      SET base_unit_id = COALESCE(base_unit_id, p_unit_id),
          updated_at = now()
      WHERE id = v_mixed_product_id;
    END IF;
  ELSE
    SELECT id
    INTO v_mixed_product_id
    FROM public.products
    WHERE sku = 'MIXED-PACK'
    LIMIT 1;

    IF v_mixed_product_id IS NULL THEN
      INSERT INTO public.products (
        sku,
        name,
        status,
        notes,
        product_type,
        base_unit_id
      ) VALUES (
        'MIXED-PACK',
        'Mixed Pack',
        'ACTIVE',
        'System product used for mixed-pack packaging bridge rows.',
        'FINISHED',
        p_unit_id
      )
      RETURNING id INTO v_mixed_product_id;
    ELSIF p_unit_id IS NOT NULL THEN
      UPDATE public.products
      SET base_unit_id = COALESCE(base_unit_id, p_unit_id),
          updated_at = now()
      WHERE id = v_mixed_product_id;
    END IF;
  END IF;

  SELECT id
  INTO v_pack_step_name_id
  FROM public.process_step_names
  WHERE upper(code) = 'PACK'
  ORDER BY id
  LIMIT 1;

  IF v_pack_step_name_id IS NULL THEN
    RAISE EXCEPTION 'Packaging step name (PACK) not found';
  END IF;

  SELECT id
  INTO v_process_id
  FROM public.processes
  WHERE code = 'MIXED_PACK'
  LIMIT 1;

  IF v_process_id IS NULL THEN
    INSERT INTO public.processes (
      code,
      name,
      description,
      product_ids
    ) VALUES (
      'MIXED_PACK',
      'Mixed Pack Packaging',
      'Synthetic process used to bridge mixed-pack outputs into standard packaging tables.',
      ARRAY[v_mixed_product_id]
    )
    RETURNING id INTO v_process_id;
  ELSE
    UPDATE public.processes
    SET product_ids = ARRAY(
      SELECT DISTINCT product_id
      FROM unnest(coalesce(product_ids, '{}'::integer[]) || ARRAY[v_mixed_product_id]) AS product_id
    )
    WHERE id = v_process_id;
  END IF;

  SELECT id
  INTO v_process_step_id
  FROM public.process_steps
  WHERE process_id = v_process_id
    AND step_name_id = v_pack_step_name_id
  ORDER BY seq
  LIMIT 1;

  IF v_process_step_id IS NULL THEN
    INSERT INTO public.process_steps (
      process_id,
      seq,
      description,
      requires_qc,
      step_name_id
    ) VALUES (
      v_process_id,
      1,
      'Synthetic packaging step for mixed-pack outputs.',
      false,
      v_pack_step_name_id
    )
    RETURNING id INTO v_process_step_id;
  END IF;

  INSERT INTO public.supplies (
    supplier_id,
    warehouse_id,
    supply_type_code,
    delivery_date,
    status,
    notes,
    created_by
  ) VALUES (
    NULL,
    p_warehouse_id,
    'OS',
    CURRENT_DATE,
    'RECEIVED',
    COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), format('Synthetic supply for mixed pack %s', v_batch_no)),
    auth.uid()
  )
  RETURNING id INTO v_supply_id;

  INSERT INTO public.supply_batches (
    supply_id,
    lot_no,
    quantity,
    unit_id,
    created_by
  ) VALUES (
    v_supply_id,
    v_batch_no,
    p_total_qty,
    p_unit_id,
    auth.uid()
  )
  RETURNING id INTO v_supply_batch_id;

  INSERT INTO public.process_lot_runs (
    process_id,
    supply_batch_id,
    status,
    created_by
  ) VALUES (
    v_process_id,
    v_supply_batch_id,
    'COMPLETED',
    auth.uid()
  )
  RETURNING id INTO v_process_lot_run_id;

  INSERT INTO public.process_step_runs (
    process_step_id,
    process_lot_run_id,
    status,
    started_at,
    completed_at,
    created_by
  ) VALUES (
    v_process_step_id,
    v_process_lot_run_id,
    'COMPLETED',
    now(),
    now(),
    auth.uid()
  )
  RETURNING id INTO v_process_step_run_id;

  INSERT INTO public.process_packaging_runs (
    process_step_run_id,
    notes,
    created_by
  ) VALUES (
    v_process_step_run_id,
    COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), format('Synthetic packaging run for mixed pack %s', p_pack_name)),
    auth.uid()
  )
  RETURNING id INTO v_packaging_run_id;

  mixed_product_id := v_mixed_product_id;
  process_id := v_process_id;
  process_step_id := v_process_step_id;
  supply_id := v_supply_id;
  supply_batch_id := v_supply_batch_id;
  process_lot_run_id := v_process_lot_run_id;
  process_step_run_id := v_process_step_run_id;
  packaging_run_id := v_packaging_run_id;
  RETURN NEXT;
END;
$$;

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
  p_notes text DEFAULT NULL,
  p_mixed_product_id integer DEFAULT NULL
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

  IF p_mixed_product_id IS NULL THEN
    RAISE EXCEPTION 'A mixed finished product must be selected';
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
    p_notes,
    p_mixed_product_id
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

  INSERT INTO public.process_packaging_storage_allocations (
    packaging_run_id,
    pack_entry_id,
    mixed_pack_batch_id,
    storage_type,
    box_unit_code,
    units_count,
    packs_per_unit
  ) VALUES (
    v_bridge.packaging_run_id,
    v_pack_entry_id,
    v_batch_id,
    upper(trim(p_storage_type)),
    CASE WHEN upper(trim(p_storage_type)) = 'BOX' THEN trim(p_box_unit_code) ELSE NULL END,
    p_units_count,
    p_packs_per_unit
  )
  RETURNING id INTO v_storage_allocation_id;

  UPDATE public.mixed_pack_batches
  SET pack_entry_id = v_pack_entry_id,
      storage_allocation_id = v_storage_allocation_id,
      updated_at = now()
  WHERE id = v_batch_id;

  mixed_pack_batch_id := v_batch_id;
  batch_no := v_batch_no;
  pack_entry_id := v_pack_entry_id;
  storage_allocation_id := v_storage_allocation_id;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_mixed_pack_bridge(bigint, integer, integer, text, numeric, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_mixed_pack(text, numeric, integer, integer, boolean, jsonb, text, text, numeric, text, text, text, integer, integer, text, integer) TO authenticated, service_role;

COMMIT;
