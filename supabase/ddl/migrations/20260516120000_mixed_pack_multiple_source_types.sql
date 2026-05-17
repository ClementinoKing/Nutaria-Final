BEGIN;

ALTER TABLE public.mixed_pack_batch_items
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'REMAINDER',
  ADD COLUMN IF NOT EXISTS source_supply_batch_id bigint NULL REFERENCES public.supply_batches(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS mixed_pack_batch_items_source_type_idx
  ON public.mixed_pack_batch_items(source_type);

CREATE INDEX IF NOT EXISTS mixed_pack_batch_items_source_supply_batch_id_idx
  ON public.mixed_pack_batch_items(source_supply_batch_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mixed_pack_batch_items_source_type_check'
  ) THEN
    ALTER TABLE public.mixed_pack_batch_items
      ADD CONSTRAINT mixed_pack_batch_items_source_type_check
      CHECK (source_type = ANY (ARRAY['REMAINDER'::text, 'RAW_LOT'::text, 'PACKAGED_ALLOCATION'::text]))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mixed_pack_batch_items_source_reference_check'
  ) THEN
    ALTER TABLE public.mixed_pack_batch_items
      ADD CONSTRAINT mixed_pack_batch_items_source_reference_check
      CHECK (
        (source_type = 'REMAINDER' AND source_pack_entry_id IS NOT NULL AND source_supply_batch_id IS NULL AND source_allocation_id IS NULL)
        OR
        (source_type = 'RAW_LOT' AND source_pack_entry_id IS NULL AND source_supply_batch_id IS NOT NULL AND source_allocation_id IS NULL)
        OR
        (source_type = 'PACKAGED_ALLOCATION' AND source_supply_batch_id IS NULL AND source_allocation_id IS NOT NULL)
      )
      NOT VALID;
  END IF;
END $$;

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
  v_source_type text;
  v_raw_current_qty numeric;
  v_raw_product_type text;
  v_units_count integer;
  v_total_quantity numeric;
  v_quantity_per_unit numeric;
  v_shipped_units integer;
  v_other_consumed numeric;
  v_pack_entry_id bigint;
