BEGIN;

CREATE OR REPLACE FUNCTION public.create_inventory_adjustment(
  p_product_id integer,
  p_warehouse_id integer,
  p_qty numeric,
  p_reason text,
  p_lot_id bigint DEFAULT NULL,
  p_unit_id integer DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_adjustment_id bigint;
  v_unit_id integer;
  v_lot_product_id integer;
  v_lot_warehouse_id integer;
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Product is required';
  END IF;

  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;

  IF p_qty IS NULL OR p_qty = 0 THEN
    RAISE EXCEPTION 'Quantity cannot be zero';
  END IF;

  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  IF p_lot_id IS NOT NULL THEN
    SELECT sb.product_id, s.warehouse_id
      INTO v_lot_product_id, v_lot_warehouse_id
    FROM public.supply_batches sb
    JOIN public.supplies s ON s.id = sb.supply_id
    WHERE sb.id = p_lot_id;

    IF v_lot_product_id IS NULL THEN
      RAISE EXCEPTION 'Invalid lot id %', p_lot_id;
    END IF;

    IF v_lot_product_id <> p_product_id THEN
      RAISE EXCEPTION 'Lot % does not belong to product %', p_lot_id, p_product_id;
    END IF;

    IF v_lot_warehouse_id IS DISTINCT FROM p_warehouse_id THEN
      RAISE EXCEPTION 'Lot % does not belong to warehouse %', p_lot_id, p_warehouse_id;
    END IF;
  END IF;

  v_unit_id := p_unit_id;
  IF v_unit_id IS NULL THEN
    SELECT base_unit_id INTO v_unit_id
    FROM public.products
    WHERE id = p_product_id;
  END IF;

  INSERT INTO public.inventory_adjustments (
    product_id,
    warehouse_id,
    lot_id,
    reason,
    qty,
    unit_id,
    note,
    adjusted_by,
    adjusted_at
  ) VALUES (
    p_product_id,
    p_warehouse_id,
    p_lot_id,
    trim(p_reason),
    p_qty,
    v_unit_id,
    nullif(trim(coalesce(p_note, '')), ''),
    auth.uid(),
    now()
  )
  RETURNING id INTO v_adjustment_id;

  INSERT INTO public.inventory_movements (
    product_id,
    warehouse_id,
    lot_id,
    movement,
    qty,
    unit_id,
    source_type,
    source_id,
    reference,
    performed_by,
    performed_at
  ) VALUES (
    p_product_id,
    p_warehouse_id,
    p_lot_id,
    'ADJUSTMENT',
    p_qty,
    v_unit_id,
    'adjustment',
    v_adjustment_id,
    trim(p_reason),
    auth.uid(),
    now()
  );

  RETURN v_adjustment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_cycle_count(
  p_warehouse_id integer,
  p_scheduled_for date
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;

  IF p_scheduled_for IS NULL THEN
    RAISE EXCEPTION 'Scheduled date is required';
  END IF;

  INSERT INTO public.cycle_counts (warehouse_id, scheduled_for, status, created_at)
  VALUES (p_warehouse_id, p_scheduled_for, 'SCHEDULED', now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_cycle_count_line(
  p_cycle_count_id bigint,
  p_product_id integer,
  p_lot_id bigint DEFAULT NULL,
  p_counted_qty numeric DEFAULT NULL,
  p_unit_id integer DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count public.cycle_counts%ROWTYPE;
  v_line_id bigint;
  v_existing_id bigint;
  v_unit_id integer;
  v_lot_product_id integer;
  v_lot_warehouse_id integer;
BEGIN
  SELECT * INTO v_count
  FROM public.cycle_counts
  WHERE id = p_cycle_count_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle count % not found', p_cycle_count_id;
  END IF;

  IF v_count.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cycle count % is not editable in status %', p_cycle_count_id, v_count.status;
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Product is required';
  END IF;

  IF p_lot_id IS NOT NULL THEN
    SELECT sb.product_id, s.warehouse_id
      INTO v_lot_product_id, v_lot_warehouse_id
    FROM public.supply_batches sb
    JOIN public.supplies s ON s.id = sb.supply_id
    WHERE sb.id = p_lot_id;

    IF v_lot_product_id IS NULL THEN
      RAISE EXCEPTION 'Invalid lot id %', p_lot_id;
    END IF;

    IF v_lot_product_id <> p_product_id THEN
      RAISE EXCEPTION 'Lot % does not belong to product %', p_lot_id, p_product_id;
    END IF;

    IF v_lot_warehouse_id IS DISTINCT FROM v_count.warehouse_id THEN
      RAISE EXCEPTION 'Lot % does not belong to warehouse %', p_lot_id, v_count.warehouse_id;
    END IF;
  END IF;

  v_unit_id := p_unit_id;
  IF v_unit_id IS NULL THEN
    SELECT base_unit_id INTO v_unit_id
    FROM public.products
    WHERE id = p_product_id;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.cycle_count_lines
  WHERE cycle_count_id = p_cycle_count_id
    AND product_id = p_product_id
    AND lot_id IS NOT DISTINCT FROM p_lot_id
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.cycle_count_lines (
      cycle_count_id,
      product_id,
      lot_id,
      counted_qty,
      unit_id,
      notes
    ) VALUES (
      p_cycle_count_id,
      p_product_id,
      p_lot_id,
      p_counted_qty,
      v_unit_id,
      nullif(trim(coalesce(p_notes, '')), '')
    )
    RETURNING id INTO v_line_id;
  ELSE
    UPDATE public.cycle_count_lines
    SET counted_qty = p_counted_qty,
        unit_id = v_unit_id,
        notes = nullif(trim(coalesce(p_notes, '')), '')
    WHERE id = v_existing_id
    RETURNING id INTO v_line_id;
  END IF;

  IF v_count.status = 'SCHEDULED' THEN
    UPDATE public.cycle_counts
    SET status = 'IN_PROGRESS'
    WHERE id = p_cycle_count_id;
  END IF;

  RETURN v_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_cycle_count(
  p_cycle_count_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.cycle_counts
  WHERE id = p_cycle_count_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Cycle count % not found', p_cycle_count_id;
  END IF;

  IF v_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Cycle count % is already completed', p_cycle_count_id;
  END IF;

  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cancelled cycle count cannot be completed';
  END IF;

  UPDATE public.cycle_counts
  SET status = 'IN_PROGRESS'
  WHERE id = p_cycle_count_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_cycle_count_variance(
  p_cycle_count_id bigint,
  p_actor uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count public.cycle_counts%ROWTYPE;
  v_line RECORD;
  v_system_qty numeric;
  v_variance numeric;
BEGIN
  SELECT * INTO v_count
  FROM public.cycle_counts
  WHERE id = p_cycle_count_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle count % not found', p_cycle_count_id;
  END IF;

  IF v_count.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Cycle count % is already completed', p_cycle_count_id;
  END IF;

  IF v_count.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Cycle count % must be IN_PROGRESS to apply variance', p_cycle_count_id;
  END IF;

  FOR v_line IN
    SELECT id, product_id, lot_id, counted_qty, unit_id
    FROM public.cycle_count_lines
    WHERE cycle_count_id = p_cycle_count_id
      AND counted_qty IS NOT NULL
  LOOP
    SELECT coalesce(sl.on_hand, 0)
      INTO v_system_qty
    FROM public.stock_levels sl
    WHERE sl.product_id = v_line.product_id
      AND sl.warehouse_id = v_count.warehouse_id
      AND sl.lot_id IS NOT DISTINCT FROM v_line.lot_id
    LIMIT 1;

    v_system_qty := coalesce(v_system_qty, 0);
    v_variance := coalesce(v_line.counted_qty, 0) - v_system_qty;

    UPDATE public.cycle_count_lines
    SET variance_qty = v_variance
    WHERE id = v_line.id;

    IF v_variance <> 0 THEN
      INSERT INTO public.inventory_movements (
        product_id,
        warehouse_id,
        lot_id,
        movement,
        qty,
        unit_id,
        source_type,
        source_id,
        reference,
        performed_by,
        performed_at
      ) VALUES (
        v_line.product_id,
        v_count.warehouse_id,
        v_line.lot_id,
        'ADJUSTMENT',
        v_variance,
        v_line.unit_id,
        'count',
        p_cycle_count_id,
        'Cycle count variance',
        coalesce(p_actor, auth.uid()),
        now()
      );
    END IF;
  END LOOP;

  UPDATE public.cycle_counts
  SET status = 'COMPLETED'
  WHERE id = p_cycle_count_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_adjustment(integer, integer, numeric, text, bigint, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_cycle_count(integer, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_cycle_count_line(bigint, integer, bigint, numeric, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_cycle_count(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_cycle_count_variance(bigint, uuid) TO authenticated, service_role;

COMMIT;
