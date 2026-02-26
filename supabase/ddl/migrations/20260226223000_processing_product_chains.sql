-- Processing product chain model + atomic create/update RPCs

CREATE TABLE IF NOT EXISTS public.product_processing_chains (
  id bigserial PRIMARY KEY,
  name text NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_processing_chain_members (
  id bigserial PRIMARY KEY,
  chain_id bigint NOT NULL REFERENCES public.product_processing_chains(id) ON DELETE CASCADE,
  product_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('RAW', 'WIP', 'FINISHED')),
  display_order integer NOT NULL DEFAULT 1,
  CONSTRAINT product_processing_chain_members_unique UNIQUE (chain_id, product_id)
);

CREATE INDEX IF NOT EXISTS product_processing_chain_members_chain_stage_order_idx
  ON public.product_processing_chain_members(chain_id, stage, display_order);

CREATE OR REPLACE FUNCTION public.create_processing_product_chain(
  p_chain_name text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_actor uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chain_id bigint;
  v_raw jsonb;
  v_wip jsonb;
  v_finished jsonb;
  v_raw_count int := 0;
  v_wip_count int := 0;
  v_finished_count int := 0;
  v_row jsonb;
  v_seq int := 0;
  v_product_id bigint;
  v_component_index int;
BEGIN
  v_raw := COALESCE(p_payload->'raws', '[]'::jsonb);
  v_wip := COALESCE(p_payload->'wips', '[]'::jsonb);
  v_finished := COALESCE(p_payload->'finished', '[]'::jsonb);

  IF jsonb_typeof(v_raw) <> 'array' OR jsonb_array_length(v_raw) = 0 THEN
    RAISE EXCEPTION 'At least one RAW product is required';
  END IF;
  IF jsonb_typeof(v_wip) <> 'array' OR jsonb_array_length(v_wip) = 0 THEN
    RAISE EXCEPTION 'At least one WIP product is required';
  END IF;
  IF jsonb_typeof(v_finished) <> 'array' OR jsonb_array_length(v_finished) = 0 THEN
    RAISE EXCEPTION 'At least one FINISHED product is required';
  END IF;

  INSERT INTO public.product_processing_chains (name, status)
  VALUES (NULLIF(trim(COALESCE(p_chain_name, '')), ''), 'ACTIVE')
  RETURNING id INTO v_chain_id;

  CREATE TEMP TABLE tmp_raw_map (idx int PRIMARY KEY, product_id bigint NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_wip_map (idx int PRIMARY KEY, product_id bigint NOT NULL) ON COMMIT DROP;

  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_raw)
  LOOP
    v_seq := v_seq + 1;
    IF COALESCE(NULLIF(trim(v_row->>'name'), ''), '') = '' THEN
      RAISE EXCEPTION 'RAW row % name is required', v_seq;
    END IF;

    v_product_id := nextval(pg_get_serial_sequence('public.products', 'id'));
    INSERT INTO public.products (
      id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, product_type
    ) VALUES (
      v_product_id,
      'PRD-' || lpad(v_product_id::text, 5, '0'),
      trim(v_row->>'name'),
      NULL,
      NULLIF(v_row->>'base_unit_id', '')::int,
      NULLIF(v_row->>'reorder_point', '')::numeric,
      NULLIF(v_row->>'safety_stock', '')::numeric,
      NULLIF(v_row->>'target_stock', '')::numeric,
      COALESCE(NULLIF(upper(v_row->>'status'), ''), 'ACTIVE'),
      NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
      'RAW'
    );

    INSERT INTO public.product_processing_chain_members (chain_id, product_id, stage, display_order)
    VALUES (v_chain_id, v_product_id, 'RAW', v_seq);

    INSERT INTO tmp_raw_map (idx, product_id) VALUES (v_raw_count, v_product_id);
    v_raw_count := v_raw_count + 1;
  END LOOP;

  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_wip)
  LOOP
    v_seq := v_seq + 1;
    IF COALESCE(NULLIF(trim(v_row->>'name'), ''), '') = '' THEN
      RAISE EXCEPTION 'WIP row % name is required', v_seq;
    END IF;
    IF jsonb_typeof(COALESCE(v_row->'raw_component_indexes', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(v_row->'raw_component_indexes', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'WIP row % must reference at least one RAW', v_seq;
    END IF;

    v_product_id := nextval(pg_get_serial_sequence('public.products', 'id'));
    INSERT INTO public.products (
      id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, product_type
    ) VALUES (
      v_product_id,
      'PRD-' || lpad(v_product_id::text, 5, '0'),
      trim(v_row->>'name'),
      NULL,
      NULLIF(v_row->>'base_unit_id', '')::int,
      NULLIF(v_row->>'reorder_point', '')::numeric,
      NULLIF(v_row->>'safety_stock', '')::numeric,
      NULLIF(v_row->>'target_stock', '')::numeric,
      COALESCE(NULLIF(upper(v_row->>'status'), ''), 'ACTIVE'),
      NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
      'WIP'
    );

    INSERT INTO public.product_processing_chain_members (chain_id, product_id, stage, display_order)
    VALUES (v_chain_id, v_product_id, 'WIP', v_seq);

    INSERT INTO tmp_wip_map (idx, product_id) VALUES (v_wip_count, v_product_id);
    v_wip_count := v_wip_count + 1;

    FOR v_component_index IN
      SELECT value::int FROM jsonb_array_elements_text(COALESCE(v_row->'raw_component_indexes', '[]'::jsonb))
    LOOP
      INSERT INTO public.product_components (parent_product_id, component_product_id)
      SELECT v_product_id, product_id
      FROM tmp_raw_map
      WHERE idx = v_component_index;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'WIP row % references missing RAW index %', v_seq, v_component_index;
      END IF;
    END LOOP;
  END LOOP;

  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_finished)
  LOOP
    v_seq := v_seq + 1;
    IF COALESCE(NULLIF(trim(v_row->>'name'), ''), '') = '' THEN
      RAISE EXCEPTION 'FINISHED row % name is required', v_seq;
    END IF;
    IF jsonb_typeof(COALESCE(v_row->'wip_component_indexes', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(v_row->'wip_component_indexes', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'FINISHED row % must reference at least one WIP', v_seq;
    END IF;

    v_product_id := nextval(pg_get_serial_sequence('public.products', 'id'));
    INSERT INTO public.products (
      id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, product_type
    ) VALUES (
      v_product_id,
      'PRD-' || lpad(v_product_id::text, 5, '0'),
      trim(v_row->>'name'),
      NULL,
      NULLIF(v_row->>'base_unit_id', '')::int,
      NULLIF(v_row->>'reorder_point', '')::numeric,
      NULLIF(v_row->>'safety_stock', '')::numeric,
      NULLIF(v_row->>'target_stock', '')::numeric,
      COALESCE(NULLIF(upper(v_row->>'status'), ''), 'ACTIVE'),
      NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
      'FINISHED'
    );

    INSERT INTO public.product_processing_chain_members (chain_id, product_id, stage, display_order)
    VALUES (v_chain_id, v_product_id, 'FINISHED', v_seq);

    v_finished_count := v_finished_count + 1;

    FOR v_component_index IN
      SELECT value::int FROM jsonb_array_elements_text(COALESCE(v_row->'wip_component_indexes', '[]'::jsonb))
    LOOP
      INSERT INTO public.product_components (parent_product_id, component_product_id)
      SELECT v_product_id, product_id
      FROM tmp_wip_map
      WHERE idx = v_component_index;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'FINISHED row % references missing WIP index %', v_seq, v_component_index;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.product_processing_chains
  SET updated_at = now(),
      name = COALESCE(NULLIF(trim(COALESCE(p_chain_name, '')), ''), format('Chain %s', v_chain_id))
  WHERE id = v_chain_id;

  RETURN v_chain_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_processing_product_chain(
  p_chain_id bigint,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_chain_name text DEFAULT NULL,
  p_actor uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw jsonb;
  v_wip jsonb;
  v_finished jsonb;
  v_row jsonb;
  v_seq int;
  v_product_id bigint;
  v_component_index int;
BEGIN
  IF p_chain_id IS NULL OR p_chain_id <= 0 THEN
    RAISE EXCEPTION 'Valid chain id is required';
  END IF;

  PERFORM 1 FROM public.product_processing_chains WHERE id = p_chain_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processing chain % not found', p_chain_id;
  END IF;

  v_raw := COALESCE(p_payload->'raws', '[]'::jsonb);
  v_wip := COALESCE(p_payload->'wips', '[]'::jsonb);
  v_finished := COALESCE(p_payload->'finished', '[]'::jsonb);

  IF jsonb_typeof(v_raw) <> 'array' OR jsonb_array_length(v_raw) = 0 THEN
    RAISE EXCEPTION 'At least one RAW product is required';
  END IF;
  IF jsonb_typeof(v_wip) <> 'array' OR jsonb_array_length(v_wip) = 0 THEN
    RAISE EXCEPTION 'At least one WIP product is required';
  END IF;
  IF jsonb_typeof(v_finished) <> 'array' OR jsonb_array_length(v_finished) = 0 THEN
    RAISE EXCEPTION 'At least one FINISHED product is required';
  END IF;

  CREATE TEMP TABLE tmp_existing_members AS
    SELECT product_id, stage
    FROM public.product_processing_chain_members
    WHERE chain_id = p_chain_id;

  CREATE TEMP TABLE tmp_keep_products (product_id bigint PRIMARY KEY) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_raw_map (idx int PRIMARY KEY, product_id bigint NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_wip_map (idx int PRIMARY KEY, product_id bigint NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_finished_map (idx int PRIMARY KEY, product_id bigint NOT NULL) ON COMMIT DROP;

  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_raw)
  LOOP
    IF COALESCE(NULLIF(trim(v_row->>'name'), ''), '') = '' THEN
      RAISE EXCEPTION 'RAW name is required';
    END IF;

    IF NULLIF(v_row->>'id', '') IS NOT NULL THEN
      v_product_id := (v_row->>'id')::bigint;
      PERFORM 1 FROM tmp_existing_members WHERE product_id = v_product_id AND stage = 'RAW';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RAW product id % is not a member of chain %', v_product_id, p_chain_id;
      END IF;

      UPDATE public.products
      SET name = trim(v_row->>'name'),
          base_unit_id = NULLIF(v_row->>'base_unit_id', '')::int,
          reorder_point = NULLIF(v_row->>'reorder_point', '')::numeric,
          safety_stock = NULLIF(v_row->>'safety_stock', '')::numeric,
          target_stock = NULLIF(v_row->>'target_stock', '')::numeric,
          status = COALESCE(NULLIF(upper(v_row->>'status'), ''), 'ACTIVE'),
          notes = NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
          product_type = 'RAW',
          updated_at = now()
      WHERE id = v_product_id;
    ELSE
      v_product_id := nextval(pg_get_serial_sequence('public.products', 'id'));
      INSERT INTO public.products (
        id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, product_type
      ) VALUES (
        v_product_id,
        'PRD-' || lpad(v_product_id::text, 5, '0'),
        trim(v_row->>'name'),
        NULL,
        NULLIF(v_row->>'base_unit_id', '')::int,
        NULLIF(v_row->>'reorder_point', '')::numeric,
        NULLIF(v_row->>'safety_stock', '')::numeric,
        NULLIF(v_row->>'target_stock', '')::numeric,
        COALESCE(NULLIF(upper(v_row->>'status'), ''), 'ACTIVE'),
        NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
        'RAW'
      );
    END IF;

    INSERT INTO tmp_keep_products(product_id) VALUES (v_product_id) ON CONFLICT DO NOTHING;
    INSERT INTO tmp_raw_map(idx, product_id) VALUES (v_seq, v_product_id);
    v_seq := v_seq + 1;
  END LOOP;

  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_wip)
  LOOP
    IF COALESCE(NULLIF(trim(v_row->>'name'), ''), '') = '' THEN
      RAISE EXCEPTION 'WIP name is required';
    END IF;
    IF jsonb_typeof(COALESCE(v_row->'raw_component_indexes', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(v_row->'raw_component_indexes', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'WIP must reference at least one RAW';
    END IF;

    IF NULLIF(v_row->>'id', '') IS NOT NULL THEN
      v_product_id := (v_row->>'id')::bigint;
      PERFORM 1 FROM tmp_existing_members WHERE product_id = v_product_id AND stage = 'WIP';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'WIP product id % is not a member of chain %', v_product_id, p_chain_id;
      END IF;

      UPDATE public.products
      SET name = trim(v_row->>'name'),
          base_unit_id = NULLIF(v_row->>'base_unit_id', '')::int,
          reorder_point = NULLIF(v_row->>'reorder_point', '')::numeric,
          safety_stock = NULLIF(v_row->>'safety_stock', '')::numeric,
          target_stock = NULLIF(v_row->>'target_stock', '')::numeric,
          status = COALESCE(NULLIF(upper(v_row->>'status'), ''), 'ACTIVE'),
          notes = NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
          product_type = 'WIP',
          updated_at = now()
      WHERE id = v_product_id;
    ELSE
      v_product_id := nextval(pg_get_serial_sequence('public.products', 'id'));
      INSERT INTO public.products (
        id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, product_type
      ) VALUES (
        v_product_id,
        'PRD-' || lpad(v_product_id::text, 5, '0'),
        trim(v_row->>'name'),
        NULL,
        NULLIF(v_row->>'base_unit_id', '')::int,
        NULLIF(v_row->>'reorder_point', '')::numeric,
        NULLIF(v_row->>'safety_stock', '')::numeric,
        NULLIF(v_row->>'target_stock', '')::numeric,
        COALESCE(NULLIF(upper(v_row->>'status'), ''), 'ACTIVE'),
        NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
        'WIP'
      );
    END IF;

    INSERT INTO tmp_keep_products(product_id) VALUES (v_product_id) ON CONFLICT DO NOTHING;
    INSERT INTO tmp_wip_map(idx, product_id) VALUES (v_seq, v_product_id);
    v_seq := v_seq + 1;
  END LOOP;

  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_finished)
  LOOP
    IF COALESCE(NULLIF(trim(v_row->>'name'), ''), '') = '' THEN
      RAISE EXCEPTION 'FINISHED name is required';
    END IF;
    IF jsonb_typeof(COALESCE(v_row->'wip_component_indexes', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(v_row->'wip_component_indexes', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'FINISHED must reference at least one WIP';
    END IF;

    IF NULLIF(v_row->>'id', '') IS NOT NULL THEN
      v_product_id := (v_row->>'id')::bigint;
      PERFORM 1 FROM tmp_existing_members WHERE product_id = v_product_id AND stage = 'FINISHED';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'FINISHED product id % is not a member of chain %', v_product_id, p_chain_id;
      END IF;

      UPDATE public.products
      SET name = trim(v_row->>'name'),
          base_unit_id = NULLIF(v_row->>'base_unit_id', '')::int,
          reorder_point = NULLIF(v_row->>'reorder_point', '')::numeric,
          safety_stock = NULLIF(v_row->>'safety_stock', '')::numeric,
          target_stock = NULLIF(v_row->>'target_stock', '')::numeric,
          status = COALESCE(NULLIF(upper(v_row->>'status'), ''), 'ACTIVE'),
          notes = NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
          product_type = 'FINISHED',
          updated_at = now()
      WHERE id = v_product_id;
    ELSE
      v_product_id := nextval(pg_get_serial_sequence('public.products', 'id'));
      INSERT INTO public.products (
        id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, product_type
      ) VALUES (
        v_product_id,
        'PRD-' || lpad(v_product_id::text, 5, '0'),
        trim(v_row->>'name'),
        NULL,
        NULLIF(v_row->>'base_unit_id', '')::int,
        NULLIF(v_row->>'reorder_point', '')::numeric,
        NULLIF(v_row->>'safety_stock', '')::numeric,
        NULLIF(v_row->>'target_stock', '')::numeric,
        COALESCE(NULLIF(upper(v_row->>'status'), ''), 'ACTIVE'),
        NULLIF(trim(COALESCE(v_row->>'notes', '')), ''),
        'FINISHED'
      );
    END IF;

    INSERT INTO tmp_keep_products(product_id) VALUES (v_product_id) ON CONFLICT DO NOTHING;
    INSERT INTO tmp_finished_map(idx, product_id) VALUES (v_seq, v_product_id)
    ON CONFLICT (idx) DO UPDATE SET product_id = EXCLUDED.product_id;
    v_seq := v_seq + 1;
  END LOOP;

  -- Rebuild chain membership rows
  DELETE FROM public.product_processing_chain_members WHERE chain_id = p_chain_id;

  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_raw)
  LOOP
    IF NULLIF(v_row->>'id', '') IS NOT NULL THEN
      v_product_id := (v_row->>'id')::bigint;
    ELSE
      SELECT product_id INTO v_product_id FROM tmp_raw_map WHERE idx = v_seq;
    END IF;

    INSERT INTO public.product_processing_chain_members(chain_id, product_id, stage, display_order)
    VALUES (p_chain_id, v_product_id, 'RAW', v_seq + 1);
    v_seq := v_seq + 1;
  END LOOP;

  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_wip)
  LOOP
    IF NULLIF(v_row->>'id', '') IS NOT NULL THEN
      v_product_id := (v_row->>'id')::bigint;
    ELSE
      SELECT product_id INTO v_product_id FROM tmp_wip_map WHERE idx = v_seq;
    END IF;

    INSERT INTO public.product_processing_chain_members(chain_id, product_id, stage, display_order)
    VALUES (p_chain_id, v_product_id, 'WIP', v_seq + 1);
    v_seq := v_seq + 1;
  END LOOP;

  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_finished)
  LOOP
    IF NULLIF(v_row->>'id', '') IS NOT NULL THEN
      v_product_id := (v_row->>'id')::bigint;
    ELSE
      SELECT product_id INTO v_product_id FROM tmp_finished_map WHERE idx = v_seq;
    END IF;

    INSERT INTO public.product_processing_chain_members(chain_id, product_id, stage, display_order)
    VALUES (p_chain_id, v_product_id, 'FINISHED', v_seq + 1);
    v_seq := v_seq + 1;
  END LOOP;

  -- Remove old component links for members in this chain; rebuild below.
  DELETE FROM public.product_components
  WHERE parent_product_id IN (
    SELECT product_id FROM public.product_processing_chain_members WHERE chain_id = p_chain_id AND stage IN ('WIP', 'FINISHED')
  );

  -- Rebuild WIP -> RAW
  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_wip)
  LOOP
    IF NULLIF(v_row->>'id', '') IS NOT NULL THEN
      v_product_id := (v_row->>'id')::bigint;
    ELSE
      SELECT product_id INTO v_product_id FROM tmp_wip_map WHERE idx = v_seq;
    END IF;

    FOR v_component_index IN
      SELECT value::int FROM jsonb_array_elements_text(COALESCE(v_row->'raw_component_indexes', '[]'::jsonb))
    LOOP
      INSERT INTO public.product_components(parent_product_id, component_product_id)
      SELECT v_product_id, product_id
      FROM tmp_raw_map
      WHERE idx = v_component_index;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'WIP references missing RAW index %', v_component_index;
      END IF;
    END LOOP;

    v_seq := v_seq + 1;
  END LOOP;

  -- Rebuild FINISHED -> WIP
  v_seq := 0;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_finished)
  LOOP
    IF NULLIF(v_row->>'id', '') IS NOT NULL THEN
      v_product_id := (v_row->>'id')::bigint;
    ELSE
      SELECT product_id INTO v_product_id FROM tmp_finished_map WHERE idx = v_seq;
    END IF;

    FOR v_component_index IN
      SELECT value::int FROM jsonb_array_elements_text(COALESCE(v_row->'wip_component_indexes', '[]'::jsonb))
    LOOP
      INSERT INTO public.product_components(parent_product_id, component_product_id)
      SELECT v_product_id, product_id
      FROM tmp_wip_map
      WHERE idx = v_component_index;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'FINISHED references missing WIP index %', v_component_index;
      END IF;
    END LOOP;

    v_seq := v_seq + 1;
  END LOOP;

  -- Delete products removed from chain payload.
  DELETE FROM public.products p
  WHERE p.id IN (
    SELECT e.product_id
    FROM tmp_existing_members e
    LEFT JOIN tmp_keep_products k ON k.product_id = e.product_id
    WHERE k.product_id IS NULL
  );

  UPDATE public.product_processing_chains
  SET name = COALESCE(NULLIF(trim(COALESCE(p_chain_name, '')), ''), name),
      updated_at = now()
  WHERE id = p_chain_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_processing_product_chain(text, jsonb, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_processing_product_chain(bigint, jsonb, text, uuid) TO anon, authenticated, service_role;