BEGIN
  v_source_type := upper(trim(COALESCE(NEW.source_type, 'REMAINDER')));
  NEW.source_type := v_source_type;

  IF v_source_type NOT IN ('REMAINDER', 'RAW_LOT', 'PACKAGED_ALLOCATION') THEN
    RAISE EXCEPTION 'Unsupported mixed-pack source type %', NEW.source_type;
  END IF;

  IF NEW.quantity_used IS NULL OR NEW.quantity_used <= 0 THEN
    RAISE EXCEPTION 'quantity_used must be greater than zero';
  END IF;

  SELECT warehouse_id
  INTO v_batch_warehouse_id
  FROM public.mixed_pack_batches
  WHERE id = NEW.mixed_pack_batch_id;

  IF v_batch_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Mixed pack batch % not found', NEW.mixed_pack_batch_id;
  END IF;

  IF v_source_type = 'REMAINDER' THEN
    IF NEW.source_pack_entry_id IS NULL OR NEW.source_supply_batch_id IS NOT NULL OR NEW.source_allocation_id IS NOT NULL THEN
      RAISE EXCEPTION 'Remainder lines must reference only source_pack_entry_id';
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
  ELSIF v_source_type = 'RAW_LOT' THEN
    IF NEW.source_supply_batch_id IS NULL OR NEW.source_pack_entry_id IS NOT NULL OR NEW.source_allocation_id IS NOT NULL THEN
      RAISE EXCEPTION 'Raw lot lines must reference only source_supply_batch_id';
    END IF;

    SELECT
      COALESCE(sb.current_qty, 0),
      prod.id,
      prod.product_type,
      sup.warehouse_id
    INTO
      v_raw_current_qty,
      v_product_id,
      v_raw_product_type,
      v_source_warehouse_id
    FROM public.supply_batches sb
    JOIN public.products prod
      ON prod.id = sb.product_id
    JOIN public.supplies sup
      ON sup.id = sb.supply_id
    WHERE sb.id = NEW.source_supply_batch_id
    FOR UPDATE OF sb;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Raw lot % not found', NEW.source_supply_batch_id;
    END IF;

    IF upper(COALESCE(v_raw_product_type, '')) <> 'RAW' THEN
      RAISE EXCEPTION 'Lot % is not a raw product lot', NEW.source_supply_batch_id;
    END IF;

    IF NEW.quantity_used > COALESCE(v_raw_current_qty, 0) + 0.000001 THEN
      RAISE EXCEPTION 'Requested quantity (%) exceeds raw lot available quantity (%) for lot %',
        NEW.quantity_used,
        COALESCE(v_raw_current_qty, 0),
        NEW.source_supply_batch_id;
    END IF;

    NEW.source_product_id := v_product_id;
    NEW.source_lot_run_id := NULL;
  ELSE
    IF NEW.source_allocation_id IS NULL OR NEW.source_supply_batch_id IS NOT NULL THEN
      RAISE EXCEPTION 'Packaged allocation lines must reference source_allocation_id and no source_supply_batch_id';
    END IF;

    SELECT
      psa.units_count,
      psa.total_quantity_kg,
      psa.pack_entry_id,
      COALESCE(pe.product_id, so.product_id)::integer,
      plr.id,
      sup.warehouse_id
    INTO
      v_units_count,
      v_total_quantity,
      v_pack_entry_id,
      v_product_id,
      v_lot_run_id,
      v_source_warehouse_id
    FROM public.process_packaging_storage_allocations psa
    JOIN public.process_packaging_pack_entries pe
      ON pe.id = psa.pack_entry_id
    LEFT JOIN public.process_sorting_outputs so
      ON so.id = pe.sorting_output_id
    JOIN public.process_packaging_runs pr
      ON pr.id = psa.packaging_run_id
    JOIN public.process_step_runs psr
      ON psr.id = pr.process_step_run_id
    JOIN public.process_lot_runs plr
      ON plr.id = psr.process_lot_run_id
    JOIN public.supply_batches sb
      ON sb.id = plr.supply_batch_id
    JOIN public.supplies sup
      ON sup.id = sb.supply_id
    WHERE psa.id = NEW.source_allocation_id
    FOR UPDATE OF psa;

    IF v_units_count IS NULL THEN
      RAISE EXCEPTION 'Packaging allocation % not found', NEW.source_allocation_id;
    END IF;

    v_quantity_per_unit :=
      CASE
        WHEN v_units_count > 0 THEN COALESCE(v_total_quantity, 0) / v_units_count::numeric
        ELSE 0
      END;

    SELECT COALESCE(SUM(spi.units_count), 0)::integer
    INTO v_shipped_units
    FROM public.shipment_pack_items spi
    JOIN public.shipments s
      ON s.id = spi.shipment_id
    WHERE spi.packaging_allocation_id = NEW.source_allocation_id
      AND s.doc_status <> 'CANCELLED';

    SELECT COALESCE(SUM(mbi.quantity_used), 0)
    INTO v_other_consumed
    FROM public.mixed_pack_batch_items mbi
    WHERE mbi.source_type = 'PACKAGED_ALLOCATION'
      AND mbi.source_allocation_id = NEW.source_allocation_id
      AND (TG_OP <> 'UPDATE' OR mbi.id <> OLD.id);

    v_available_kg := GREATEST(
      COALESCE(v_total_quantity, 0) - (COALESCE(v_shipped_units, 0) * v_quantity_per_unit) - COALESCE(v_other_consumed, 0),
      0
    );

    IF NEW.quantity_used > v_available_kg + 0.000001 THEN
      RAISE EXCEPTION 'Requested quantity (%) exceeds allocation remaining quantity (%) for allocation %',
        NEW.quantity_used,
        v_available_kg,
        NEW.source_allocation_id;
    END IF;

    NEW.source_pack_entry_id := v_pack_entry_id;
    NEW.source_product_id := v_product_id;
    NEW.source_lot_run_id := v_lot_run_id;
  END IF;

  IF v_source_warehouse_id IS DISTINCT FROM v_batch_warehouse_id THEN
    RAISE EXCEPTION 'Selected source does not belong to warehouse %', v_batch_warehouse_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mixed_pack_batch_items_guard_trg ON public.mixed_pack_batch_items;
CREATE TRIGGER mixed_pack_batch_items_guard_trg
  BEFORE INSERT OR UPDATE ON public.mixed_pack_batch_items
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_and_guard_mixed_pack_batch_item();

CREATE OR REPLACE VIEW public.mixed_pack_source_allocations AS
WITH shipped AS (
  SELECT
    spi.packaging_allocation_id,
    COALESCE(SUM(spi.units_count), 0)::integer AS shipped_units
  FROM public.shipment_pack_items spi
  JOIN public.shipments s
    ON s.id = spi.shipment_id
  WHERE s.doc_status <> 'CANCELLED'
  GROUP BY spi.packaging_allocation_id
),
mixed AS (
  SELECT
    mbi.source_allocation_id,
    COALESCE(SUM(mbi.quantity_used), 0) AS mixed_pack_consumed_qty
  FROM public.mixed_pack_batch_items mbi
  WHERE mbi.source_type = 'PACKAGED_ALLOCATION'
  GROUP BY mbi.source_allocation_id
)
SELECT
  psa.id AS allocation_id,
  psa.packaging_run_id,
  psa.pack_entry_id,
  psa.storage_type,
  psa.units_count,
  psa.packs_per_unit,
  psa.total_packs,
  psa.total_quantity_kg,
  psa.created_at AS allocated_at,
  pe.pack_identifier,
  COALESCE(pe.product_id, so.product_id)::integer AS product_id,
  CASE
    WHEN pe.source_mode = 'MIXED_PACK' THEN mpb.pack_name
    ELSE prod.name
  END AS product_name,
  CASE
    WHEN pe.source_mode = 'MIXED_PACK' THEN NULL::text
    ELSE prod.sku
  END AS product_sku,
  prod.product_type,
  prod.base_unit_id AS unit_id,
  unit_ref.name AS unit_name,
  unit_ref.symbol AS unit_symbol,
  plr.id AS lot_run_id,
  plr.status AS lot_run_status,
  sb.id AS source_batch_id,
  sb.lot_no,
  sup.warehouse_id,
  wh.name AS warehouse_name,
  COALESCE(sh.shipped_units, 0)::integer AS shipped_units,
  COALESCE(mx.mixed_pack_consumed_qty, 0) AS mixed_pack_consumed_qty,
  CASE
    WHEN psa.units_count > 0 THEN COALESCE(psa.total_quantity_kg, 0) / psa.units_count::numeric
    ELSE 0
  END AS quantity_per_unit_kg,
  GREATEST(
    COALESCE(psa.total_quantity_kg, 0)
      - (COALESCE(sh.shipped_units, 0) * CASE WHEN psa.units_count > 0 THEN COALESCE(psa.total_quantity_kg, 0) / psa.units_count::numeric ELSE 0 END)
      - COALESCE(mx.mixed_pack_consumed_qty, 0),
    0
  ) AS remaining_quantity_kg,
  CASE
    WHEN psa.units_count > 0 AND COALESCE(psa.total_quantity_kg, 0) > 0
      THEN CEIL(COALESCE(mx.mixed_pack_consumed_qty, 0) / NULLIF(COALESCE(psa.total_quantity_kg, 0) / psa.units_count::numeric, 0))::integer
    ELSE 0
  END AS mixed_pack_reserved_units,
  GREATEST(
    psa.units_count
      - COALESCE(sh.shipped_units, 0)
      - CASE
          WHEN psa.units_count > 0 AND COALESCE(psa.total_quantity_kg, 0) > 0
            THEN CEIL(COALESCE(mx.mixed_pack_consumed_qty, 0) / NULLIF(COALESCE(psa.total_quantity_kg, 0) / psa.units_count::numeric, 0))::integer
          ELSE 0
        END,
    0
  ) AS remaining_units
FROM public.process_packaging_storage_allocations psa
JOIN public.process_packaging_pack_entries pe
  ON pe.id = psa.pack_entry_id
LEFT JOIN public.mixed_pack_batches mpb
  ON mpb.id = pe.mixed_pack_batch_id
LEFT JOIN public.process_sorting_outputs so
  ON so.id = pe.sorting_output_id
JOIN public.products prod
  ON prod.id = COALESCE(pe.product_id, so.product_id)::integer
LEFT JOIN public.units unit_ref
  ON unit_ref.id = prod.base_unit_id
JOIN public.process_packaging_runs pr
  ON pr.id = psa.packaging_run_id
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
LEFT JOIN shipped sh
  ON sh.packaging_allocation_id = psa.id
LEFT JOIN mixed mx
  ON mx.source_allocation_id = psa.id
WHERE GREATEST(
    COALESCE(psa.total_quantity_kg, 0)
      - (COALESCE(sh.shipped_units, 0) * CASE WHEN psa.units_count > 0 THEN COALESCE(psa.total_quantity_kg, 0) / psa.units_count::numeric ELSE 0 END)
      - COALESCE(mx.mixed_pack_consumed_qty, 0),
    0
  ) > 0;

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
    source_type text NOT NULL,
    source_pack_entry_id bigint NULL,
    source_supply_batch_id bigint NULL,
    source_allocation_id bigint NULL,
    quantity_used numeric NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_mixed_pack_lines (
    source_type,
    source_pack_entry_id,
    source_supply_batch_id,
    source_allocation_id,
    quantity_used
  )
  SELECT
    normalized.source_type,
    normalized.source_pack_entry_id,
    normalized.source_supply_batch_id,
    normalized.source_allocation_id,
    SUM(normalized.quantity_used)
  FROM (
    SELECT
      upper(trim(COALESCE(row->>'source_type', 'REMAINDER'))) AS source_type,
      NULLIF(row->>'source_pack_entry_id', '')::bigint AS source_pack_entry_id,
      NULLIF(row->>'source_supply_batch_id', '')::bigint AS source_supply_batch_id,
      NULLIF(row->>'source_allocation_id', '')::bigint AS source_allocation_id,
      (row->>'quantity_used')::numeric AS quantity_used
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS row
  ) normalized
  GROUP BY
    normalized.source_type,
    normalized.source_pack_entry_id,
    normalized.source_supply_batch_id,
    normalized.source_allocation_id;

  SELECT COUNT(*), COALESCE(SUM(quantity_used), 0)
  INTO v_line_count, v_total_qty
  FROM tmp_mixed_pack_lines;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'At least one source line is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_mixed_pack_lines
    WHERE quantity_used IS NULL
      OR quantity_used <= 0
      OR source_type NOT IN ('REMAINDER', 'RAW_LOT', 'PACKAGED_ALLOCATION')
      OR (source_type = 'REMAINDER' AND (source_pack_entry_id IS NULL OR source_supply_batch_id IS NOT NULL OR source_allocation_id IS NOT NULL))
      OR (source_type = 'RAW_LOT' AND (source_supply_batch_id IS NULL OR source_pack_entry_id IS NOT NULL OR source_allocation_id IS NOT NULL))
      OR (source_type = 'PACKAGED_ALLOCATION' AND (source_allocation_id IS NULL OR source_pack_entry_id IS NOT NULL OR source_supply_batch_id IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'Every source line must include one valid source reference and a quantity greater than zero';
  END IF;

  IF p_require_exact_total AND p_defined_pack_size IS NOT NULL AND abs(v_total_qty - p_defined_pack_size) > 0.000001 THEN
    RAISE EXCEPTION 'Selected total (%) does not match defined pack size (%)', v_total_qty, p_defined_pack_size;
  END IF;

  CREATE TEMP TABLE tmp_selected_sources (
    source_type text NOT NULL,
    source_pack_entry_id bigint NULL,
    source_supply_batch_id bigint NULL,
    source_allocation_id bigint NULL,
    product_id integer NOT NULL,
    base_unit_id integer NULL,
    lot_run_id bigint NULL,
    warehouse_id integer NOT NULL,
    available_qty numeric NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_selected_sources (
    source_type,
    source_pack_entry_id,
    source_supply_batch_id,
    source_allocation_id,
    product_id,
    base_unit_id,
    lot_run_id,
    warehouse_id,
    available_qty
  )
  SELECT
    'REMAINDER',
    pe.id,
    NULL::bigint,
    NULL::bigint,
    COALESCE(pe.product_id, so.product_id)::integer,
    prod.base_unit_id,
    plr.id,
    sup.warehouse_id,
    GREATEST(COALESCE(pe.remainder_kg, 0) - COALESCE(usage.used_kg, 0), 0)
  FROM public.process_packaging_pack_entries pe
  JOIN tmp_mixed_pack_lines lines
    ON lines.source_type = 'REMAINDER'
   AND lines.source_pack_entry_id = pe.id
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
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(u.quantity_kg), 0) AS used_kg
    FROM public.process_packaging_remainder_usages u
    WHERE u.source_pack_entry_id = pe.id
  ) usage ON true
  WHERE plr.status = 'COMPLETED'
    AND prod.product_type = 'FINISHED'
    AND COALESCE(pe.source_mode, 'SORTING_OUTPUT') = 'SORTING_OUTPUT'
  FOR UPDATE OF pe;

  INSERT INTO tmp_selected_sources (
    source_type,
    source_pack_entry_id,
    source_supply_batch_id,
    source_allocation_id,
    product_id,
    base_unit_id,
    lot_run_id,
    warehouse_id,
    available_qty
  )
  SELECT
    'RAW_LOT',
    NULL::bigint,
    sb.id,
    NULL::bigint,
    prod.id,
    COALESCE(sb.unit_id, prod.base_unit_id),
    NULL::bigint,
    sup.warehouse_id,
    COALESCE(sb.current_qty, 0)
  FROM public.supply_batches sb
  JOIN tmp_mixed_pack_lines lines
    ON lines.source_type = 'RAW_LOT'
   AND lines.source_supply_batch_id = sb.id
  JOIN public.products prod
    ON prod.id = sb.product_id
  JOIN public.supplies sup
    ON sup.id = sb.supply_id
  WHERE prod.product_type = 'RAW'
    AND COALESCE(sb.current_qty, 0) > 0
  FOR UPDATE OF sb;

  INSERT INTO tmp_selected_sources (
    source_type,
    source_pack_entry_id,
    source_supply_batch_id,
    source_allocation_id,
    product_id,
    base_unit_id,
    lot_run_id,
    warehouse_id,
    available_qty
  )
  SELECT
    'PACKAGED_ALLOCATION',
    NULL::bigint,
    NULL::bigint,
    psa.id,
    COALESCE(pe.product_id, so.product_id)::integer,
    prod.base_unit_id,
    plr.id,
    sup.warehouse_id,
    GREATEST(
      COALESCE(psa.total_quantity_kg, 0)
        - (COALESCE(shipped.shipped_units, 0) * CASE WHEN psa.units_count > 0 THEN COALESCE(psa.total_quantity_kg, 0) / psa.units_count::numeric ELSE 0 END)
        - COALESCE(mixed.mixed_pack_consumed_qty, 0),
      0
    )
  FROM public.process_packaging_storage_allocations psa
  JOIN tmp_mixed_pack_lines lines
    ON lines.source_type = 'PACKAGED_ALLOCATION'
   AND lines.source_allocation_id = psa.id
  JOIN public.process_packaging_pack_entries pe
    ON pe.id = psa.pack_entry_id
  LEFT JOIN public.process_sorting_outputs so
    ON so.id = pe.sorting_output_id
  JOIN public.products prod
    ON prod.id = COALESCE(pe.product_id, so.product_id)::integer
  JOIN public.process_packaging_runs pr
    ON pr.id = psa.packaging_run_id
  JOIN public.process_step_runs psr
    ON psr.id = pr.process_step_run_id
  JOIN public.process_lot_runs plr
    ON plr.id = psr.process_lot_run_id
  JOIN public.supply_batches sb
    ON sb.id = plr.supply_batch_id
  JOIN public.supplies sup
    ON sup.id = sb.supply_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(spi.units_count), 0)::integer AS shipped_units
    FROM public.shipment_pack_items spi
    JOIN public.shipments s
      ON s.id = spi.shipment_id
    WHERE spi.packaging_allocation_id = psa.id
      AND s.doc_status <> 'CANCELLED'
  ) shipped ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(mbi.quantity_used), 0) AS mixed_pack_consumed_qty
    FROM public.mixed_pack_batch_items mbi
    WHERE mbi.source_type = 'PACKAGED_ALLOCATION'
      AND mbi.source_allocation_id = psa.id
  ) mixed ON true
  FOR UPDATE OF psa;

  IF (SELECT COUNT(*) FROM tmp_selected_sources) <> v_line_count THEN
    RAISE EXCEPTION 'One or more selected sources are not eligible for mixed packs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_mixed_pack_lines lines
    JOIN tmp_selected_sources src
      ON src.source_type = lines.source_type
     AND COALESCE(src.source_pack_entry_id, -1) = COALESCE(lines.source_pack_entry_id, -1)
     AND COALESCE(src.source_supply_batch_id, -1) = COALESCE(lines.source_supply_batch_id, -1)
     AND COALESCE(src.source_allocation_id, -1) = COALESCE(lines.source_allocation_id, -1)
    WHERE lines.quantity_used > src.available_qty + 0.000001
  ) THEN
    RAISE EXCEPTION 'One or more selected quantities exceed the currently available source balance';
  END IF;

  SELECT MIN(warehouse_id), COUNT(DISTINCT warehouse_id)
  INTO v_source_warehouse_id, v_mismatch_count
  FROM tmp_selected_sources;

  IF v_mismatch_count <> 1 THEN
    RAISE EXCEPTION 'All selected sources must belong to the same warehouse';
  END IF;

  IF p_warehouse_id IS NOT NULL AND p_warehouse_id <> v_source_warehouse_id THEN
    RAISE EXCEPTION 'Selected sources do not belong to warehouse %', p_warehouse_id;
  END IF;

  IF p_unit_id IS NULL THEN
    SELECT base_unit_id
    INTO v_default_unit_id
    FROM tmp_selected_sources
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
    source_type,
    source_pack_entry_id,
    source_supply_batch_id,
    source_allocation_id,
    quantity_used
  )
  SELECT
    v_batch_id,
    source_type,
    source_pack_entry_id,
    source_supply_batch_id,
    source_allocation_id,
    quantity_used
  FROM tmp_mixed_pack_lines
  ORDER BY source_type, source_pack_entry_id, source_supply_batch_id, source_allocation_id;

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
  WHERE source_type = 'REMAINDER'
  ORDER BY source_pack_entry_id;

  UPDATE public.supply_batches sb
  SET current_qty = GREATEST(COALESCE(sb.current_qty, 0) - raw_usage.quantity_used, 0)
  FROM (
    SELECT source_supply_batch_id, SUM(quantity_used) AS quantity_used
    FROM tmp_mixed_pack_lines
    WHERE source_type = 'RAW_LOT'
    GROUP BY source_supply_batch_id
  ) raw_usage
  WHERE sb.id = raw_usage.source_supply_batch_id;

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

GRANT SELECT ON public.mixed_pack_source_allocations TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_mixed_pack(text, numeric, integer, integer, boolean, jsonb, text, text, numeric, text, text, text, integer, integer, text, integer) TO authenticated, service_role;

COMMIT;
