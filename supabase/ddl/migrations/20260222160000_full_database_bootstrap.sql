


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."factory_grade_enum" AS ENUM (
    'EXPORT',
    'LOCAL',
    'SECOND_LOCAL',
    'REJECT'
);


ALTER TYPE "public"."factory_grade_enum" OWNER TO "postgres";


CREATE TYPE "public"."movement_type" AS ENUM (
    'RECEIPT',
    'ADJUSTMENT',
    'ALLOCATION',
    'SHIPMENT',
    'QUALITY_HOLD',
    'QUALITY_RELEASE'
);


ALTER TYPE "public"."movement_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_batch"("p_batch_id" bigint, "p_accept_qty" numeric, "p_warehouse_id" bigint, "p_actor" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_product_id bigint;
BEGIN
  SELECT product_id INTO v_product_id FROM public.supply_batches WHERE id = p_batch_id FOR UPDATE;

  UPDATE public.supply_batches
  SET accepted_qty = accepted_qty + p_accept_qty,
      current_qty = current_qty + p_accept_qty
  WHERE id = p_batch_id;

  INSERT INTO public.stock_movements (movement_type, ref_table, ref_id, product_id, warehouse_id, batch_id, qty, actor, note)
  VALUES ('RECEIPT_ACCEPT', 'supply_batches', p_batch_id, v_product_id, p_warehouse_id, p_batch_id, p_accept_qty, p_actor, 'Accept batch into stock');

  INSERT INTO public.chain_events (event_time, event_type, ref_table, ref_id, product_id, batch_id, metadata)
  VALUES (now(), 'ACCEPTED_INTO_STOCK', 'public.supply_batches', p_batch_id, v_product_id, p_batch_id, jsonb_build_object('accepted_qty', p_accept_qty, 'warehouse_id', p_warehouse_id));
END;
$$;


ALTER FUNCTION "public"."accept_batch"("p_batch_id" bigint, "p_accept_qty" numeric, "p_warehouse_id" bigint, "p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_inventory_movement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  on_hand_delta numeric := 0;
  allocated_delta numeric := 0;
  quality_delta numeric := 0;
  transit_delta numeric := 0;
begin
  case new.movement
    when 'RECEIPT' then
      on_hand_delta := new.qty;
    when 'ADJUSTMENT' then
      on_hand_delta := new.qty;
    when 'ALLOCATION' then
      on_hand_delta := -new.qty;
      allocated_delta := new.qty;
    when 'SHIPMENT' then
      allocated_delta := -new.qty;
    when 'QUALITY_HOLD' then
      on_hand_delta := -new.qty;
      quality_delta := new.qty;
    when 'QUALITY_RELEASE' then
      quality_delta := -new.qty;
      on_hand_delta := new.qty;
  end case;

  perform public.upsert_stock_level(
    new.product_id,
    new.warehouse_id,
    new.lot_id,
    on_hand_delta,
    allocated_delta,
    quality_delta,
    transit_delta
  );

  if new.lot_id is not null then
    update public.supply_batches
       set current_qty = coalesce(current_qty,0) + coalesce(on_hand_delta,0),
           updated_at = now()
     where id = new.lot_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."apply_inventory_movement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_if_write"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_operation text := TG_OP;           -- INSERT/UPDATE/DELETE
  v_old jsonb;
  v_new jsonb;
  v_pk_cols text[];
  v_pk jsonb := '{}'::jsonb;
  v_col text;
  v_user_text text;
  v_user_uuid uuid := NULL;
BEGIN
  -- Avoid auditing the audit_logs table itself
  IF TG_TABLE_NAME = 'audit_logs' AND TG_TABLE_SCHEMA = 'public' THEN
    RETURN NULL;
  END IF;

  -- Build jsonb versions
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_old := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);

    -- If nothing changed (identical entire row), skip audit
    IF v_new = v_old THEN
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
  END IF;

  -- Try to determine acting user:
  -- First prefer manual session setting 'audit.user', then common jwt.claims.user_id
  BEGIN
    v_user_text := current_setting('audit.user', true);
  EXCEPTION WHEN others THEN
    v_user_text := NULL;
  END;

  IF v_user_text IS NULL THEN
    BEGIN
      v_user_text := current_setting('jwt.claims.user_id', true);
    EXCEPTION WHEN others THEN
      v_user_text := NULL;
    END;
  END IF;

  -- Try to cast to uuid safely
  IF v_user_text IS NOT NULL THEN
    BEGIN
      v_user_uuid := v_user_text::uuid;
    EXCEPTION WHEN others THEN
      v_user_uuid := NULL;
    END;
  END IF;

  -- Discover primary key columns for the target table
  SELECT array_agg(a.attname::text ORDER BY a.attnum)
  INTO v_pk_cols
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = format('%I.%I', TG_TABLE_SCHEMA, TG_TABLE_NAME)::regclass
    AND i.indisprimary;

  -- If no primary key, fall back to 'id' if present
  IF v_pk_cols IS NULL THEN
    IF (v_new IS NOT NULL AND v_new ? 'id') OR (v_old IS NOT NULL AND v_old ? 'id') THEN
      v_pk_cols := ARRAY['id'];
    ELSE
      -- use first column available as best-effort fallback
      IF v_new IS NOT NULL THEN
        v_pk_cols := ARRAY[(SELECT jsonb_object_keys(v_new)::text LIMIT 1)];
      ELSIF v_old IS NOT NULL THEN
        v_pk_cols := ARRAY[(SELECT jsonb_object_keys(v_old)::text LIMIT 1)];
      ELSE
        v_pk_cols := ARRAY[]::text[];
      END IF;
    END IF;
  END IF;

  -- Build primary_key jsonb
  FOREACH v_col IN ARRAY v_pk_cols LOOP
    IF v_col IS NULL THEN
      CONTINUE;
    END IF;

    IF v_new IS NOT NULL AND (v_new ? v_col) THEN
      v_pk := v_pk || jsonb_build_object(v_col, v_new -> v_col);
    ELSIF v_old IS NOT NULL AND (v_old ? v_col) THEN
      v_pk := v_pk || jsonb_build_object(v_col, v_old -> v_col);
    ELSE
      v_pk := v_pk || jsonb_build_object(v_col, NULL);
    END IF;
  END LOOP;

  -- Insert audit row
  INSERT INTO public.audit_logs(
    id,
    table_schema,
    table_name,
    operation,
    changed_by,
    change_time,
    primary_key,
    old_data,
    new_data,
    change_summary
  )
  VALUES (
    gen_random_uuid(),
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    v_operation,
    v_user_uuid,
    now(),
    v_pk,
    v_old,
    v_new,
    -- produce a minimal human-readable summary
    CASE
      WHEN v_operation = 'INSERT' THEN format('Inserted %s row', TG_TABLE_NAME)
      WHEN v_operation = 'UPDATE' THEN format('Updated %s row', TG_TABLE_NAME)
      WHEN v_operation = 'DELETE' THEN format('Deleted %s row', TG_TABLE_NAME)
      ELSE NULL
    END
  );

  RETURN NULL; -- AFTER trigger; no modification to the row
END;
$$;


ALTER FUNCTION "public"."audit_if_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_create_process_step_runs"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Insert process_step_runs for all steps in the process
  INSERT INTO process_step_runs (process_lot_run_id, process_step_id, status)
  SELECT 
    NEW.id,
    ps.id,
    'PENDING'
  FROM process_steps ps
  WHERE ps.process_id = NEW.process_id
  ORDER BY ps.seq;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_process_step_runs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_step"("p_batch_id" bigint, "p_step_id" bigint, "p_operator_id" bigint, "p_equipment_id" bigint, "p_input_qty" numeric, "p_output_qty" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_proc_id bigint;
  v_event_id bigint;
BEGIN
  SELECT process_id INTO v_proc_id FROM public.factory_process_steps WHERE id = p_step_id;

  INSERT INTO public.factory_batch_process_events (batch_id, process_id, step_id, event_type, started_at, completed_at, operator_id, equipment_id, input_qty, output_qty, notes, created_at)
  VALUES (p_batch_id, v_proc_id, p_step_id, 'COMPLETE', now(), now(), p_operator_id, p_equipment_id, p_input_qty, p_output_qty, p_notes, now())
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;


ALTER FUNCTION "public"."complete_step"("p_batch_id" bigint, "p_step_id" bigint, "p_operator_id" bigint, "p_equipment_id" bigint, "p_input_qty" numeric, "p_output_qty" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_box_pack_rule"("p_id" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.box_pack_rules
  where id = p_id;
  return true;
end;
$$;


ALTER FUNCTION "public"."delete_box_pack_rule"("p_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_apply_stock_movement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.warehouse_id IS NOT NULL THEN
    INSERT INTO public.stock_levels (product_id, warehouse_id, qty, last_updated)
    VALUES (NEW.product_id, NEW.warehouse_id, GREATEST(NEW.qty,0), now())
    ON CONFLICT (product_id, warehouse_id) DO UPDATE
      SET qty = GREATEST(public.stock_levels.qty + NEW.qty, 0),
          last_updated = now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_apply_stock_movement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_batch_event_chain_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  prev_id bigint;
  prod_id bigint;
  step_code text;
BEGIN
  SELECT id INTO prev_id FROM public.chain_events
    WHERE batch_id = NEW.batch_id
    ORDER BY event_time DESC LIMIT 1;

  SELECT product_id INTO prod_id FROM public.supply_batches WHERE id = NEW.batch_id;

  SELECT step_code INTO step_code FROM public.factory_process_steps WHERE id = NEW.step_id;

  INSERT INTO public.chain_events (event_time, event_type, ref_table, ref_id, product_id, batch_id, previous_event_id, process_event_id, actor, metadata)
  VALUES (COALESCE(NEW.completed_at, NEW.started_at, now()),
          CONCAT('PROCESS_', NEW.event_type, '_', COALESCE(step_code,'UNKNOWN')),
          'public.factory_batch_process_events', NEW.id, prod_id, NEW.batch_id, prev_id, NEW.id, NULL,
          jsonb_build_object('process_id', NEW.process_id, 'step_id', NEW.step_id, 'input_qty', NEW.input_qty, 'output_qty', NEW.output_qty)
         );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_batch_event_chain_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_check_second_local_packaging"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  gr record;
  pp record;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.grading_result_id IS NOT NULL THEN
      SELECT grade INTO gr FROM public.factory_grading_results WHERE id = NEW.grading_result_id;
      IF gr.grade = 'SECOND_LOCAL' AND NEW.packaging_profile_id IS NOT NULL THEN
        SELECT is_vacuum, code INTO pp FROM public.factory_packaging_profiles WHERE id = NEW.packaging_profile_id;
        IF pp.is_vacuum = true THEN
          RAISE EXCEPTION 'SECOND_LOCAL grade cannot use vacuum packaging. packaging_profile=%', pp.code;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_check_second_local_packaging"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_qc_event_chain_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  prev_id bigint;
  prod_id bigint;
BEGIN
  SELECT id INTO prev_id FROM public.chain_events
    WHERE batch_id = NEW.batch_id
    ORDER BY event_time DESC LIMIT 1;

  SELECT product_id INTO prod_id FROM public.supply_batches WHERE id = NEW.batch_id;

  INSERT INTO public.chain_events (event_time, event_type, ref_table, ref_id, product_id, batch_id, previous_event_id, actor, metadata)
  VALUES (NEW.detected_at,
          CONCAT('QC_', NEW.check_type, '_', CASE WHEN NEW.passed THEN 'PASS' ELSE 'FAIL' END),
          'public.factory_quality_checks', NEW.id, prod_id, NEW.batch_id, prev_id, NEW.recorded_by,
          jsonb_build_object('measured_value', NEW.measured_value, 'unit', NEW.unit, 'notes', NEW.notes)
         );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_qc_event_chain_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_box_pack_rules"() RETURNS TABLE("id" integer, "box_unit_id" integer, "packet_unit_id" integer, "packets_per_box" integer, "is_active" boolean, "created_at" timestamp with time zone, "box_unit_code" "text", "box_unit_name" "text", "packet_unit_code" "text", "packet_unit_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    r.id,
    r.box_unit_id,
    r.packet_unit_id,
    r.packets_per_box,
    r.is_active,
    r.created_at,
    b.code as box_unit_code,
    b.name as box_unit_name,
    p.code as packet_unit_code,
    p.name as packet_unit_name
  from public.box_pack_rules r
  left join public.packaging_units b on b.id = r.box_unit_id
  left join public.packaging_units p on p.id = r.packet_unit_id
  order by r.id desc;
$$;


ALTER FUNCTION "public"."get_box_pack_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_packaging_units"() RETURNS TABLE("id" integer, "code" "text", "name" "text", "unit_type" "text", "packaging_type" "text", "net_weight_kg" numeric, "length_mm" integer, "width_mm" integer, "height_mm" integer, "operational_product_id" integer, "is_active" boolean, "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    pu.id,
    pu.code,
    pu.name,
    pu.unit_type,
    pu.packaging_type,
    pu.net_weight_kg,
    pu.length_mm,
    pu.width_mm,
    pu.height_mm,
    pu.operational_product_id,
    pu.is_active,
    pu.created_at
  from public.packaging_units pu
  order by pu.code;
$$;


ALTER FUNCTION "public"."get_packaging_units"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_supplier_countries"() RETURNS TABLE("country" "text")
    LANGUAGE "sql" STABLE
    AS $$
  select distinct s.country
  from public.suppliers s
  where s.country is not null and btrim(s.country) <> ''
  order by s.country;
$$;


ALTER FUNCTION "public"."get_supplier_countries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_supplier_detail"("p_supplier_id" integer) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select jsonb_build_object(
    'supplier', to_jsonb(s),
    'documents',
      coalesce(
        (
          select jsonb_agg(d order by d.uploaded_at desc)
          from public.documents d
          where d.owner_type = 'supplier' and d.owner_id = s.id
        ),
        '[]'::jsonb
      )
  )
  from public.suppliers s
  where s.id = p_supplier_id;
$$;


ALTER FUNCTION "public"."get_supplier_detail"("p_supplier_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_suppliers_list"("p_search" "text" DEFAULT NULL::"text", "p_type" "text" DEFAULT NULL::"text", "p_country" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 25, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" integer, "name" "text", "supplier_type" "text", "primary_contact_name" "text", "primary_contact_email" "text", "primary_contact_phone" "text", "phone" "text", "email" "text", "country" "text", "address" "text", "created_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  with filtered as (
    select s.*
    from public.suppliers s
    where
      (p_type is null or p_type = '' or s.supplier_type = p_type)
      and (p_country is null or p_country = '' or s.country = p_country)
      and (
        p_search is null or p_search = '' or (
          s.name ilike '%' || p_search || '%'
          or s.email ilike '%' || p_search || '%'
          or s.phone ilike '%' || p_search || '%'
          or s.primary_contact_name ilike '%' || p_search || '%'
          or s.primary_contact_email ilike '%' || p_search || '%'
          or s.primary_contact_phone ilike '%' || p_search || '%'
          or s.address ilike '%' || p_search || '%'
        )
      )
  )
  select
    id,
    name,
    supplier_type,
    primary_contact_name,
    primary_contact_email,
    primary_contact_phone,
    phone,
    email,
    country,
    address,
    created_at,
    count(*) over() as total_count
  from filtered
  order by created_at desc
  limit p_limit offset p_offset;
$$;


ALTER FUNCTION "public"."get_suppliers_list"("p_search" "text", "p_type" "text", "p_country" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_packaging_remainder_usage_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  source_remainder numeric;
  already_consumed numeric;
  candidate_consumed numeric;
begin
  select coalesce(pe.remainder_kg, 0)
  into source_remainder
  from public.process_packaging_pack_entries pe
  where pe.id = new.source_pack_entry_id;

  if source_remainder <= 0 then
    raise exception 'Source pack entry % has no remainder available', new.source_pack_entry_id;
  end if;

  select coalesce(sum(u.quantity_kg), 0)
  into already_consumed
  from public.process_packaging_remainder_usages u
  where u.source_pack_entry_id = new.source_pack_entry_id
    and (tg_op <> 'UPDATE' or u.id <> old.id);

  candidate_consumed := already_consumed + coalesce(new.quantity_kg, 0);
  if candidate_consumed > source_remainder then
    raise exception 'Remainder over-consumed for source entry % (used %, source %)',
      new.source_pack_entry_id, candidate_consumed, source_remainder;
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."guard_packaging_remainder_usage_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_packaging_storage_allocation_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  shipped_units integer;
begin
  select coalesce(sum(spi.units_count), 0)::integer
  into shipped_units
  from public.shipment_pack_items spi
  join public.shipments s on s.id = spi.shipment_id
  where spi.packaging_allocation_id = old.id
    and s.doc_status <> 'CANCELLED';

  if tg_op = 'DELETE' then
    if shipped_units > 0 then
      raise exception 'Cannot delete allocation %, % units already shipped', old.id, shipped_units;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.units_count < shipped_units then
      raise exception 'Cannot reduce units_count below shipped units (%). Allocation %', shipped_units, old.id;
    end if;
    return new;
  end if;

  return coalesce(new, old);
end
$$;


ALTER FUNCTION "public"."guard_packaging_storage_allocation_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_shipment_pack_item_units"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  allocation_units integer;
  consumed_other integer;
  next_units integer;
begin
  if new.packaging_allocation_id is null then
    return new;
  end if;

  next_units := coalesce(new.units_count, 0);
  if next_units <= 0 then
    raise exception 'units_count must be > 0 when packaging_allocation_id is set';
  end if;

  select units_count into allocation_units
  from public.process_packaging_storage_allocations
  where id = new.packaging_allocation_id;

  if allocation_units is null then
    raise exception 'Packaging allocation % not found', new.packaging_allocation_id;
  end if;

  select coalesce(sum(spi.units_count), 0)::integer
  into consumed_other
  from public.shipment_pack_items spi
  join public.shipments s on s.id = spi.shipment_id
  where spi.packaging_allocation_id = new.packaging_allocation_id
    and s.doc_status <> 'CANCELLED'
    and (tg_op <> 'UPDATE' or spi.id <> old.id);

  if next_units > (allocation_units - consumed_other) then
    raise exception 'Requested units (%) exceed allocation remaining units (%)',
      next_units, (allocation_units - consumed_other);
  end if;

  return new;
end
$$;


ALTER FUNCTION "public"."guard_shipment_pack_item_units"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_process_lot_run_steps"("lot_run_id" bigint) RETURNS TABLE("migrated_count" integer, "skipped_count" integer, "errors" "text"[])
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  step_progress_data jsonb;
  step_item jsonb;
  step_run_id bigint;
  process_step_record record;
  user_record record;
  migrated integer := 0;
  skipped integer := 0;
  error_list text[] := ARRAY[]::text[];
  step_id_val integer;
  step_seq_val integer;
BEGIN
  -- Get the step_progress JSONB for this lot run
  SELECT step_progress INTO step_progress_data
  FROM process_lot_runs
  WHERE id = lot_run_id;

  -- Skip if no step_progress data exists
  IF step_progress_data IS NULL OR jsonb_array_length(step_progress_data) = 0 THEN
    RETURN QUERY SELECT 0::integer, 0::integer, ARRAY[]::text[];
    RETURN;
  END IF;

  -- Loop through each step in the JSONB array
  FOR step_item IN SELECT * FROM jsonb_array_elements(step_progress_data)
  LOOP
    BEGIN
      -- Extract step_id and seq from JSONB
      step_id_val := (step_item->>'step_id')::integer;
      step_seq_val := COALESCE((step_item->>'seq')::integer, 0);

      -- Find the corresponding process_step record
      SELECT ps.* INTO process_step_record
      FROM process_steps ps
      INNER JOIN process_lot_runs plr ON ps.process_id = plr.process_id
      WHERE plr.id = lot_run_id
        AND (ps.id = step_id_val OR ps.seq = step_seq_val)
      ORDER BY 
        CASE WHEN ps.id = step_id_val THEN 0 ELSE 1 END,
        ps.seq
      LIMIT 1;

      -- Skip if process_step not found
      IF process_step_record IS NULL THEN
        skipped := skipped + 1;
        error_list := array_append(error_list, format('Step ID %s (seq %s) not found', step_id_val, step_seq_val));
        CONTINUE;
      END IF;

      -- Try to find user by operator name/email (if operator field exists)
      -- This is a best-effort lookup - may not always find a match
      IF step_item->>'operator' IS NOT NULL THEN
        SELECT id INTO user_record
        FROM auth.users
        WHERE 
          user_metadata->>'full_name' = step_item->>'operator'
          OR email = step_item->>'operator'
        LIMIT 1;
      END IF;

      -- Insert process_step_run record
      INSERT INTO process_step_runs (
        process_lot_run_id,
        process_step_id,
        status,
        started_at,
        completed_at,
        performed_by,
        notes
      )
      VALUES (
        lot_run_id,
        process_step_record.id,
        COALESCE(
          CASE 
            WHEN step_item->>'status' IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED') 
            THEN (step_item->>'status')::text
            ELSE 'PENDING'
          END,
          'PENDING'
        ),
        CASE 
          WHEN step_item->>'started_at' IS NOT NULL AND step_item->>'started_at' != '' 
          THEN (step_item->>'started_at')::timestamptz
          ELSE NULL
        END,
        CASE 
          WHEN step_item->>'completed_at' IS NOT NULL AND step_item->>'completed_at' != '' 
          THEN (step_item->>'completed_at')::timestamptz
          ELSE NULL
        END,
        user_record.id,
        step_item->>'notes'
      )
      RETURNING id INTO step_run_id;

      migrated := migrated + 1;

    EXCEPTION WHEN OTHERS THEN
      skipped := skipped + 1;
      error_list := array_append(error_list, format('Error migrating step: %s', SQLERRM));
    END;
  END LOOP;

  RETURN QUERY SELECT migrated, skipped, error_list;
END;
$$;


ALTER FUNCTION "public"."migrate_process_lot_run_steps"("lot_run_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_shipment_doc_no"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  next_val bigint;
begin
  select nextval('public.shipments_doc_seq') into next_val;
  return format('SHIP-%s-%04s', extract(year from now())::int, next_val);
end;
$$;


ALTER FUNCTION "public"."next_shipment_doc_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_supply_doc_no"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  next_val bigint;
begin
  select nextval('public.supplies_doc_seq') into next_val;
  return format('SUP-%s-%04s', extract(year from now())::int, next_val);
end;
$$;


ALTER FUNCTION "public"."next_supply_doc_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_allocation_movement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  shipment record;
  item record;
begin
  select si.*, s.warehouse_id, s.doc_no, s.created_by
    into item
    from public.shipment_items si
    join public.shipments s on s.id = si.shipment_id
   where si.id = new.shipment_item_id;

  if item.id is null then
    raise exception 'Shipment item % not found', new.shipment_item_id;
  end if;

  insert into public.inventory_movements (
    product_id,
    warehouse_id,
    lot_id,
    movement,
    qty,
    unit_id,
    source_type,
    source_id,
    reference,
    performed_by
  ) values (
    item.product_id,
    item.warehouse_id,
    new.lot_id,
    'ALLOCATION',
    new.allocated_qty,
    item.unit_id,
    'shipment',
    item.shipment_id,
    item.doc_no,
    item.created_by
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."post_allocation_movement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."product_components_type_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  parent_type text;
  component_type text;
begin
  select upper(product_type) into parent_type from public.products where id = new.parent_product_id;
  select upper(product_type) into component_type from public.products where id = new.component_product_id;

  if parent_type = 'WIP' and component_type <> 'RAW' then
    raise exception 'WIP products must be composed of RAW materials';
  end if;

  if parent_type = 'FINISHED' and component_type <> 'WIP' then
    raise exception 'FINISHED products must be composed of WIP products';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."product_components_type_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_batch"("p_supplier_id" bigint, "p_warehouse_id" bigint, "p_doc_no" "text", "p_product_id" bigint, "p_unit_id" bigint, "p_lot_no" "text", "p_received_qty" numeric, "p_received_units" integer DEFAULT NULL::integer, "p_received_at" timestamp with time zone DEFAULT "now"()) RETURNS bigint
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_supply_id bigint;
  v_batch_id bigint;
BEGIN
  INSERT INTO public.supplies (supplier_id, warehouse_id, doc_no, received_at, doc_status)
  VALUES (p_supplier_id, p_warehouse_id, p_doc_no, p_received_at, 'RECEIVED')
  RETURNING id INTO v_supply_id;

  INSERT INTO public.supply_batches (supply_id, product_id, unit_id, lot_no, received_qty, received_units, accepted_qty, current_qty, created_at)
  VALUES (v_supply_id, p_product_id, p_unit_id, p_lot_no, p_received_qty, p_received_units, 0, 0, now())
  RETURNING id INTO v_batch_id;

  INSERT INTO public.chain_events (event_time, event_type, ref_table, ref_id, product_id, batch_id, metadata)
  VALUES (p_received_at, 'RECEIVED', 'public.supplies', v_supply_id, p_product_id, v_batch_id, jsonb_build_object('doc_no', p_doc_no, 'received_qty', p_received_qty));

  RETURN v_batch_id;
END;
$$;


ALTER FUNCTION "public"."receive_batch"("p_supplier_id" bigint, "p_warehouse_id" bigint, "p_doc_no" "text", "p_product_id" bigint, "p_unit_id" bigint, "p_lot_no" "text", "p_received_qty" numeric, "p_received_units" integer, "p_received_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_box_pack_rule_active"("p_id" integer, "p_is_active" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.box_pack_rules
  set is_active = p_is_active
  where id = p_id;
  return true;
end;
$$;


ALTER FUNCTION "public"."set_box_pack_rule_active"("p_id" integer, "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_timestamp_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_current_timestamp_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_packaging_unit_active"("p_id" integer, "p_is_active" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.packaging_units
  set is_active = p_is_active
  where id = p_id;
  return true;
end;
$$;


ALTER FUNCTION "public"."set_packaging_unit_active"("p_id" integer, "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_supply_payment_updated_by"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_by = auth.uid();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_supply_payment_updated_by"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_box_pack_rule"("p_id" integer, "p_box_unit_id" integer, "p_packet_unit_id" integer, "p_packets_per_box" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id integer;
begin
  if p_id is null then
    insert into public.box_pack_rules (box_unit_id, packet_unit_id, packets_per_box)
    values (p_box_unit_id, p_packet_unit_id, p_packets_per_box)
    returning id into v_id;
  else
    update public.box_pack_rules
    set
      box_unit_id = p_box_unit_id,
      packet_unit_id = p_packet_unit_id,
      packets_per_box = p_packets_per_box
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."upsert_box_pack_rule"("p_id" integer, "p_box_unit_id" integer, "p_packet_unit_id" integer, "p_packets_per_box" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_packaging_unit"("p_id" integer, "p_code" "text", "p_name" "text", "p_unit_type" "text", "p_packaging_type" "text", "p_net_weight_kg" numeric, "p_length_mm" integer, "p_width_mm" integer, "p_height_mm" integer, "p_operational_product_id" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id integer;
  v_operational_product_id integer;
begin
  v_operational_product_id := case
    when p_unit_type = 'PACKET' then p_operational_product_id
    else null
  end;

  if p_id is null then
    insert into public.packaging_units (
      code,
      name,
      unit_type,
      packaging_type,
      net_weight_kg,
      length_mm,
      width_mm,
      height_mm,
      operational_product_id
    )
    values (
      p_code,
      p_name,
      p_unit_type,
      p_packaging_type,
      p_net_weight_kg,
      p_length_mm,
      p_width_mm,
      p_height_mm,
      v_operational_product_id
    )
    returning id into v_id;
  else
    update public.packaging_units
    set
      code = p_code,
      name = p_name,
      unit_type = p_unit_type,
      packaging_type = p_packaging_type,
      net_weight_kg = p_net_weight_kg,
      length_mm = p_length_mm,
      width_mm = p_width_mm,
      height_mm = p_height_mm,
      operational_product_id = v_operational_product_id
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."upsert_packaging_unit"("p_id" integer, "p_code" "text", "p_name" "text", "p_unit_type" "text", "p_packaging_type" "text", "p_net_weight_kg" numeric, "p_length_mm" integer, "p_width_mm" integer, "p_height_mm" integer, "p_operational_product_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_stock_level"("p_product_id" integer, "p_warehouse_id" integer, "p_lot_id" bigint, "p_on_hand_delta" numeric, "p_allocated_delta" numeric, "p_quality_delta" numeric, "p_transit_delta" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  loop
    update public.stock_levels
       set on_hand = coalesce(on_hand,0) + coalesce(p_on_hand_delta,0),
           allocated = coalesce(allocated,0) + coalesce(p_allocated_delta,0),
           quality_hold = coalesce(quality_hold,0) + coalesce(p_quality_delta,0),
           in_transit = coalesce(in_transit,0) + coalesce(p_transit_delta,0)
     where product_id = p_product_id
       and warehouse_id = p_warehouse_id
       and ( (lot_id is null and p_lot_id is null) or lot_id = p_lot_id );
    if found then
      exit;
    end if;

    begin
      insert into public.stock_levels (
        product_id, warehouse_id, lot_id,
        on_hand, allocated, quality_hold, in_transit
      )
      values (
        p_product_id, p_warehouse_id, p_lot_id,
        coalesce(p_on_hand_delta,0),
        coalesce(p_allocated_delta,0),
        coalesce(p_quality_delta,0),
        coalesce(p_transit_delta,0)
      );
      exit;
    exception when unique_violation then
      -- retry
    end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."upsert_stock_level"("p_product_id" integer, "p_warehouse_id" integer, "p_lot_id" bigint, "p_on_hand_delta" numeric, "p_allocated_delta" numeric, "p_quality_delta" numeric, "p_transit_delta" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_document_expiry"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  requires_expiry boolean;
BEGIN
  SELECT has_expiry_date
  INTO requires_expiry
  FROM public.document_types
  WHERE code = NEW.document_type_code;

  IF requires_expiry AND NEW.expiry_date IS NULL THEN
    RAISE EXCEPTION
      'Document type % requires an expiry date',
      NEW.document_type_code;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_document_expiry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_operational_supply_entry_supply_category"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_category text;
begin
  select category_code into v_category
  from public.supplies
  where id = new.supply_id;

  if v_category is distinct from 'SERVICE' then
    raise exception
      'Operational supply entry requires supplies.category_code=SERVICE. supply_id=% category=%',
      new.supply_id,
      coalesce(v_category, 'NULL');
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_operational_supply_entry_supply_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_packaging_unit_operational_product_type"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_product_type text;
begin
  if new.unit_type <> 'PACKET' then
    return new;
  end if;

  select p.product_type
  into v_product_type
  from public.products p
  where p.id = new.operational_product_id;

  if v_product_type is distinct from 'OP' then
    raise exception 'Packaging packet units must map to OP products. product_id=% type=%',
      new.operational_product_id,
      coalesce(v_product_type, 'NULL');
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_packaging_unit_operational_product_type"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_schema" "text" DEFAULT 'public'::"text" NOT NULL,
    "table_name" "text" NOT NULL,
    "operation" "text" NOT NULL,
    "changed_by" "uuid",
    "change_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "primary_key" "jsonb",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "change_summary" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "audit_logs_operation_check" CHECK (("operation" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"])))
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."batch_step_transitions" (
    "id" bigint NOT NULL,
    "manufacturing_batch_id" bigint NOT NULL,
    "from_step" "text",
    "to_step" "text" NOT NULL,
    "reason" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."batch_step_transitions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."batch_step_transitions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."batch_step_transitions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."batch_step_transitions_id_seq" OWNED BY "public"."batch_step_transitions"."id";



CREATE TABLE IF NOT EXISTS "public"."box_pack_rules" (
    "id" integer NOT NULL,
    "box_unit_id" integer NOT NULL,
    "packet_unit_id" integer NOT NULL,
    "packets_per_box" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "box_pack_rules_packets_per_box_check" CHECK (("packets_per_box" > 0))
);


ALTER TABLE "public"."box_pack_rules" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."box_pack_rules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."box_pack_rules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."box_pack_rules_id_seq" OWNED BY "public"."box_pack_rules"."id";



CREATE TABLE IF NOT EXISTS "public"."carriers" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."carriers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."carriers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."carriers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."carriers_id_seq" OWNED BY "public"."carriers"."id";



CREATE TABLE IF NOT EXISTS "public"."customer_contacts" (
    "id" integer NOT NULL,
    "customer_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_contacts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."customer_contacts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."customer_contacts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."customer_contacts_id_seq" OWNED BY "public"."customer_contacts"."id";



CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "billing_address" "text",
    "shipping_address" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "country" "text"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."customers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."customers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."customers_id_seq" OWNED BY "public"."customers"."id";



CREATE TABLE IF NOT EXISTS "public"."cycle_count_lines" (
    "id" bigint NOT NULL,
    "cycle_count_id" bigint NOT NULL,
    "product_id" integer NOT NULL,
    "lot_id" bigint,
    "counted_qty" numeric,
    "variance_qty" numeric,
    "unit_id" integer,
    "notes" "text"
);


ALTER TABLE "public"."cycle_count_lines" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cycle_count_lines_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cycle_count_lines_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cycle_count_lines_id_seq" OWNED BY "public"."cycle_count_lines"."id";



CREATE TABLE IF NOT EXISTS "public"."cycle_counts" (
    "id" bigint NOT NULL,
    "warehouse_id" integer NOT NULL,
    "scheduled_for" "date" NOT NULL,
    "status" "text" DEFAULT 'SCHEDULED'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cycle_counts_status_check" CHECK (("status" = ANY (ARRAY['SCHEDULED'::"text", 'IN_PROGRESS'::"text", 'COMPLETED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."cycle_counts" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cycle_counts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cycle_counts_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cycle_counts_id_seq" OWNED BY "public"."cycle_counts"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_checks" (
    "id" bigint NOT NULL,
    "check_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "category" "text" NOT NULL,
    "item_key" "text" NOT NULL,
    "item_name" "text" NOT NULL,
    "note" "text",
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "completed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_checks_completed_consistency" CHECK (((("completed" = false) AND ("completed_at" IS NULL)) OR (("completed" = true) AND ("completed_at" IS NOT NULL))))
);


ALTER TABLE "public"."daily_checks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."daily_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."daily_checks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_checks_id_seq" OWNED BY "public"."daily_checks"."id";



CREATE TABLE IF NOT EXISTS "public"."document_types" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "has_expiry_date" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."document_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" bigint NOT NULL,
    "owner_type" "text" NOT NULL,
    "owner_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "doc_type" "text",
    "storage_path" "text" NOT NULL,
    "uploaded_by" "uuid",
    "uploaded_at" timestamp with time zone DEFAULT "now"(),
    "expiry_date" "date",
    "document_type_code" "text" NOT NULL,
    CONSTRAINT "documents_owner_type_check" CHECK (("owner_type" = ANY (ARRAY['supply'::"text", 'shipment'::"text", 'supplier'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."documents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."documents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."documents_id_seq" OWNED BY "public"."documents"."id";



CREATE TABLE IF NOT EXISTS "public"."inventory_adjustments" (
    "id" bigint NOT NULL,
    "product_id" integer NOT NULL,
    "warehouse_id" integer NOT NULL,
    "lot_id" bigint,
    "reason" "text" NOT NULL,
    "qty" numeric NOT NULL,
    "unit_id" integer,
    "note" "text",
    "adjusted_by" "uuid",
    "adjusted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_adjustments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."inventory_adjustments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."inventory_adjustments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inventory_adjustments_id_seq" OWNED BY "public"."inventory_adjustments"."id";



CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" bigint NOT NULL,
    "product_id" integer NOT NULL,
    "warehouse_id" integer NOT NULL,
    "lot_id" bigint,
    "movement" "public"."movement_type" NOT NULL,
    "qty" numeric NOT NULL,
    "unit_id" integer,
    "source_type" "text",
    "source_id" bigint,
    "reference" "text",
    "performed_by" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_movements_source_type_check" CHECK (("source_type" = ANY (ARRAY['supply'::"text", 'shipment'::"text", 'adjustment'::"text", 'count'::"text"])))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."inventory_movements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."inventory_movements_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."inventory_movements_id_seq" OWNED BY "public"."inventory_movements"."id";



CREATE TABLE IF NOT EXISTS "public"."metal_detector_check_sessions" (
    "id" bigint NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "stopped_at" timestamp with time zone,
    "started_by" "uuid",
    "stopped_by" "uuid",
    "started_from_process_lot_run_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "metal_detector_check_sessions_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'STOPPED'::"text", 'EXPIRED'::"text"])))
);


ALTER TABLE "public"."metal_detector_check_sessions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."metal_detector_check_sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."metal_detector_check_sessions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."metal_detector_check_sessions_id_seq" OWNED BY "public"."metal_detector_check_sessions"."id";



CREATE TABLE IF NOT EXISTS "public"."metal_detector_hourly_checks" (
    "id" bigint NOT NULL,
    "check_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "check_hour" time without time zone NOT NULL,
    "fe_1_5mm" "text" NOT NULL,
    "non_fe_1_5mm" "text" NOT NULL,
    "ss_1_5mm" "text" NOT NULL,
    "remarks" "text",
    "corrective_action" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "checked_by" "uuid",
    "checked_at" timestamp with time zone,
    CONSTRAINT "metal_detector_hour_slot_chk" CHECK ((((EXTRACT(hour FROM "check_hour") >= (8)::numeric) AND (EXTRACT(hour FROM "check_hour") <= (17)::numeric)) AND (EXTRACT(minute FROM "check_hour") = (0)::numeric) AND (EXTRACT(second FROM "check_hour") = (0)::numeric))),
    CONSTRAINT "metal_detector_hourly_checks_fe_1_5mm_check" CHECK (("fe_1_5mm" = ANY (ARRAY['Yes'::"text", 'No'::"text"]))),
    CONSTRAINT "metal_detector_hourly_checks_non_fe_1_5mm_check" CHECK (("non_fe_1_5mm" = ANY (ARRAY['Yes'::"text", 'No'::"text"]))),
    CONSTRAINT "metal_detector_hourly_checks_ss_1_5mm_check" CHECK (("ss_1_5mm" = ANY (ARRAY['Yes'::"text", 'No'::"text"])))
);


ALTER TABLE "public"."metal_detector_hourly_checks" OWNER TO "postgres";


ALTER TABLE "public"."metal_detector_hourly_checks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."metal_detector_hourly_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."operational_supply_entries" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "delivery_reference" "text" NOT NULL,
    "received_condition" "text" NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operational_supply_entries_received_condition_check" CHECK (("received_condition" = ANY (ARRAY['PASS'::"text", 'HOLD'::"text", 'REJECT'::"text"])))
);


ALTER TABLE "public"."operational_supply_entries" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."operational_supply_entries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."operational_supply_entries_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."operational_supply_entries_id_seq" OWNED BY "public"."operational_supply_entries"."id";



CREATE TABLE IF NOT EXISTS "public"."packaging_quality_parameters" (
    "id" integer NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "input_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "packaging_quality_parameters_input_type_check" CHECK (("input_type" = ANY (ARRAY['YES_NO_NA'::"text", 'NUMERIC'::"text", 'GOOD_BAD_NA'::"text"])))
);


ALTER TABLE "public"."packaging_quality_parameters" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."packaging_quality_parameters_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."packaging_quality_parameters_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."packaging_quality_parameters_id_seq" OWNED BY "public"."packaging_quality_parameters"."id";



CREATE TABLE IF NOT EXISTS "public"."packaging_units" (
    "id" integer NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "unit_type" "text" NOT NULL,
    "packaging_type" "text",
    "net_weight_kg" numeric(10,3),
    "length_mm" integer,
    "width_mm" integer,
    "height_mm" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operational_product_id" integer,
    CONSTRAINT "packaging_units_packaging_type_check" CHECK (("packaging_type" = ANY (ARRAY['DOY'::"text", 'VACUUM'::"text", 'POLY'::"text", 'BOX'::"text"]))),
    CONSTRAINT "packaging_units_unit_type_check" CHECK (("unit_type" = ANY (ARRAY['PACKET'::"text", 'BOX'::"text"]))),
    CONSTRAINT "packet_net_weight_required_chk" CHECK (((("unit_type" = 'PACKET'::"text") AND ("net_weight_kg" IS NOT NULL)) OR ("unit_type" = 'BOX'::"text")))
);


ALTER TABLE "public"."packaging_units" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."packaging_units_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."packaging_units_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."packaging_units_id_seq" OWNED BY "public"."packaging_units"."id";



CREATE TABLE IF NOT EXISTS "public"."process_drying_runs" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "dryer_temperature_c" numeric,
    "time_in" timestamp with time zone,
    "time_out" timestamp with time zone,
    "moisture_in" numeric,
    "moisture_out" numeric,
    "crates_clean" "text",
    "insect_infestation" "text",
    "dryer_hygiene_clean" "text",
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "process_drying_runs_crates_clean_check" CHECK ((("crates_clean" IS NULL) OR ("crates_clean" = ANY (ARRAY['Yes'::"text", 'No'::"text", 'NA'::"text"])))),
    CONSTRAINT "process_drying_runs_dryer_hygiene_clean_check" CHECK ((("dryer_hygiene_clean" IS NULL) OR ("dryer_hygiene_clean" = ANY (ARRAY['Yes'::"text", 'No'::"text", 'NA'::"text"])))),
    CONSTRAINT "process_drying_runs_insect_infestation_check" CHECK ((("insect_infestation" IS NULL) OR ("insect_infestation" = ANY (ARRAY['Yes'::"text", 'No'::"text", 'NA'::"text"]))))
);


ALTER TABLE "public"."process_drying_runs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_drying_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_drying_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_drying_runs_id_seq" OWNED BY "public"."process_drying_runs"."id";



CREATE TABLE IF NOT EXISTS "public"."process_drying_waste" (
    "id" bigint NOT NULL,
    "drying_run_id" bigint NOT NULL,
    "waste_type" "text" NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_drying_waste" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_drying_waste_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_drying_waste_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_drying_waste_id_seq" OWNED BY "public"."process_drying_waste"."id";



CREATE TABLE IF NOT EXISTS "public"."process_foreign_object_rejections" (
    "id" bigint NOT NULL,
    "session_id" bigint NOT NULL,
    "rejection_time" timestamp with time zone NOT NULL,
    "object_type" "text" NOT NULL,
    "weight" numeric,
    "corrective_action" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_foreign_object_rejections" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_foreign_object_rejections_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_foreign_object_rejections_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_foreign_object_rejections_id_seq" OWNED BY "public"."process_foreign_object_rejections"."id";



CREATE TABLE IF NOT EXISTS "public"."process_lot_run_batches" (
    "id" bigint NOT NULL,
    "process_lot_run_id" bigint NOT NULL,
    "supply_batch_id" bigint NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_lot_run_batches" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_lot_run_batches_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_lot_run_batches_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_lot_run_batches_id_seq" OWNED BY "public"."process_lot_run_batches"."id";



CREATE TABLE IF NOT EXISTS "public"."process_lot_runs" (
    "id" bigint NOT NULL,
    "supply_batch_id" bigint NOT NULL,
    "process_id" bigint NOT NULL,
    "status" "text" DEFAULT 'IN_PROGRESS'::"text" NOT NULL,
    "step_progress" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_rework" boolean DEFAULT false NOT NULL,
    "original_process_lot_run_id" bigint,
    CONSTRAINT "process_lot_runs_status_check" CHECK (("status" = ANY (ARRAY['IN_PROGRESS'::"text", 'COMPLETED'::"text"])))
);


ALTER TABLE "public"."process_lot_runs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."process_lot_runs"."is_rework" IS 'Indicates if this process lot run is for a reworked batch';



COMMENT ON COLUMN "public"."process_lot_runs"."original_process_lot_run_id" IS 'Links rework process runs to their original process lot run';



CREATE SEQUENCE IF NOT EXISTS "public"."process_lot_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_lot_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_lot_runs_id_seq" OWNED BY "public"."process_lot_runs"."id";



CREATE TABLE IF NOT EXISTS "public"."process_measurements" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "metric" "text" NOT NULL,
    "value" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "recorded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."process_measurements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_measurements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_measurements_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_measurements_id_seq" OWNED BY "public"."process_measurements"."id";



CREATE TABLE IF NOT EXISTS "public"."process_metal_detector" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_metal_detector" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_metal_detector_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_metal_detector_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_metal_detector_id_seq" OWNED BY "public"."process_metal_detector"."id";



CREATE TABLE IF NOT EXISTS "public"."process_metal_detector_waste" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "waste_type" "text" NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_metal_detector_waste" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_metal_detector_waste_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_metal_detector_waste_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_metal_detector_waste_id_seq" OWNED BY "public"."process_metal_detector_waste"."id";



CREATE TABLE IF NOT EXISTS "public"."process_non_conformances" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "nc_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "corrective_action" "text",
    "resolved" boolean DEFAULT false,
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."process_non_conformances" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_non_conformances_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_non_conformances_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_non_conformances_id_seq" OWNED BY "public"."process_non_conformances"."id";



CREATE TABLE IF NOT EXISTS "public"."process_packaging_metal_check_rejections" (
    "id" bigint NOT NULL,
    "metal_check_id" bigint NOT NULL,
    "object_type" "text" NOT NULL,
    "weight_kg" numeric NOT NULL,
    "corrective_action" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "process_packaging_metal_check_rejections_weight_kg_check" CHECK (("weight_kg" > (0)::numeric))
);


ALTER TABLE "public"."process_packaging_metal_check_rejections" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_packaging_metal_check_rejections_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_packaging_metal_check_rejections_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_packaging_metal_check_rejections_id_seq" OWNED BY "public"."process_packaging_metal_check_rejections"."id";



CREATE TABLE IF NOT EXISTS "public"."process_packaging_metal_checks" (
    "id" bigint NOT NULL,
    "packaging_run_id" bigint NOT NULL,
    "sorting_output_id" bigint NOT NULL,
    "attempt_no" integer NOT NULL,
    "status" "text" NOT NULL,
    "remarks" "text",
    "checked_by" "uuid",
    "checked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "process_packaging_metal_checks_attempt_no_check" CHECK (("attempt_no" > 0)),
    CONSTRAINT "process_packaging_metal_checks_status_check" CHECK (("status" = ANY (ARRAY['PASS'::"text", 'FAIL'::"text"])))
);


ALTER TABLE "public"."process_packaging_metal_checks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_packaging_metal_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_packaging_metal_checks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_packaging_metal_checks_id_seq" OWNED BY "public"."process_packaging_metal_checks"."id";



CREATE TABLE IF NOT EXISTS "public"."process_packaging_pack_entries" (
    "id" bigint NOT NULL,
    "packaging_run_id" bigint NOT NULL,
    "sorting_output_id" bigint NOT NULL,
    "pack_identifier" "text" NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_id" bigint,
    "packing_type" "text",
    "pack_size_kg" numeric,
    "pack_count" integer GENERATED ALWAYS AS (
CASE
    WHEN (("pack_size_kg" IS NULL) OR ("pack_size_kg" = (0)::numeric)) THEN NULL::numeric
    ELSE "floor"(("quantity_kg" / "pack_size_kg"))
END) STORED,
    "remainder_kg" numeric GENERATED ALWAYS AS (
CASE
    WHEN (("pack_size_kg" IS NULL) OR ("pack_size_kg" = (0)::numeric)) THEN NULL::numeric
    ELSE ("quantity_kg" - ("floor"(("quantity_kg" / "pack_size_kg")) * "pack_size_kg"))
END) STORED,
    "metal_check_status" "text",
    "metal_check_attempts" integer DEFAULT 0 NOT NULL,
    "metal_check_last_id" bigint,
    "metal_check_last_checked_at" timestamp with time zone,
    "metal_check_last_checked_by" "uuid",
    "packet_unit_code" "text",
    CONSTRAINT "process_packaging_pack_entries_metal_check_status_check" CHECK ((("metal_check_status" IS NULL) OR ("metal_check_status" = ANY (ARRAY['PASS'::"text", 'FAIL'::"text"])))),
    CONSTRAINT "process_packaging_pack_entries_pack_size_kg_check" CHECK ((("pack_size_kg" IS NULL) OR ("pack_size_kg" > (0)::numeric))),
    CONSTRAINT "process_packaging_pack_entries_packing_type_check" CHECK ((("packing_type" IS NULL) OR ("packing_type" = ANY (ARRAY['Vacuum packing'::"text", 'Bag packing'::"text", 'Shop packing'::"text"])))),
    CONSTRAINT "process_packaging_pack_entries_quantity_kg_check" CHECK (("quantity_kg" > (0)::numeric))
);


ALTER TABLE "public"."process_packaging_pack_entries" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_packaging_pack_entries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_packaging_pack_entries_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_packaging_pack_entries_id_seq" OWNED BY "public"."process_packaging_pack_entries"."id";



CREATE TABLE IF NOT EXISTS "public"."process_packaging_photos" (
    "id" bigint NOT NULL,
    "packaging_run_id" bigint NOT NULL,
    "photo_type" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "process_packaging_photos_photo_type_check" CHECK (("photo_type" = ANY (ARRAY['product'::"text", 'label'::"text", 'pallet'::"text"])))
);


ALTER TABLE "public"."process_packaging_photos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_packaging_photos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_packaging_photos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_packaging_photos_id_seq" OWNED BY "public"."process_packaging_photos"."id";



CREATE TABLE IF NOT EXISTS "public"."process_packaging_remainder_usages" (
    "id" bigint NOT NULL,
    "source_pack_entry_id" bigint NOT NULL,
    "consumer_pack_entry_id" bigint NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "process_packaging_remainder_usages_distinct_entries_check" CHECK (("source_pack_entry_id" <> "consumer_pack_entry_id")),
    CONSTRAINT "process_packaging_remainder_usages_quantity_kg_check" CHECK (("quantity_kg" > (0)::numeric))
);


ALTER TABLE "public"."process_packaging_remainder_usages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_packaging_remainder_usages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_packaging_remainder_usages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_packaging_remainder_usages_id_seq" OWNED BY "public"."process_packaging_remainder_usages"."id";



CREATE TABLE IF NOT EXISTS "public"."process_packaging_runs" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "visual_status" "text",
    "rework_destination" "text",
    "pest_status" "text",
    "foreign_object_status" "text",
    "mould_status" "text",
    "damaged_kernels_pct" numeric,
    "insect_damaged_kernels_pct" numeric,
    "nitrogen_used" numeric,
    "nitrogen_batch_number" "text",
    "primary_packaging_type" "text",
    "primary_packaging_batch" "text",
    "secondary_packaging" "text",
    "secondary_packaging_type" "text",
    "secondary_packaging_batch" "text",
    "label_correct" "text",
    "label_legible" "text",
    "pallet_integrity" "text",
    "allergen_swab_result" "text",
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "process_packaging_runs_label_correct_check" CHECK ((("label_correct" IS NULL) OR ("label_correct" = ANY (ARRAY['Yes'::"text", 'No'::"text", 'NA'::"text"])))),
    CONSTRAINT "process_packaging_runs_label_legible_check" CHECK ((("label_legible" IS NULL) OR ("label_legible" = ANY (ARRAY['Yes'::"text", 'No'::"text", 'NA'::"text"])))),
    CONSTRAINT "process_packaging_runs_pallet_integrity_check" CHECK ((("pallet_integrity" IS NULL) OR ("pallet_integrity" = ANY (ARRAY['Yes'::"text", 'No'::"text", 'NA'::"text"]))))
);


ALTER TABLE "public"."process_packaging_runs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_packaging_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_packaging_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_packaging_runs_id_seq" OWNED BY "public"."process_packaging_runs"."id";



CREATE TABLE IF NOT EXISTS "public"."process_packaging_storage_allocations" (
    "id" bigint NOT NULL,
    "packaging_run_id" bigint NOT NULL,
    "pack_entry_id" bigint NOT NULL,
    "storage_type" "text" NOT NULL,
    "units_count" integer NOT NULL,
    "packs_per_unit" integer NOT NULL,
    "total_packs" integer NOT NULL,
    "total_quantity_kg" numeric NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "box_unit_code" "text",
    CONSTRAINT "process_packaging_storage_allocations_packs_per_unit_check" CHECK (("packs_per_unit" > 0)),
    CONSTRAINT "process_packaging_storage_allocations_storage_type_check" CHECK (("storage_type" = ANY (ARRAY['BOX'::"text", 'BAG'::"text", 'SHOP_PACKING'::"text"]))),
    CONSTRAINT "process_packaging_storage_allocations_total_packs_check" CHECK (("total_packs" = ("units_count" * "packs_per_unit"))),
    CONSTRAINT "process_packaging_storage_allocations_total_quantity_kg_check" CHECK (("total_quantity_kg" > (0)::numeric)),
    CONSTRAINT "process_packaging_storage_allocations_units_count_check" CHECK (("units_count" > 0))
);


ALTER TABLE "public"."process_packaging_storage_allocations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_packaging_storage_allocations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_packaging_storage_allocations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_packaging_storage_allocations_id_seq" OWNED BY "public"."process_packaging_storage_allocations"."id";



CREATE TABLE IF NOT EXISTS "public"."process_packaging_waste" (
    "id" bigint NOT NULL,
    "packaging_run_id" bigint NOT NULL,
    "waste_type" "text" NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_packaging_waste" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_packaging_waste_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_packaging_waste_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_packaging_waste_id_seq" OWNED BY "public"."process_packaging_waste"."id";



CREATE TABLE IF NOT EXISTS "public"."process_packaging_weight_checks" (
    "id" bigint NOT NULL,
    "packaging_run_id" bigint NOT NULL,
    "check_no" integer NOT NULL,
    "weight_kg" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "process_packaging_weight_checks_check_no_check" CHECK ((("check_no" >= 1) AND ("check_no" <= 4)))
);


ALTER TABLE "public"."process_packaging_weight_checks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_packaging_weight_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_packaging_weight_checks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_packaging_weight_checks_id_seq" OWNED BY "public"."process_packaging_weight_checks"."id";



CREATE TABLE IF NOT EXISTS "public"."process_qc_checks" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "check_type" "text" NOT NULL,
    "result" "text" NOT NULL,
    "allergen_detected" "text",
    "corrective_action" "text",
    "checked_by" "uuid",
    "checked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."process_qc_checks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_qc_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_qc_checks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_qc_checks_id_seq" OWNED BY "public"."process_qc_checks"."id";



CREATE TABLE IF NOT EXISTS "public"."process_quality_parameters" (
    "id" bigint NOT NULL,
    "process_id" bigint NOT NULL,
    "quality_parameter_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_quality_parameters" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_quality_parameters_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_quality_parameters_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_quality_parameters_id_seq" OWNED BY "public"."process_quality_parameters"."id";



CREATE TABLE IF NOT EXISTS "public"."process_signoffs" (
    "id" bigint NOT NULL,
    "process_lot_run_id" bigint NOT NULL,
    "role" "text" NOT NULL,
    "signed_by" "uuid" NOT NULL,
    "signed_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."process_signoffs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_signoffs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_signoffs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_signoffs_id_seq" OWNED BY "public"."process_signoffs"."id";



CREATE TABLE IF NOT EXISTS "public"."process_sorting_outputs" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "product_id" integer NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "moisture_percent" numeric,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_sorting_outputs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_sorting_outputs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_sorting_outputs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_sorting_outputs_id_seq" OWNED BY "public"."process_sorting_outputs"."id";



CREATE TABLE IF NOT EXISTS "public"."process_sorting_waste" (
    "id" bigint NOT NULL,
    "sorting_run_id" bigint NOT NULL,
    "waste_type" "text" NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_sorting_waste" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_sorting_waste_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_sorting_waste_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_sorting_waste_id_seq" OWNED BY "public"."process_sorting_waste"."id";



CREATE TABLE IF NOT EXISTS "public"."process_step_names" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_step_names" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_step_names_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_step_names_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_step_names_id_seq" OWNED BY "public"."process_step_names"."id";



CREATE TABLE IF NOT EXISTS "public"."process_step_quality_check_items" (
    "id" bigint NOT NULL,
    "quality_check_id" bigint NOT NULL,
    "parameter_id" integer NOT NULL,
    "score" integer NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "results" "text",
    CONSTRAINT "process_step_quality_check_items_score_check" CHECK ((("score" >= 1) AND ("score" <= 4)))
);


ALTER TABLE "public"."process_step_quality_check_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_step_quality_check_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_step_quality_check_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_step_quality_check_items_id_seq" OWNED BY "public"."process_step_quality_check_items"."id";



CREATE TABLE IF NOT EXISTS "public"."process_step_quality_checks" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "status" "text" NOT NULL,
    "overall_score" numeric(4,2),
    "remarks" "text",
    "evaluated_by" "uuid",
    "evaluated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "process_step_quality_checks_status_check" CHECK (("status" = ANY (ARRAY['PASS'::"text", 'FAIL'::"text", 'PENDING'::"text"])))
);


ALTER TABLE "public"."process_step_quality_checks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_step_quality_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_step_quality_checks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_step_quality_checks_id_seq" OWNED BY "public"."process_step_quality_checks"."id";



CREATE TABLE IF NOT EXISTS "public"."process_step_quality_parameters" (
    "id" bigint NOT NULL,
    "process_step_id" bigint NOT NULL,
    "quality_parameter_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_step_quality_parameters" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_step_quality_parameters_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_step_quality_parameters_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_step_quality_parameters_id_seq" OWNED BY "public"."process_step_quality_parameters"."id";



CREATE TABLE IF NOT EXISTS "public"."process_step_runs" (
    "id" bigint NOT NULL,
    "process_lot_run_id" bigint NOT NULL,
    "process_step_id" bigint NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "performed_by" "uuid",
    "location_id" integer,
    "skipped_at" timestamp with time zone,
    "skipped_by" "uuid",
    CONSTRAINT "process_step_runs_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'IN_PROGRESS'::"text", 'COMPLETED'::"text", 'FAILED'::"text", 'SKIPPED'::"text"])))
);


ALTER TABLE "public"."process_step_runs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."process_step_runs"."skipped_at" IS 'Timestamp when the step was skipped';



COMMENT ON COLUMN "public"."process_step_runs"."skipped_by" IS 'User who skipped the step';



CREATE SEQUENCE IF NOT EXISTS "public"."process_step_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_step_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_step_runs_id_seq" OWNED BY "public"."process_step_runs"."id";



CREATE TABLE IF NOT EXISTS "public"."process_steps" (
    "id" bigint NOT NULL,
    "process_id" bigint NOT NULL,
    "seq" integer NOT NULL,
    "description" "text",
    "requires_qc" boolean DEFAULT false NOT NULL,
    "default_location_id" integer,
    "estimated_duration" interval,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_be_skipped" boolean DEFAULT false NOT NULL,
    "step_name_id" bigint NOT NULL
);


ALTER TABLE "public"."process_steps" OWNER TO "postgres";


COMMENT ON COLUMN "public"."process_steps"."can_be_skipped" IS 'Indicates whether this process step can be skipped during execution';



CREATE SEQUENCE IF NOT EXISTS "public"."process_steps_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_steps_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_steps_id_seq" OWNED BY "public"."process_steps"."id";



CREATE TABLE IF NOT EXISTS "public"."process_washing_runs" (
    "id" bigint NOT NULL,
    "process_step_run_id" bigint NOT NULL,
    "washing_water_litres" numeric,
    "oxy_acid_ml" numeric,
    "moisture_percent" numeric,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_washing_runs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_washing_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_washing_runs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_washing_runs_id_seq" OWNED BY "public"."process_washing_runs"."id";



CREATE TABLE IF NOT EXISTS "public"."process_washing_waste" (
    "id" bigint NOT NULL,
    "washing_run_id" bigint NOT NULL,
    "waste_type" "text" NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."process_washing_waste" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."process_washing_waste_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."process_washing_waste_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."process_washing_waste_id_seq" OWNED BY "public"."process_washing_waste"."id";



CREATE TABLE IF NOT EXISTS "public"."processes" (
    "id" bigint NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_ids" integer[] DEFAULT '{}'::integer[] NOT NULL
);


ALTER TABLE "public"."processes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."processes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."processes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."processes_id_seq" OWNED BY "public"."processes"."id";



CREATE TABLE IF NOT EXISTS "public"."product_components" (
    "id" bigint NOT NULL,
    "parent_product_id" bigint NOT NULL,
    "component_product_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_components_no_self" CHECK (("parent_product_id" <> "component_product_id"))
);


ALTER TABLE "public"."product_components" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."product_components_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."product_components_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."product_components_id_seq" OWNED BY "public"."product_components"."id";



CREATE TABLE IF NOT EXISTS "public"."product_processes" (
    "id" bigint NOT NULL,
    "product_id" integer NOT NULL,
    "process_id" bigint NOT NULL,
    "is_default" boolean DEFAULT true NOT NULL,
    "effective_from" "date" DEFAULT CURRENT_DATE,
    "effective_to" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_processes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."product_processes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."product_processes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."product_processes_id_seq" OWNED BY "public"."product_processes"."id";



CREATE TABLE IF NOT EXISTS "public"."production_batches" (
    "id" bigint NOT NULL,
    "process_lot_run_id" bigint NOT NULL,
    "product_id" integer NOT NULL,
    "batch_code" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "expiry_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "supply_batch_id" bigint
);


ALTER TABLE "public"."production_batches" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."production_batches_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."production_batches_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."production_batches_id_seq" OWNED BY "public"."production_batches"."id";



CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" integer NOT NULL,
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "base_unit_id" integer,
    "reorder_point" numeric,
    "safety_stock" numeric,
    "target_stock" numeric,
    "status" "text" DEFAULT 'ACTIVE'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "product_type" "text" DEFAULT 'RAW'::"text",
    CONSTRAINT "products_product_type_check" CHECK (("product_type" = ANY (ARRAY['RAW'::"text", 'WIP'::"text", 'FINISHED'::"text", 'OP'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."products_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."products_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."products_id_seq" OWNED BY "public"."products"."id";



CREATE TABLE IF NOT EXISTS "public"."quality_parameters" (
    "id" integer NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quality_parameters" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."quality_parameters_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."quality_parameters_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."quality_parameters_id_seq" OWNED BY "public"."quality_parameters"."id";



CREATE OR REPLACE VIEW "public"."recent_audit" AS
 SELECT "id",
    "table_schema",
    "table_name",
    "operation",
    "changed_by",
    "change_time",
    "primary_key"
   FROM "public"."audit_logs"
  ORDER BY "change_time" DESC
 LIMIT 100;


ALTER VIEW "public"."recent_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reworked_lots" (
    "id" bigint NOT NULL,
    "original_supply_batch_id" bigint NOT NULL,
    "rework_supply_batch_id" bigint NOT NULL,
    "sorting_output_id" bigint,
    "process_step_run_id" bigint NOT NULL,
    "quantity_kg" numeric NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."reworked_lots" OWNER TO "postgres";


COMMENT ON TABLE "public"."reworked_lots" IS 'Tracks batches that have been reworked, linking them to their original batches';



COMMENT ON COLUMN "public"."reworked_lots"."original_supply_batch_id" IS 'The original supply batch that was reworked';



COMMENT ON COLUMN "public"."reworked_lots"."rework_supply_batch_id" IS 'The new supply batch created for the rework';



COMMENT ON COLUMN "public"."reworked_lots"."sorting_output_id" IS 'The sorting output that triggered the rework';



COMMENT ON COLUMN "public"."reworked_lots"."process_step_run_id" IS 'The sorting step run that created the rework';



CREATE SEQUENCE IF NOT EXISTS "public"."reworked_lots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."reworked_lots_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."reworked_lots_id_seq" OWNED BY "public"."reworked_lots"."id";



CREATE TABLE IF NOT EXISTS "public"."shipment_activities" (
    "id" bigint NOT NULL,
    "shipment_id" bigint NOT NULL,
    "type" "text",
    "description" "text",
    "actor" "uuid",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shipment_activities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."shipment_activities_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."shipment_activities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."shipment_activities_id_seq" OWNED BY "public"."shipment_activities"."id";



CREATE TABLE IF NOT EXISTS "public"."shipment_contacts" (
    "shipment_id" bigint NOT NULL,
    "contact_id" integer NOT NULL
);


ALTER TABLE "public"."shipment_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipment_items" (
    "id" bigint NOT NULL,
    "shipment_id" bigint NOT NULL,
    "product_id" integer NOT NULL,
    "description" "text",
    "requested_qty" numeric,
    "unit_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shipment_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."shipment_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."shipment_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."shipment_items_id_seq" OWNED BY "public"."shipment_items"."id";



CREATE TABLE IF NOT EXISTS "public"."shipment_lot_allocations" (
    "id" bigint NOT NULL,
    "shipment_item_id" bigint NOT NULL,
    "lot_id" bigint NOT NULL,
    "allocated_qty" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shipment_lot_allocations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."shipment_lot_allocations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."shipment_lot_allocations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."shipment_lot_allocations_id_seq" OWNED BY "public"."shipment_lot_allocations"."id";



CREATE TABLE IF NOT EXISTS "public"."shipment_pack_items" (
    "id" bigint NOT NULL,
    "shipment_id" bigint NOT NULL,
    "pack_entry_id" bigint NOT NULL,
    "pack_count" integer NOT NULL,
    "box_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "packaging_allocation_id" bigint,
    "units_count" integer,
    "storage_type" "text",
    CONSTRAINT "shipment_pack_items_pack_count_check" CHECK (("pack_count" > 0)),
    CONSTRAINT "shipment_pack_items_storage_type_check" CHECK ((("storage_type" IS NULL) OR ("storage_type" = ANY (ARRAY['BOX'::"text", 'BAG'::"text", 'SHOP_PACKING'::"text"])))),
    CONSTRAINT "shipment_pack_items_units_count_check" CHECK ((("units_count" IS NULL) OR ("units_count" > 0)))
);


ALTER TABLE "public"."shipment_pack_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."shipment_pack_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."shipment_pack_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."shipment_pack_items_id_seq" OWNED BY "public"."shipment_pack_items"."id";



CREATE TABLE IF NOT EXISTS "public"."shipments" (
    "id" bigint NOT NULL,
    "doc_no" "text" DEFAULT "public"."next_shipment_doc_no"() NOT NULL,
    "customer_id" integer NOT NULL,
    "warehouse_id" integer NOT NULL,
    "carrier_id" integer,
    "carrier_reference" "text",
    "planned_ship_date" timestamp with time zone,
    "shipped_at" timestamp with time zone,
    "expected_delivery" timestamp with time zone,
    "doc_status" "text" NOT NULL,
    "notes" "text",
    "special_instructions" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "shipments_doc_status_check" CHECK (("doc_status" = ANY (ARRAY['PENDING'::"text", 'READY'::"text", 'SHIPPED'::"text", 'DELIVERED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."shipments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."shipments_doc_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."shipments_doc_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."shipments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."shipments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."shipments_id_seq" OWNED BY "public"."shipments"."id";



CREATE TABLE IF NOT EXISTS "public"."stock_levels" (
    "id" bigint NOT NULL,
    "product_id" integer NOT NULL,
    "warehouse_id" integer NOT NULL,
    "lot_id" bigint,
    "on_hand" numeric DEFAULT 0,
    "allocated" numeric DEFAULT 0,
    "quality_hold" numeric DEFAULT 0,
    "in_transit" numeric DEFAULT 0
);


ALTER TABLE "public"."stock_levels" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."stock_levels_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stock_levels_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stock_levels_id_seq" OWNED BY "public"."stock_levels"."id";



CREATE TABLE IF NOT EXISTS "public"."supplier_categories" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."supplier_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_types" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category_code" "text" DEFAULT 'PRODUCT'::"text" NOT NULL
);


ALTER TABLE "public"."supplier_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "supplier_type" "text",
    "primary_contact_name" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "country" "text",
    "is_halal_certified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "supplier_age" integer,
    "gender" "text",
    "number_of_employees" integer,
    "number_of_dependants" integer,
    "proof_of_residence" "text",
    "bank" "text",
    "account_number" "text",
    "branch" "text",
    "primary_contact_email" "text",
    "primary_contact_phone" "text"
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."suppliers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."suppliers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."suppliers_id_seq" OWNED BY "public"."suppliers"."id";



CREATE TABLE IF NOT EXISTS "public"."supplies" (
    "id" bigint NOT NULL,
    "doc_no" "text" DEFAULT "public"."next_supply_doc_no"() NOT NULL,
    "warehouse_id" integer NOT NULL,
    "supplier_id" integer,
    "reference" "text",
    "received_at" timestamp with time zone,
    "expected_at" timestamp with time zone,
    "received_by" "uuid",
    "doc_status" "text" NOT NULL,
    "quality_status" "text",
    "transport_reference" "text",
    "pallets_received" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category_code" "text" DEFAULT 'PRODUCT'::"text" NOT NULL,
    CONSTRAINT "supplies_doc_status_check" CHECK (("doc_status" = ANY (ARRAY['RECEIVED'::"text", 'INSPECTING'::"text", 'ACCEPTED'::"text", 'REJECTED'::"text"]))),
    CONSTRAINT "supplies_quality_status_check" CHECK (("quality_status" = ANY (ARRAY['PENDING'::"text", 'PASSED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."supplies" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supplies_doc_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supplies_doc_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supplies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supplies_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supplies_id_seq" OWNED BY "public"."supplies"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_activities" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "type" "text",
    "description" "text",
    "actor" "uuid",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supply_activities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supply_activities_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_activities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_activities_id_seq" OWNED BY "public"."supply_activities"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_batches" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "supply_line_id" bigint,
    "product_id" integer NOT NULL,
    "unit_id" integer,
    "lot_no" "text" NOT NULL,
    "received_qty" numeric,
    "accepted_qty" numeric,
    "rejected_qty" numeric,
    "current_qty" numeric,
    "quality_status" "text",
    "expiry_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "process_status" "text" DEFAULT 'UNPROCESSED'::"text" NOT NULL,
    CONSTRAINT "supply_batches_process_status_check" CHECK (("process_status" = ANY (ARRAY['UNPROCESSED'::"text", 'PROCESSING'::"text", 'PROCESSED'::"text"]))),
    CONSTRAINT "supply_batches_quality_status_check" CHECK (("quality_status" = ANY (ARRAY['PENDING'::"text", 'PASSED'::"text", 'FAILED'::"text", 'HOLD'::"text"])))
);


ALTER TABLE "public"."supply_batches" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supply_batches_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_batches_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_batches_id_seq" OWNED BY "public"."supply_batches"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_document_types" (
    "id" integer NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "allows_file_upload" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supply_document_types" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supply_document_types_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_document_types_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_document_types_id_seq" OWNED BY "public"."supply_document_types"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_documents" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "document_type_code" "text" NOT NULL,
    "value" "text",
    "date_value" "date",
    "boolean_value" boolean,
    "document_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supply_documents" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supply_documents_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_documents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_documents_id_seq" OWNED BY "public"."supply_documents"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_lines" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "product_id" integer NOT NULL,
    "unit_id" integer,
    "ordered_qty" numeric,
    "received_qty" numeric,
    "accepted_qty" numeric,
    "rejected_qty" numeric,
    "variance_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "unit_price" numeric
);


ALTER TABLE "public"."supply_lines" OWNER TO "postgres";


COMMENT ON COLUMN "public"."supply_lines"."unit_price" IS 'Price per unit for this supply line (same product can have different prices per supply).';



CREATE SEQUENCE IF NOT EXISTS "public"."supply_lines_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_lines_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_lines_id_seq" OWNED BY "public"."supply_lines"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_packaging_quality_check_items" (
    "id" bigint NOT NULL,
    "packaging_check_id" bigint NOT NULL,
    "parameter_id" integer NOT NULL,
    "value" "text",
    "numeric_value" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supply_packaging_quality_check_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supply_packaging_quality_check_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_packaging_quality_check_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_packaging_quality_check_items_id_seq" OWNED BY "public"."supply_packaging_quality_check_items"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_packaging_quality_checks" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "checked_by" "uuid",
    "checked_at" timestamp with time zone DEFAULT "now"(),
    "remarks" "text"
);


ALTER TABLE "public"."supply_packaging_quality_checks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supply_packaging_quality_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_packaging_quality_checks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_packaging_quality_checks_id_seq" OWNED BY "public"."supply_packaging_quality_checks"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_payments" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "amount" numeric NOT NULL,
    "paid_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "proof_storage_path" "text",
    "proof_name" "text",
    "proof_type" "text",
    "proof_source" "text",
    "recorded_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "supply_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "supply_payments_proof_source_check" CHECK (("proof_source" = ANY (ARRAY['URL'::"text", 'FILE_PATH'::"text", 'STORAGE'::"text", 'MANUAL'::"text"])))
);


ALTER TABLE "public"."supply_payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."supply_payments" IS 'Payments made against supplies; each payment is linked to one supply. Suppliers may be paid in full or in part.';



COMMENT ON COLUMN "public"."supply_payments"."proof_storage_path" IS 'Supabase storage path to uploaded proof of payment (image/pdf).';



COMMENT ON COLUMN "public"."supply_payments"."proof_name" IS 'Display filename/title for payment proof.';



COMMENT ON COLUMN "public"."supply_payments"."proof_type" IS 'Proof MIME type or category (for example application/pdf).';



COMMENT ON COLUMN "public"."supply_payments"."proof_source" IS 'Proof reference source: URL, FILE_PATH, STORAGE, or MANUAL.';



COMMENT ON COLUMN "public"."supply_payments"."recorded_by" IS 'Auth user who recorded this payment.';



COMMENT ON COLUMN "public"."supply_payments"."updated_by" IS 'Auth user who last updated this payment.';



COMMENT ON COLUMN "public"."supply_payments"."updated_at" IS 'Last update timestamp for this payment row.';



CREATE SEQUENCE IF NOT EXISTS "public"."supply_payments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_payments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_payments_id_seq" OWNED BY "public"."supply_payments"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_quality_check_items" (
    "id" bigint NOT NULL,
    "quality_check_id" bigint NOT NULL,
    "parameter_id" integer NOT NULL,
    "score" integer NOT NULL,
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "results" "text",
    CONSTRAINT "supply_quality_check_items_score_check" CHECK ((("score" >= 1) AND ("score" <= 4)))
);


ALTER TABLE "public"."supply_quality_check_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."supply_quality_check_items"."results" IS 'Manual results entry for the quality check item, entered by users during evaluation';



CREATE SEQUENCE IF NOT EXISTS "public"."supply_quality_check_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_quality_check_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_quality_check_items_id_seq" OWNED BY "public"."supply_quality_check_items"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_quality_checks" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "lot_id" bigint,
    "check_name" "text" NOT NULL,
    "result" "text",
    "status" "text",
    "remarks" "text",
    "performed_by" "uuid",
    "performed_at" timestamp with time zone DEFAULT "now"(),
    "evaluated_at" timestamp with time zone DEFAULT "now"(),
    "evaluated_by" "uuid",
    "overall_score" numeric(4,2),
    CONSTRAINT "supply_quality_checks_status_check" CHECK (("status" = ANY (ARRAY['PASS'::"text", 'FAIL'::"text", 'PENDING'::"text"])))
);


ALTER TABLE "public"."supply_quality_checks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supply_quality_checks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_quality_checks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_quality_checks_id_seq" OWNED BY "public"."supply_quality_checks"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_supplier_sign_offs" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "signature_type" "text" NOT NULL,
    "signature_data" "text",
    "document_id" bigint,
    "signed_by_name" "text" NOT NULL,
    "signed_by_user_id" "uuid",
    "signed_at" timestamp with time zone DEFAULT "now"(),
    "remarks" "text",
    CONSTRAINT "supply_supplier_sign_offs_signature_type_check" CHECK (("signature_type" = ANY (ARRAY['E_SIGNATURE'::"text", 'UPLOADED_DOCUMENT'::"text"])))
);


ALTER TABLE "public"."supply_supplier_sign_offs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supply_supplier_sign_offs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_supplier_sign_offs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_supplier_sign_offs_id_seq" OWNED BY "public"."supply_supplier_sign_offs"."id";



CREATE TABLE IF NOT EXISTS "public"."supply_vehicle_inspections" (
    "id" bigint NOT NULL,
    "supply_id" bigint NOT NULL,
    "vehicle_clean" "text" NOT NULL,
    "no_foreign_objects" "text" NOT NULL,
    "no_pest_infestation" "text" NOT NULL,
    "inspected_by" "uuid",
    "inspected_at" timestamp with time zone DEFAULT "now"(),
    "remarks" "text",
    CONSTRAINT "supply_vehicle_inspections_no_foreign_objects_check" CHECK (("no_foreign_objects" = ANY (ARRAY['YES'::"text", 'NO'::"text", 'NA'::"text"]))),
    CONSTRAINT "supply_vehicle_inspections_no_pest_infestation_check" CHECK (("no_pest_infestation" = ANY (ARRAY['YES'::"text", 'NO'::"text", 'NA'::"text"]))),
    CONSTRAINT "supply_vehicle_inspections_vehicle_clean_check" CHECK (("vehicle_clean" = ANY (ARRAY['YES'::"text", 'NO'::"text", 'NA'::"text"])))
);


ALTER TABLE "public"."supply_vehicle_inspections" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."supply_vehicle_inspections_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."supply_vehicle_inspections_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."supply_vehicle_inspections_id_seq" OWNED BY "public"."supply_vehicle_inspections"."id";



CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "symbol" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."units" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."units_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."units_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."units_id_seq" OWNED BY "public"."units"."id";



CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'planner'::"text", 'qa'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "enabled" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."warehouses" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vw_inventory_summary" AS
 SELECT "sl"."product_id",
    "p"."sku",
    "p"."name",
    "sl"."warehouse_id",
    "w"."name" AS "warehouse_name",
    COALESCE("sum"("sl"."on_hand"), (0)::numeric) AS "on_hand",
    COALESCE("sum"("sl"."allocated"), (0)::numeric) AS "allocated",
    COALESCE("sum"("sl"."quality_hold"), (0)::numeric) AS "quality_hold",
    COALESCE("sum"("sl"."in_transit"), (0)::numeric) AS "in_transit"
   FROM (("public"."stock_levels" "sl"
     JOIN "public"."products" "p" ON (("p"."id" = "sl"."product_id")))
     JOIN "public"."warehouses" "w" ON (("w"."id" = "sl"."warehouse_id")))
  GROUP BY "sl"."product_id", "p"."sku", "p"."name", "sl"."warehouse_id", "w"."name";


ALTER VIEW "public"."vw_inventory_summary" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."warehouses_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."warehouses_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."warehouses_id_seq" OWNED BY "public"."warehouses"."id";



ALTER TABLE ONLY "public"."batch_step_transitions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."batch_step_transitions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."box_pack_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."box_pack_rules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."carriers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."carriers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."customer_contacts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."customer_contacts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."customers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."customers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cycle_count_lines" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cycle_count_lines_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cycle_counts" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cycle_counts_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."daily_checks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_checks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."documents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."inventory_adjustments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inventory_adjustments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."inventory_movements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."inventory_movements_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."metal_detector_check_sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."metal_detector_check_sessions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."operational_supply_entries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."operational_supply_entries_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."packaging_quality_parameters" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."packaging_quality_parameters_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."packaging_units" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."packaging_units_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_drying_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_drying_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_drying_waste" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_drying_waste_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_foreign_object_rejections" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_foreign_object_rejections_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_lot_run_batches" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_lot_run_batches_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_lot_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_lot_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_measurements" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_measurements_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_metal_detector" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_metal_detector_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_metal_detector_waste" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_metal_detector_waste_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_non_conformances" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_non_conformances_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_packaging_metal_check_rejections" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_packaging_metal_check_rejections_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_packaging_metal_checks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_packaging_metal_checks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_packaging_pack_entries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_packaging_pack_entries_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_packaging_photos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_packaging_photos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_packaging_remainder_usages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_packaging_remainder_usages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_packaging_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_packaging_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_packaging_storage_allocations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_packaging_storage_allocations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_packaging_waste" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_packaging_waste_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_packaging_weight_checks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_packaging_weight_checks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_qc_checks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_qc_checks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_quality_parameters" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_quality_parameters_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_signoffs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_signoffs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_sorting_outputs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_sorting_outputs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_sorting_waste" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_sorting_waste_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_step_names" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_step_names_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_step_quality_check_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_step_quality_check_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_step_quality_checks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_step_quality_checks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_step_quality_parameters" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_step_quality_parameters_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_step_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_step_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_steps" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_steps_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_washing_runs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_washing_runs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."process_washing_waste" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."process_washing_waste_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."processes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."processes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."product_components" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."product_components_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."product_processes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."product_processes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."production_batches" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."production_batches_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."products" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."products_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."quality_parameters" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."quality_parameters_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."reworked_lots" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reworked_lots_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."shipment_activities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."shipment_activities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."shipment_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."shipment_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."shipment_lot_allocations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."shipment_lot_allocations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."shipment_pack_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."shipment_pack_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."shipments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."shipments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stock_levels" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stock_levels_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."suppliers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."suppliers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supplies" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supplies_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_activities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_activities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_batches" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_batches_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_document_types" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_document_types_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_documents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_lines" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_lines_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_packaging_quality_check_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_packaging_quality_check_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_packaging_quality_checks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_packaging_quality_checks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_payments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_payments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_quality_check_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_quality_check_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_quality_checks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_quality_checks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_supplier_sign_offs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_supplier_sign_offs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."supply_vehicle_inspections" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."supply_vehicle_inspections_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."units" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."units_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."warehouses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."warehouses_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."batch_step_transitions"
    ADD CONSTRAINT "batch_step_transitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_pack_rules"
    ADD CONSTRAINT "box_pack_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."box_pack_rules"
    ADD CONSTRAINT "box_pack_rules_unique" UNIQUE ("box_unit_id", "packet_unit_id");



ALTER TABLE ONLY "public"."carriers"
    ADD CONSTRAINT "carriers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."carriers"
    ADD CONSTRAINT "carriers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_contacts"
    ADD CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cycle_count_lines"
    ADD CONSTRAINT "cycle_count_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cycle_counts"
    ADD CONSTRAINT "cycle_counts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_checks"
    ADD CONSTRAINT "daily_checks_date_item_unique" UNIQUE ("check_date", "item_key");



ALTER TABLE ONLY "public"."daily_checks"
    ADD CONSTRAINT "daily_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_types"
    ADD CONSTRAINT "document_types_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metal_detector_check_sessions"
    ADD CONSTRAINT "metal_detector_check_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metal_detector_hourly_checks"
    ADD CONSTRAINT "metal_detector_hour_unique" UNIQUE ("check_date", "check_hour");



ALTER TABLE ONLY "public"."metal_detector_hourly_checks"
    ADD CONSTRAINT "metal_detector_hourly_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_supply_entries"
    ADD CONSTRAINT "operational_supply_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_supply_entries"
    ADD CONSTRAINT "operational_supply_entries_supply_id_key" UNIQUE ("supply_id");



ALTER TABLE ONLY "public"."packaging_quality_parameters"
    ADD CONSTRAINT "packaging_quality_parameters_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."packaging_quality_parameters"
    ADD CONSTRAINT "packaging_quality_parameters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."packaging_units"
    ADD CONSTRAINT "packaging_units_code_key" UNIQUE ("code");



ALTER TABLE "public"."packaging_units"
    ADD CONSTRAINT "packaging_units_packet_requires_operational_product_check" CHECK ((("unit_type" <> 'PACKET'::"text") OR ("operational_product_id" IS NOT NULL))) NOT VALID;



ALTER TABLE ONLY "public"."packaging_units"
    ADD CONSTRAINT "packaging_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_drying_runs"
    ADD CONSTRAINT "process_drying_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_drying_runs"
    ADD CONSTRAINT "process_drying_runs_process_step_run_id_key" UNIQUE ("process_step_run_id");



ALTER TABLE ONLY "public"."process_drying_waste"
    ADD CONSTRAINT "process_drying_waste_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_foreign_object_rejections"
    ADD CONSTRAINT "process_foreign_object_rejections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_lot_run_batches"
    ADD CONSTRAINT "process_lot_run_batches_batch_unique" UNIQUE ("supply_batch_id");



ALTER TABLE ONLY "public"."process_lot_run_batches"
    ADD CONSTRAINT "process_lot_run_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_lot_run_batches"
    ADD CONSTRAINT "process_lot_run_batches_run_batch_unique" UNIQUE ("process_lot_run_id", "supply_batch_id");



ALTER TABLE ONLY "public"."process_lot_runs"
    ADD CONSTRAINT "process_lot_runs_batch_unique" UNIQUE ("supply_batch_id");



ALTER TABLE ONLY "public"."process_lot_runs"
    ADD CONSTRAINT "process_lot_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_measurements"
    ADD CONSTRAINT "process_measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_metal_detector"
    ADD CONSTRAINT "process_metal_detector_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_metal_detector"
    ADD CONSTRAINT "process_metal_detector_process_step_run_id_key" UNIQUE ("process_step_run_id");



ALTER TABLE ONLY "public"."process_metal_detector_waste"
    ADD CONSTRAINT "process_metal_detector_waste_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_non_conformances"
    ADD CONSTRAINT "process_non_conformances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_packaging_metal_check_rejections"
    ADD CONSTRAINT "process_packaging_metal_check_rejections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_packaging_metal_checks"
    ADD CONSTRAINT "process_packaging_metal_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_packaging_metal_checks"
    ADD CONSTRAINT "process_packaging_metal_checks_unique_attempt" UNIQUE ("packaging_run_id", "sorting_output_id", "attempt_no");



ALTER TABLE ONLY "public"."process_packaging_pack_entries"
    ADD CONSTRAINT "process_packaging_pack_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_packaging_photos"
    ADD CONSTRAINT "process_packaging_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_packaging_remainder_usages"
    ADD CONSTRAINT "process_packaging_remainder_usages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_packaging_runs"
    ADD CONSTRAINT "process_packaging_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_packaging_runs"
    ADD CONSTRAINT "process_packaging_runs_step_run_unique" UNIQUE ("process_step_run_id");



ALTER TABLE ONLY "public"."process_packaging_storage_allocations"
    ADD CONSTRAINT "process_packaging_storage_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_packaging_waste"
    ADD CONSTRAINT "process_packaging_waste_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_packaging_weight_checks"
    ADD CONSTRAINT "process_packaging_weight_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_qc_checks"
    ADD CONSTRAINT "process_qc_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_quality_parameters"
    ADD CONSTRAINT "process_quality_parameters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_quality_parameters"
    ADD CONSTRAINT "process_quality_parameters_process_quality_parameter_key" UNIQUE ("process_id", "quality_parameter_id");



ALTER TABLE ONLY "public"."process_signoffs"
    ADD CONSTRAINT "process_signoffs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_sorting_outputs"
    ADD CONSTRAINT "process_sorting_outputs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_sorting_waste"
    ADD CONSTRAINT "process_sorting_waste_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_step_names"
    ADD CONSTRAINT "process_step_names_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."process_step_names"
    ADD CONSTRAINT "process_step_names_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."process_step_names"
    ADD CONSTRAINT "process_step_names_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_step_quality_check_items"
    ADD CONSTRAINT "process_step_quality_check_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_step_quality_check_items"
    ADD CONSTRAINT "process_step_quality_check_items_quality_check_id_parameter_id_" UNIQUE ("quality_check_id", "parameter_id");



ALTER TABLE ONLY "public"."process_step_quality_checks"
    ADD CONSTRAINT "process_step_quality_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_step_quality_parameters"
    ADD CONSTRAINT "process_step_quality_parameters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_step_quality_parameters"
    ADD CONSTRAINT "process_step_quality_parameters_step_quality_parameter_key" UNIQUE ("process_step_id", "quality_parameter_id");



ALTER TABLE ONLY "public"."process_step_runs"
    ADD CONSTRAINT "process_step_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_steps"
    ADD CONSTRAINT "process_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_steps"
    ADD CONSTRAINT "process_steps_process_seq_key" UNIQUE ("process_id", "seq");



ALTER TABLE ONLY "public"."process_washing_runs"
    ADD CONSTRAINT "process_washing_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."process_washing_runs"
    ADD CONSTRAINT "process_washing_runs_process_step_run_id_key" UNIQUE ("process_step_run_id");



ALTER TABLE ONLY "public"."process_washing_waste"
    ADD CONSTRAINT "process_washing_waste_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processes"
    ADD CONSTRAINT "processes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."processes"
    ADD CONSTRAINT "processes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_components"
    ADD CONSTRAINT "product_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_processes"
    ADD CONSTRAINT "product_processes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_processes"
    ADD CONSTRAINT "product_processes_product_process_key" UNIQUE ("product_id", "process_id");



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_run_batch_unique" UNIQUE ("process_lot_run_id", "supply_batch_id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."quality_parameters"
    ADD CONSTRAINT "quality_parameters_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."quality_parameters"
    ADD CONSTRAINT "quality_parameters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reworked_lots"
    ADD CONSTRAINT "reworked_lots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reworked_lots"
    ADD CONSTRAINT "reworked_lots_rework_batch_unique" UNIQUE ("rework_supply_batch_id");



ALTER TABLE ONLY "public"."shipment_activities"
    ADD CONSTRAINT "shipment_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipment_contacts"
    ADD CONSTRAINT "shipment_contacts_pkey" PRIMARY KEY ("shipment_id", "contact_id");



ALTER TABLE ONLY "public"."shipment_items"
    ADD CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipment_lot_allocations"
    ADD CONSTRAINT "shipment_lot_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipment_lot_allocations"
    ADD CONSTRAINT "shipment_lot_allocations_shipment_item_id_lot_id_key" UNIQUE ("shipment_item_id", "lot_id");



ALTER TABLE ONLY "public"."shipment_pack_items"
    ADD CONSTRAINT "shipment_pack_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_doc_no_key" UNIQUE ("doc_no");



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_levels"
    ADD CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_levels"
    ADD CONSTRAINT "stock_levels_product_id_warehouse_id_lot_id_key" UNIQUE ("product_id", "warehouse_id", "lot_id");



ALTER TABLE ONLY "public"."supplier_categories"
    ADD CONSTRAINT "supplier_categories_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."supplier_types"
    ADD CONSTRAINT "supplier_types_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_doc_no_key" UNIQUE ("doc_no");



ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_activities"
    ADD CONSTRAINT "supply_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_batches"
    ADD CONSTRAINT "supply_batches_lot_no_key" UNIQUE ("lot_no");



ALTER TABLE ONLY "public"."supply_batches"
    ADD CONSTRAINT "supply_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_document_types"
    ADD CONSTRAINT "supply_document_types_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."supply_document_types"
    ADD CONSTRAINT "supply_document_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_documents"
    ADD CONSTRAINT "supply_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_documents"
    ADD CONSTRAINT "supply_documents_supply_document_type_unique" UNIQUE ("supply_id", "document_type_code");



ALTER TABLE ONLY "public"."supply_lines"
    ADD CONSTRAINT "supply_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_packaging_quality_check_items"
    ADD CONSTRAINT "supply_packaging_quality_check_items_packaging_check_parameter_" UNIQUE ("packaging_check_id", "parameter_id");



ALTER TABLE ONLY "public"."supply_packaging_quality_check_items"
    ADD CONSTRAINT "supply_packaging_quality_check_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_packaging_quality_checks"
    ADD CONSTRAINT "supply_packaging_quality_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_packaging_quality_checks"
    ADD CONSTRAINT "supply_packaging_quality_checks_supply_id_unique" UNIQUE ("supply_id");



ALTER TABLE ONLY "public"."supply_payments"
    ADD CONSTRAINT "supply_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_quality_check_items"
    ADD CONSTRAINT "supply_quality_check_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_quality_check_items"
    ADD CONSTRAINT "supply_quality_check_items_quality_check_id_parameter_id_key" UNIQUE ("quality_check_id", "parameter_id");



ALTER TABLE ONLY "public"."supply_quality_checks"
    ADD CONSTRAINT "supply_quality_checks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_supplier_sign_offs"
    ADD CONSTRAINT "supply_supplier_sign_offs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_supplier_sign_offs"
    ADD CONSTRAINT "supply_supplier_sign_offs_supply_id_unique" UNIQUE ("supply_id");



ALTER TABLE ONLY "public"."supply_vehicle_inspections"
    ADD CONSTRAINT "supply_vehicle_inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supply_vehicle_inspections"
    ADD CONSTRAINT "supply_vehicle_inspections_supply_id_unique" UNIQUE ("supply_id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_symbol_key" UNIQUE ("symbol");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_logs_table_schema_idx" ON "public"."audit_logs" USING "btree" ("table_schema");



CREATE INDEX "audit_logs_table_time_idx" ON "public"."audit_logs" USING "btree" ("table_name", "change_time" DESC);



CREATE INDEX "batch_step_transitions_created_by_idx" ON "public"."batch_step_transitions" USING "btree" ("created_by");



CREATE INDEX "batch_step_transitions_manufacturing_batch_id_idx" ON "public"."batch_step_transitions" USING "btree" ("manufacturing_batch_id");



CREATE INDEX "box_pack_rules_box_unit_id_idx" ON "public"."box_pack_rules" USING "btree" ("box_unit_id");



CREATE INDEX "box_pack_rules_packet_unit_id_idx" ON "public"."box_pack_rules" USING "btree" ("packet_unit_id");



CREATE INDEX "customer_contacts_customer_id_idx" ON "public"."customer_contacts" USING "btree" ("customer_id");



CREATE INDEX "daily_checks_category_idx" ON "public"."daily_checks" USING "btree" ("category");



CREATE INDEX "daily_checks_check_date_idx" ON "public"."daily_checks" USING "btree" ("check_date");



CREATE INDEX "daily_checks_completed_idx" ON "public"."daily_checks" USING "btree" ("completed");



CREATE INDEX "documents_owner_idx" ON "public"."documents" USING "btree" ("owner_type", "owner_id");



CREATE INDEX "inventory_movements_lot_idx" ON "public"."inventory_movements" USING "btree" ("lot_id");



CREATE INDEX "inventory_movements_product_idx" ON "public"."inventory_movements" USING "btree" ("product_id", "warehouse_id");



CREATE UNIQUE INDEX "metal_detector_check_sessions_single_active_idx" ON "public"."metal_detector_check_sessions" USING "btree" ("status") WHERE ("status" = 'ACTIVE'::"text");



CREATE INDEX "metal_detector_check_sessions_status_idx" ON "public"."metal_detector_check_sessions" USING "btree" ("status");



CREATE INDEX "metal_detector_hourly_checks_check_date_idx" ON "public"."metal_detector_hourly_checks" USING "btree" ("check_date");



CREATE INDEX "metal_detector_hourly_checks_check_hour_idx" ON "public"."metal_detector_hourly_checks" USING "btree" ("check_hour");



CREATE INDEX "metal_detector_hourly_checks_date_idx" ON "public"."metal_detector_hourly_checks" USING "btree" ("check_date");



CREATE INDEX "operational_supply_entries_supply_id_idx" ON "public"."operational_supply_entries" USING "btree" ("supply_id");



CREATE UNIQUE INDEX "packaging_quality_parameters_code_idx" ON "public"."packaging_quality_parameters" USING "btree" ("code");



CREATE INDEX "packaging_units_operational_product_id_idx" ON "public"."packaging_units" USING "btree" ("operational_product_id");



CREATE INDEX "process_drying_runs_step_run_id_idx" ON "public"."process_drying_runs" USING "btree" ("process_step_run_id");



CREATE INDEX "process_drying_waste_drying_run_id_idx" ON "public"."process_drying_waste" USING "btree" ("drying_run_id");



CREATE INDEX "process_foreign_object_rejections_session_id_idx" ON "public"."process_foreign_object_rejections" USING "btree" ("session_id");



CREATE INDEX "process_lot_run_batches_batch_idx" ON "public"."process_lot_run_batches" USING "btree" ("supply_batch_id");



CREATE UNIQUE INDEX "process_lot_run_batches_one_primary_per_run_idx" ON "public"."process_lot_run_batches" USING "btree" ("process_lot_run_id") WHERE ("is_primary" = true);



CREATE INDEX "process_lot_run_batches_run_idx" ON "public"."process_lot_run_batches" USING "btree" ("process_lot_run_id");



CREATE INDEX "process_lot_runs_batch_idx" ON "public"."process_lot_runs" USING "btree" ("supply_batch_id");



CREATE INDEX "process_lot_runs_is_rework_idx" ON "public"."process_lot_runs" USING "btree" ("is_rework");



CREATE INDEX "process_lot_runs_original_lot_run_idx" ON "public"."process_lot_runs" USING "btree" ("original_process_lot_run_id");



CREATE INDEX "process_lot_runs_process_idx" ON "public"."process_lot_runs" USING "btree" ("process_id");



CREATE INDEX "process_measurements_step_run_idx" ON "public"."process_measurements" USING "btree" ("process_step_run_id");



CREATE INDEX "process_metal_detector_step_run_id_idx" ON "public"."process_metal_detector" USING "btree" ("process_step_run_id");



CREATE INDEX "process_metal_detector_waste_step_run_id_idx" ON "public"."process_metal_detector_waste" USING "btree" ("process_step_run_id");



CREATE INDEX "process_non_conformances_step_run_resolved_idx" ON "public"."process_non_conformances" USING "btree" ("process_step_run_id", "resolved");



CREATE INDEX "process_packaging_metal_check_rejections_created_at_desc_idx" ON "public"."process_packaging_metal_check_rejections" USING "btree" ("created_at" DESC);



CREATE INDEX "process_packaging_metal_check_rejections_metal_check_id_idx" ON "public"."process_packaging_metal_check_rejections" USING "btree" ("metal_check_id");



CREATE INDEX "process_packaging_metal_checks_checked_at_desc_idx" ON "public"."process_packaging_metal_checks" USING "btree" ("checked_at" DESC);



CREATE INDEX "process_packaging_metal_checks_packaging_sorting_idx" ON "public"."process_packaging_metal_checks" USING "btree" ("packaging_run_id", "sorting_output_id");



CREATE INDEX "process_packaging_metal_checks_status_idx" ON "public"."process_packaging_metal_checks" USING "btree" ("status");



CREATE INDEX "process_packaging_pack_entries_metal_check_last_id_idx" ON "public"."process_packaging_pack_entries" USING "btree" ("metal_check_last_id");



CREATE INDEX "process_packaging_pack_entries_metal_check_status_idx" ON "public"."process_packaging_pack_entries" USING "btree" ("metal_check_status");



CREATE INDEX "process_packaging_pack_entries_pack_identifier_idx" ON "public"."process_packaging_pack_entries" USING "btree" ("pack_identifier");



CREATE INDEX "process_packaging_pack_entries_packaging_run_id_idx" ON "public"."process_packaging_pack_entries" USING "btree" ("packaging_run_id");



CREATE INDEX "process_packaging_pack_entries_packet_unit_code_idx" ON "public"."process_packaging_pack_entries" USING "btree" ("packet_unit_code");



CREATE INDEX "process_packaging_pack_entries_packing_type_idx" ON "public"."process_packaging_pack_entries" USING "btree" ("packing_type");



CREATE INDEX "process_packaging_pack_entries_product_id_idx" ON "public"."process_packaging_pack_entries" USING "btree" ("product_id");



CREATE INDEX "process_packaging_pack_entries_sorting_output_id_idx" ON "public"."process_packaging_pack_entries" USING "btree" ("sorting_output_id");



CREATE INDEX "process_packaging_photos_packaging_run_id_idx" ON "public"."process_packaging_photos" USING "btree" ("packaging_run_id");



CREATE INDEX "process_packaging_remainder_usages_consumer_pack_entry_id_idx" ON "public"."process_packaging_remainder_usages" USING "btree" ("consumer_pack_entry_id");



CREATE INDEX "process_packaging_remainder_usages_created_at_desc_idx" ON "public"."process_packaging_remainder_usages" USING "btree" ("created_at" DESC);



CREATE INDEX "process_packaging_remainder_usages_source_pack_entry_id_idx" ON "public"."process_packaging_remainder_usages" USING "btree" ("source_pack_entry_id");



CREATE INDEX "process_packaging_runs_step_run_id_idx" ON "public"."process_packaging_runs" USING "btree" ("process_step_run_id");



CREATE INDEX "process_packaging_storage_allocations_box_unit_code_idx" ON "public"."process_packaging_storage_allocations" USING "btree" ("box_unit_code");



CREATE INDEX "process_packaging_storage_allocations_created_at_desc_idx" ON "public"."process_packaging_storage_allocations" USING "btree" ("created_at" DESC);



CREATE INDEX "process_packaging_storage_allocations_pack_entry_id_idx" ON "public"."process_packaging_storage_allocations" USING "btree" ("pack_entry_id");



CREATE INDEX "process_packaging_storage_allocations_packaging_run_id_idx" ON "public"."process_packaging_storage_allocations" USING "btree" ("packaging_run_id");



CREATE INDEX "process_packaging_storage_allocations_storage_type_idx" ON "public"."process_packaging_storage_allocations" USING "btree" ("storage_type");



CREATE INDEX "process_packaging_waste_packaging_run_id_idx" ON "public"."process_packaging_waste" USING "btree" ("packaging_run_id");



CREATE INDEX "process_packaging_weight_checks_packaging_run_id_idx" ON "public"."process_packaging_weight_checks" USING "btree" ("packaging_run_id");



CREATE INDEX "process_quality_parameters_process_id_idx" ON "public"."process_quality_parameters" USING "btree" ("process_id");



CREATE INDEX "process_quality_parameters_quality_parameter_id_idx" ON "public"."process_quality_parameters" USING "btree" ("quality_parameter_id");



CREATE INDEX "process_sorting_outputs_product_id_idx" ON "public"."process_sorting_outputs" USING "btree" ("product_id");



CREATE INDEX "process_sorting_outputs_step_run_id_idx" ON "public"."process_sorting_outputs" USING "btree" ("process_step_run_id");



CREATE INDEX "process_sorting_waste_sorting_run_id_idx" ON "public"."process_sorting_waste" USING "btree" ("sorting_run_id");



CREATE INDEX "process_step_quality_check_items_parameter_id_idx" ON "public"."process_step_quality_check_items" USING "btree" ("parameter_id");



CREATE INDEX "process_step_quality_check_items_quality_check_id_idx" ON "public"."process_step_quality_check_items" USING "btree" ("quality_check_id");



CREATE INDEX "process_step_quality_checks_step_run_id_idx" ON "public"."process_step_quality_checks" USING "btree" ("process_step_run_id");



CREATE INDEX "process_step_quality_parameters_quality_parameter_id_idx" ON "public"."process_step_quality_parameters" USING "btree" ("quality_parameter_id");



CREATE INDEX "process_step_quality_parameters_step_id_idx" ON "public"."process_step_quality_parameters" USING "btree" ("process_step_id");



CREATE INDEX "process_step_runs_lot_status_idx" ON "public"."process_step_runs" USING "btree" ("process_lot_run_id", "status");



CREATE INDEX "process_step_runs_skipped_by_idx" ON "public"."process_step_runs" USING "btree" ("skipped_by");



CREATE INDEX "process_steps_process_id_idx" ON "public"."process_steps" USING "btree" ("process_id");



CREATE INDEX "process_washing_runs_step_run_id_idx" ON "public"."process_washing_runs" USING "btree" ("process_step_run_id");



CREATE INDEX "process_washing_waste_washing_run_id_idx" ON "public"."process_washing_waste" USING "btree" ("washing_run_id");



CREATE INDEX "processes_product_ids_idx" ON "public"."processes" USING "gin" ("product_ids");



CREATE UNIQUE INDEX "product_components_parent_component_idx" ON "public"."product_components" USING "btree" ("parent_product_id", "component_product_id");



CREATE UNIQUE INDEX "product_processes_product_default_idx" ON "public"."product_processes" USING "btree" ("product_id") WHERE "is_default";



CREATE INDEX "products_category_idx" ON "public"."products" USING "btree" ("category");



CREATE INDEX "products_sku_idx" ON "public"."products" USING "btree" ("sku");



CREATE UNIQUE INDEX "quality_parameters_code_idx" ON "public"."quality_parameters" USING "btree" ("code");



CREATE INDEX "reworked_lots_original_batch_idx" ON "public"."reworked_lots" USING "btree" ("original_supply_batch_id");



CREATE INDEX "reworked_lots_process_step_run_idx" ON "public"."reworked_lots" USING "btree" ("process_step_run_id");



CREATE INDEX "reworked_lots_rework_batch_idx" ON "public"."reworked_lots" USING "btree" ("rework_supply_batch_id");



CREATE INDEX "reworked_lots_sorting_output_idx" ON "public"."reworked_lots" USING "btree" ("sorting_output_id");



CREATE INDEX "shipment_items_shipment_idx" ON "public"."shipment_items" USING "btree" ("shipment_id");



CREATE INDEX "shipment_pack_items_pack_entry_id_idx" ON "public"."shipment_pack_items" USING "btree" ("pack_entry_id");



CREATE INDEX "shipment_pack_items_packaging_allocation_id_idx" ON "public"."shipment_pack_items" USING "btree" ("packaging_allocation_id");



CREATE INDEX "shipment_pack_items_shipment_id_idx" ON "public"."shipment_pack_items" USING "btree" ("shipment_id");



CREATE INDEX "stock_levels_product_idx" ON "public"."stock_levels" USING "btree" ("product_id", "warehouse_id");



CREATE INDEX "supplies_doc_status_idx" ON "public"."supplies" USING "btree" ("doc_status");



CREATE INDEX "supplies_received_at_idx" ON "public"."supplies" USING "btree" ("received_at");



CREATE INDEX "supply_batches_process_status_idx" ON "public"."supply_batches" USING "btree" ("process_status");



CREATE INDEX "supply_batches_product_idx" ON "public"."supply_batches" USING "btree" ("product_id");



CREATE INDEX "supply_batches_quality_idx" ON "public"."supply_batches" USING "btree" ("quality_status");



CREATE INDEX "supply_batches_supply_id_idx" ON "public"."supply_batches" USING "btree" ("supply_id");



CREATE UNIQUE INDEX "supply_document_types_code_idx" ON "public"."supply_document_types" USING "btree" ("code");



CREATE INDEX "supply_documents_document_type_code_idx" ON "public"."supply_documents" USING "btree" ("document_type_code");



CREATE INDEX "supply_documents_supply_id_idx" ON "public"."supply_documents" USING "btree" ("supply_id");



CREATE INDEX "supply_lines_product_id_idx" ON "public"."supply_lines" USING "btree" ("product_id");



CREATE INDEX "supply_lines_supply_id_idx" ON "public"."supply_lines" USING "btree" ("supply_id");



CREATE INDEX "supply_packaging_quality_check_items_packaging_check_id_idx" ON "public"."supply_packaging_quality_check_items" USING "btree" ("packaging_check_id");



CREATE INDEX "supply_packaging_quality_check_items_parameter_id_idx" ON "public"."supply_packaging_quality_check_items" USING "btree" ("parameter_id");



CREATE INDEX "supply_packaging_quality_checks_supply_id_idx" ON "public"."supply_packaging_quality_checks" USING "btree" ("supply_id");



CREATE INDEX "supply_payments_paid_at_idx" ON "public"."supply_payments" USING "btree" ("paid_at" DESC);



CREATE INDEX "supply_payments_supply_id_idx" ON "public"."supply_payments" USING "btree" ("supply_id");



CREATE UNIQUE INDEX "supply_quality_checks_supply_id_idx" ON "public"."supply_quality_checks" USING "btree" ("supply_id");



CREATE INDEX "supply_quality_checks_supply_idx" ON "public"."supply_quality_checks" USING "btree" ("supply_id");



CREATE INDEX "supply_supplier_sign_offs_supply_id_idx" ON "public"."supply_supplier_sign_offs" USING "btree" ("supply_id");



CREATE INDEX "supply_vehicle_inspections_supply_id_idx" ON "public"."supply_vehicle_inspections" USING "btree" ("supply_id");



CREATE OR REPLACE TRIGGER "daily_checks_set_updated_at" BEFORE UPDATE ON "public"."daily_checks" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "guard_packaging_remainder_usage_balance_trg" BEFORE INSERT OR UPDATE ON "public"."process_packaging_remainder_usages" FOR EACH ROW EXECUTE FUNCTION "public"."guard_packaging_remainder_usage_balance"();



CREATE OR REPLACE TRIGGER "guard_packaging_storage_allocation_mutation_trg" BEFORE DELETE OR UPDATE ON "public"."process_packaging_storage_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."guard_packaging_storage_allocation_mutation"();



CREATE OR REPLACE TRIGGER "guard_shipment_pack_item_units_trg" BEFORE INSERT OR UPDATE ON "public"."shipment_pack_items" FOR EACH ROW EXECUTE FUNCTION "public"."guard_shipment_pack_item_units"();



CREATE OR REPLACE TRIGGER "metal_detector_check_sessions_set_updated_at" BEFORE UPDATE ON "public"."metal_detector_check_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "metal_detector_hourly_checks_set_updated_at" BEFORE UPDATE ON "public"."metal_detector_hourly_checks" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_drying_runs_set_updated_at" BEFORE UPDATE ON "public"."process_drying_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_lot_runs_set_updated_at" BEFORE UPDATE ON "public"."process_lot_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_metal_detector_set_updated_at" BEFORE UPDATE ON "public"."process_metal_detector" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_packaging_metal_checks_set_updated_at" BEFORE UPDATE ON "public"."process_packaging_metal_checks" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_packaging_pack_entries_set_updated_at" BEFORE UPDATE ON "public"."process_packaging_pack_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_packaging_runs_set_updated_at" BEFORE UPDATE ON "public"."process_packaging_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_packaging_storage_allocations_set_updated_at" BEFORE UPDATE ON "public"."process_packaging_storage_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_sorting_outputs_set_updated_at" BEFORE UPDATE ON "public"."process_sorting_outputs" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_steps_set_updated_at" BEFORE UPDATE ON "public"."process_steps" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "process_washing_runs_set_updated_at" BEFORE UPDATE ON "public"."process_washing_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "processes_set_updated_at" BEFORE UPDATE ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "product_processes_set_updated_at" BEFORE UPDATE ON "public"."product_processes" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "supply_payments_set_updated_at" BEFORE UPDATE ON "public"."supply_payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();



CREATE OR REPLACE TRIGGER "supply_payments_set_updated_by" BEFORE UPDATE ON "public"."supply_payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_supply_payment_updated_by"();



CREATE OR REPLACE TRIGGER "trg_audit_carriers" AFTER INSERT OR DELETE OR UPDATE ON "public"."carriers" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_customer_contacts" AFTER INSERT OR DELETE OR UPDATE ON "public"."customer_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_customers" AFTER INSERT OR DELETE OR UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_cycle_count_lines" AFTER INSERT OR DELETE OR UPDATE ON "public"."cycle_count_lines" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_cycle_counts" AFTER INSERT OR DELETE OR UPDATE ON "public"."cycle_counts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_documents" AFTER INSERT OR DELETE OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_inventory_adjustments" AFTER INSERT OR DELETE OR UPDATE ON "public"."inventory_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_inventory_movements" AFTER INSERT OR DELETE OR UPDATE ON "public"."inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_packaging_quality_parameters" AFTER INSERT OR DELETE OR UPDATE ON "public"."packaging_quality_parameters" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_process_lot_runs" AFTER INSERT OR DELETE OR UPDATE ON "public"."process_lot_runs" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_process_step_quality_check_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."process_step_quality_check_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_process_steps" AFTER INSERT OR DELETE OR UPDATE ON "public"."process_steps" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_processes" AFTER INSERT OR DELETE OR UPDATE ON "public"."processes" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_product_processes" AFTER INSERT OR DELETE OR UPDATE ON "public"."product_processes" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_products" AFTER INSERT OR DELETE OR UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_quality_parameters" AFTER INSERT OR DELETE OR UPDATE ON "public"."quality_parameters" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_shipment_activities" AFTER INSERT OR DELETE OR UPDATE ON "public"."shipment_activities" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_shipment_contacts" AFTER INSERT OR DELETE OR UPDATE ON "public"."shipment_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_shipment_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."shipment_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_shipment_lot_allocations" AFTER INSERT OR DELETE OR UPDATE ON "public"."shipment_lot_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_shipments" AFTER INSERT OR DELETE OR UPDATE ON "public"."shipments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_stock_levels" AFTER INSERT OR DELETE OR UPDATE ON "public"."stock_levels" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_suppliers" AFTER INSERT OR DELETE OR UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supplies" AFTER INSERT OR DELETE OR UPDATE ON "public"."supplies" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_activities" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_activities" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_batches" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_batches" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_document_types" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_document_types" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_documents" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_documents" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_lines" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_lines" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_packaging_quality_check_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_packaging_quality_check_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_packaging_quality_checks" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_packaging_quality_checks" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_payments" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_payments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_quality_check_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_quality_check_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_quality_checks" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_quality_checks" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_supplier_sign_offs" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_supplier_sign_offs" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_supply_vehicle_inspections" AFTER INSERT OR DELETE OR UPDATE ON "public"."supply_vehicle_inspections" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_units" AFTER INSERT OR DELETE OR UPDATE ON "public"."units" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_user_profiles" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_audit_warehouses" AFTER INSERT OR DELETE OR UPDATE ON "public"."warehouses" FOR EACH ROW EXECUTE FUNCTION "public"."audit_if_write"();



CREATE OR REPLACE TRIGGER "trg_inventory_movements_apply" AFTER INSERT ON "public"."inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."apply_inventory_movement"();



CREATE OR REPLACE TRIGGER "trg_product_components_type_guard" BEFORE INSERT OR UPDATE ON "public"."product_components" FOR EACH ROW EXECUTE FUNCTION "public"."product_components_type_guard"();



CREATE OR REPLACE TRIGGER "trg_shipment_allocation_movement" AFTER INSERT ON "public"."shipment_lot_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."post_allocation_movement"();



CREATE OR REPLACE TRIGGER "trg_validate_document_expiry" BEFORE INSERT OR UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."validate_document_expiry"();



CREATE OR REPLACE TRIGGER "trg_validate_operational_supply_entry_supply_category" BEFORE INSERT OR UPDATE ON "public"."operational_supply_entries" FOR EACH ROW EXECUTE FUNCTION "public"."validate_operational_supply_entry_supply_category"();



CREATE OR REPLACE TRIGGER "trg_validate_packaging_unit_operational_product_type" BEFORE INSERT OR UPDATE ON "public"."packaging_units" FOR EACH ROW EXECUTE FUNCTION "public"."validate_packaging_unit_operational_product_type"();



CREATE OR REPLACE TRIGGER "trigger_auto_create_process_step_runs" AFTER INSERT ON "public"."process_lot_runs" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_process_step_runs"();



ALTER TABLE ONLY "public"."batch_step_transitions"
    ADD CONSTRAINT "batch_step_transitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."batch_step_transitions"
    ADD CONSTRAINT "batch_step_transitions_manufacturing_batch_id_fkey" FOREIGN KEY ("manufacturing_batch_id") REFERENCES "public"."process_lot_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_pack_rules"
    ADD CONSTRAINT "box_pack_rules_box_fkey" FOREIGN KEY ("box_unit_id") REFERENCES "public"."packaging_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."box_pack_rules"
    ADD CONSTRAINT "box_pack_rules_packet_fkey" FOREIGN KEY ("packet_unit_id") REFERENCES "public"."packaging_units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customer_contacts"
    ADD CONSTRAINT "customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cycle_count_lines"
    ADD CONSTRAINT "cycle_count_lines_cycle_count_id_fkey" FOREIGN KEY ("cycle_count_id") REFERENCES "public"."cycle_counts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cycle_count_lines"
    ADD CONSTRAINT "cycle_count_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."supply_batches"("id");



ALTER TABLE ONLY "public"."cycle_count_lines"
    ADD CONSTRAINT "cycle_count_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."cycle_count_lines"
    ADD CONSTRAINT "cycle_count_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."cycle_counts"
    ADD CONSTRAINT "cycle_counts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."daily_checks"
    ADD CONSTRAINT "daily_checks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_document_type_fkey" FOREIGN KEY ("document_type_code") REFERENCES "public"."document_types"("code");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_adjusted_by_fkey" FOREIGN KEY ("adjusted_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."supply_batches"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."inventory_adjustments"
    ADD CONSTRAINT "inventory_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."supply_batches"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."metal_detector_check_sessions"
    ADD CONSTRAINT "metal_detector_check_sessions_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."metal_detector_check_sessions"
    ADD CONSTRAINT "metal_detector_check_sessions_started_from_process_lot_run_fkey" FOREIGN KEY ("started_from_process_lot_run_id") REFERENCES "public"."process_lot_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."metal_detector_check_sessions"
    ADD CONSTRAINT "metal_detector_check_sessions_stopped_by_fkey" FOREIGN KEY ("stopped_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."metal_detector_hourly_checks"
    ADD CONSTRAINT "metal_detector_hourly_checks_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."metal_detector_hourly_checks"
    ADD CONSTRAINT "metal_detector_hourly_checks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."operational_supply_entries"
    ADD CONSTRAINT "operational_supply_entries_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."packaging_units"
    ADD CONSTRAINT "packaging_units_operational_product_id_fkey" FOREIGN KEY ("operational_product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_drying_runs"
    ADD CONSTRAINT "process_drying_runs_process_step_run_id_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_drying_waste"
    ADD CONSTRAINT "process_drying_waste_drying_run_id_fkey" FOREIGN KEY ("drying_run_id") REFERENCES "public"."process_drying_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_foreign_object_rejections"
    ADD CONSTRAINT "process_foreign_object_rejections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."process_metal_detector"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_lot_run_batches"
    ADD CONSTRAINT "process_lot_run_batches_process_lot_run_id_fkey" FOREIGN KEY ("process_lot_run_id") REFERENCES "public"."process_lot_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_lot_run_batches"
    ADD CONSTRAINT "process_lot_run_batches_supply_batch_id_fkey" FOREIGN KEY ("supply_batch_id") REFERENCES "public"."supply_batches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_lot_runs"
    ADD CONSTRAINT "process_lot_runs_original_process_lot_run_id_fkey" FOREIGN KEY ("original_process_lot_run_id") REFERENCES "public"."process_lot_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_lot_runs"
    ADD CONSTRAINT "process_lot_runs_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id");



ALTER TABLE ONLY "public"."process_lot_runs"
    ADD CONSTRAINT "process_lot_runs_supply_batch_id_fkey" FOREIGN KEY ("supply_batch_id") REFERENCES "public"."supply_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_measurements"
    ADD CONSTRAINT "process_measurements_step_run_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_metal_detector"
    ADD CONSTRAINT "process_metal_detector_process_step_run_id_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_metal_detector_waste"
    ADD CONSTRAINT "process_metal_detector_waste_step_run_id_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_non_conformances"
    ADD CONSTRAINT "process_nc_step_run_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id");



ALTER TABLE ONLY "public"."process_packaging_metal_check_rejections"
    ADD CONSTRAINT "process_packaging_metal_check_rejections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_packaging_metal_check_rejections"
    ADD CONSTRAINT "process_packaging_metal_check_rejections_metal_check_id_fkey" FOREIGN KEY ("metal_check_id") REFERENCES "public"."process_packaging_metal_checks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_packaging_metal_checks"
    ADD CONSTRAINT "process_packaging_metal_checks_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_packaging_metal_checks"
    ADD CONSTRAINT "process_packaging_metal_checks_packaging_run_id_fkey" FOREIGN KEY ("packaging_run_id") REFERENCES "public"."process_packaging_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_packaging_metal_checks"
    ADD CONSTRAINT "process_packaging_metal_checks_sorting_output_id_fkey" FOREIGN KEY ("sorting_output_id") REFERENCES "public"."process_sorting_outputs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_packaging_pack_entries"
    ADD CONSTRAINT "process_packaging_pack_entries_metal_check_last_checked_by_fkey" FOREIGN KEY ("metal_check_last_checked_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_packaging_pack_entries"
    ADD CONSTRAINT "process_packaging_pack_entries_metal_check_last_id_fkey" FOREIGN KEY ("metal_check_last_id") REFERENCES "public"."process_packaging_metal_checks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_packaging_pack_entries"
    ADD CONSTRAINT "process_packaging_pack_entries_packaging_run_id_fkey" FOREIGN KEY ("packaging_run_id") REFERENCES "public"."process_packaging_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_packaging_pack_entries"
    ADD CONSTRAINT "process_packaging_pack_entries_packet_unit_code_fkey" FOREIGN KEY ("packet_unit_code") REFERENCES "public"."packaging_units"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_packaging_pack_entries"
    ADD CONSTRAINT "process_packaging_pack_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_packaging_pack_entries"
    ADD CONSTRAINT "process_packaging_pack_entries_sorting_output_id_fkey" FOREIGN KEY ("sorting_output_id") REFERENCES "public"."process_sorting_outputs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_packaging_photos"
    ADD CONSTRAINT "process_packaging_photos_packaging_run_id_fkey" FOREIGN KEY ("packaging_run_id") REFERENCES "public"."process_packaging_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_packaging_remainder_usages"
    ADD CONSTRAINT "process_packaging_remainder_usages_consumer_pack_entry_id_fkey" FOREIGN KEY ("consumer_pack_entry_id") REFERENCES "public"."process_packaging_pack_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_packaging_remainder_usages"
    ADD CONSTRAINT "process_packaging_remainder_usages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_packaging_remainder_usages"
    ADD CONSTRAINT "process_packaging_remainder_usages_source_pack_entry_id_fkey" FOREIGN KEY ("source_pack_entry_id") REFERENCES "public"."process_packaging_pack_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_packaging_runs"
    ADD CONSTRAINT "process_packaging_runs_process_step_run_id_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_packaging_storage_allocations"
    ADD CONSTRAINT "process_packaging_storage_allocations_box_unit_code_fkey" FOREIGN KEY ("box_unit_code") REFERENCES "public"."packaging_units"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_packaging_storage_allocations"
    ADD CONSTRAINT "process_packaging_storage_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_packaging_storage_allocations"
    ADD CONSTRAINT "process_packaging_storage_allocations_pack_entry_id_fkey" FOREIGN KEY ("pack_entry_id") REFERENCES "public"."process_packaging_pack_entries"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_packaging_storage_allocations"
    ADD CONSTRAINT "process_packaging_storage_allocations_packaging_run_id_fkey" FOREIGN KEY ("packaging_run_id") REFERENCES "public"."process_packaging_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_packaging_waste"
    ADD CONSTRAINT "process_packaging_waste_packaging_run_id_fkey" FOREIGN KEY ("packaging_run_id") REFERENCES "public"."process_packaging_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_packaging_weight_checks"
    ADD CONSTRAINT "process_packaging_weight_checks_packaging_run_id_fkey" FOREIGN KEY ("packaging_run_id") REFERENCES "public"."process_packaging_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_qc_checks"
    ADD CONSTRAINT "process_qc_checks_step_run_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id");



ALTER TABLE ONLY "public"."process_quality_parameters"
    ADD CONSTRAINT "process_quality_parameters_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_quality_parameters"
    ADD CONSTRAINT "process_quality_parameters_quality_parameter_id_fkey" FOREIGN KEY ("quality_parameter_id") REFERENCES "public"."quality_parameters"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_signoffs"
    ADD CONSTRAINT "process_signoffs_lot_fkey" FOREIGN KEY ("process_lot_run_id") REFERENCES "public"."process_lot_runs"("id");



ALTER TABLE ONLY "public"."process_sorting_outputs"
    ADD CONSTRAINT "process_sorting_outputs_process_step_run_id_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_sorting_outputs"
    ADD CONSTRAINT "process_sorting_outputs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_sorting_waste"
    ADD CONSTRAINT "process_sorting_waste_sorting_run_id_fkey" FOREIGN KEY ("sorting_run_id") REFERENCES "public"."process_sorting_outputs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_step_quality_check_items"
    ADD CONSTRAINT "process_step_quality_check_items_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."quality_parameters"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_step_quality_check_items"
    ADD CONSTRAINT "process_step_quality_check_items_quality_check_id_fkey" FOREIGN KEY ("quality_check_id") REFERENCES "public"."process_step_quality_checks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_step_quality_checks"
    ADD CONSTRAINT "process_step_quality_checks_evaluated_by_fkey" FOREIGN KEY ("evaluated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."process_step_quality_checks"
    ADD CONSTRAINT "process_step_quality_checks_process_step_run_id_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_step_quality_parameters"
    ADD CONSTRAINT "process_step_quality_parameters_process_step_id_fkey" FOREIGN KEY ("process_step_id") REFERENCES "public"."process_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_step_quality_parameters"
    ADD CONSTRAINT "process_step_quality_parameters_quality_parameter_id_fkey" FOREIGN KEY ("quality_parameter_id") REFERENCES "public"."quality_parameters"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."process_step_runs"
    ADD CONSTRAINT "process_step_runs_lot_fkey" FOREIGN KEY ("process_lot_run_id") REFERENCES "public"."process_lot_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_step_runs"
    ADD CONSTRAINT "process_step_runs_skipped_by_fkey" FOREIGN KEY ("skipped_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."process_step_runs"
    ADD CONSTRAINT "process_step_runs_step_fkey" FOREIGN KEY ("process_step_id") REFERENCES "public"."process_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_steps"
    ADD CONSTRAINT "process_steps_default_location_id_fkey" FOREIGN KEY ("default_location_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."process_steps"
    ADD CONSTRAINT "process_steps_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_steps"
    ADD CONSTRAINT "process_steps_step_name_fkey" FOREIGN KEY ("step_name_id") REFERENCES "public"."process_step_names"("id");



ALTER TABLE ONLY "public"."process_washing_runs"
    ADD CONSTRAINT "process_washing_runs_process_step_run_id_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."process_washing_waste"
    ADD CONSTRAINT "process_washing_waste_washing_run_id_fkey" FOREIGN KEY ("washing_run_id") REFERENCES "public"."process_washing_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_components"
    ADD CONSTRAINT "product_components_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_components"
    ADD CONSTRAINT "product_components_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_processes"
    ADD CONSTRAINT "product_processes_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_processes"
    ADD CONSTRAINT "product_processes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_lot_fkey" FOREIGN KEY ("process_lot_run_id") REFERENCES "public"."process_lot_runs"("id");



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_supply_batch_id_fkey" FOREIGN KEY ("supply_batch_id") REFERENCES "public"."supply_batches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."reworked_lots"
    ADD CONSTRAINT "reworked_lots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reworked_lots"
    ADD CONSTRAINT "reworked_lots_original_supply_batch_id_fkey" FOREIGN KEY ("original_supply_batch_id") REFERENCES "public"."supply_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reworked_lots"
    ADD CONSTRAINT "reworked_lots_process_step_run_id_fkey" FOREIGN KEY ("process_step_run_id") REFERENCES "public"."process_step_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reworked_lots"
    ADD CONSTRAINT "reworked_lots_rework_supply_batch_id_fkey" FOREIGN KEY ("rework_supply_batch_id") REFERENCES "public"."supply_batches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reworked_lots"
    ADD CONSTRAINT "reworked_lots_sorting_output_id_fkey" FOREIGN KEY ("sorting_output_id") REFERENCES "public"."process_sorting_outputs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shipment_activities"
    ADD CONSTRAINT "shipment_activities_actor_fkey" FOREIGN KEY ("actor") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."shipment_activities"
    ADD CONSTRAINT "shipment_activities_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipment_contacts"
    ADD CONSTRAINT "shipment_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."customer_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipment_contacts"
    ADD CONSTRAINT "shipment_contacts_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipment_items"
    ADD CONSTRAINT "shipment_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."shipment_items"
    ADD CONSTRAINT "shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipment_items"
    ADD CONSTRAINT "shipment_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."shipment_lot_allocations"
    ADD CONSTRAINT "shipment_lot_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."supply_batches"("id");



ALTER TABLE ONLY "public"."shipment_lot_allocations"
    ADD CONSTRAINT "shipment_lot_allocations_shipment_item_id_fkey" FOREIGN KEY ("shipment_item_id") REFERENCES "public"."shipment_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipment_pack_items"
    ADD CONSTRAINT "shipment_pack_items_pack_entry_id_fkey" FOREIGN KEY ("pack_entry_id") REFERENCES "public"."process_packaging_pack_entries"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."shipment_pack_items"
    ADD CONSTRAINT "shipment_pack_items_packaging_allocation_id_fkey" FOREIGN KEY ("packaging_allocation_id") REFERENCES "public"."process_packaging_storage_allocations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."shipment_pack_items"
    ADD CONSTRAINT "shipment_pack_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id");



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."shipments"
    ADD CONSTRAINT "shipments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."stock_levels"
    ADD CONSTRAINT "stock_levels_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."supply_batches"("id");



ALTER TABLE ONLY "public"."stock_levels"
    ADD CONSTRAINT "stock_levels_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."stock_levels"
    ADD CONSTRAINT "stock_levels_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."supplier_types"
    ADD CONSTRAINT "supplier_types_category_fkey" FOREIGN KEY ("category_code") REFERENCES "public"."supplier_categories"("code");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_supplier_type_fkey" FOREIGN KEY ("supplier_type") REFERENCES "public"."supplier_types"("code");



ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_category_code_fkey" FOREIGN KEY ("category_code") REFERENCES "public"."supplier_categories"("code");



ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."supplies"
    ADD CONSTRAINT "supplies_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id");



ALTER TABLE ONLY "public"."supply_activities"
    ADD CONSTRAINT "supply_activities_actor_fkey" FOREIGN KEY ("actor") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."supply_activities"
    ADD CONSTRAINT "supply_activities_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_batches"
    ADD CONSTRAINT "supply_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."supply_batches"
    ADD CONSTRAINT "supply_batches_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_batches"
    ADD CONSTRAINT "supply_batches_supply_line_id_fkey" FOREIGN KEY ("supply_line_id") REFERENCES "public"."supply_lines"("id");



ALTER TABLE ONLY "public"."supply_batches"
    ADD CONSTRAINT "supply_batches_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."supply_documents"
    ADD CONSTRAINT "supply_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supply_documents"
    ADD CONSTRAINT "supply_documents_document_type_code_fkey" FOREIGN KEY ("document_type_code") REFERENCES "public"."supply_document_types"("code") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."supply_documents"
    ADD CONSTRAINT "supply_documents_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_lines"
    ADD CONSTRAINT "supply_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."supply_lines"
    ADD CONSTRAINT "supply_lines_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_lines"
    ADD CONSTRAINT "supply_lines_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."supply_packaging_quality_check_items"
    ADD CONSTRAINT "supply_packaging_quality_check_items_packaging_check_id_fkey" FOREIGN KEY ("packaging_check_id") REFERENCES "public"."supply_packaging_quality_checks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_packaging_quality_check_items"
    ADD CONSTRAINT "supply_packaging_quality_check_items_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."packaging_quality_parameters"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."supply_packaging_quality_checks"
    ADD CONSTRAINT "supply_packaging_quality_checks_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supply_packaging_quality_checks"
    ADD CONSTRAINT "supply_packaging_quality_checks_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_payments"
    ADD CONSTRAINT "supply_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supply_payments"
    ADD CONSTRAINT "supply_payments_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_payments"
    ADD CONSTRAINT "supply_payments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supply_quality_check_items"
    ADD CONSTRAINT "supply_quality_check_items_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "public"."quality_parameters"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."supply_quality_check_items"
    ADD CONSTRAINT "supply_quality_check_items_quality_check_id_fkey" FOREIGN KEY ("quality_check_id") REFERENCES "public"."supply_quality_checks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_quality_checks"
    ADD CONSTRAINT "supply_quality_checks_evaluated_by_fkey" FOREIGN KEY ("evaluated_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."supply_quality_checks"
    ADD CONSTRAINT "supply_quality_checks_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."supply_batches"("id");



ALTER TABLE ONLY "public"."supply_quality_checks"
    ADD CONSTRAINT "supply_quality_checks_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."supply_quality_checks"
    ADD CONSTRAINT "supply_quality_checks_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_supplier_sign_offs"
    ADD CONSTRAINT "supply_supplier_sign_offs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supply_supplier_sign_offs"
    ADD CONSTRAINT "supply_supplier_sign_offs_signed_by_user_id_fkey" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supply_supplier_sign_offs"
    ADD CONSTRAINT "supply_supplier_sign_offs_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supply_vehicle_inspections"
    ADD CONSTRAINT "supply_vehicle_inspections_inspected_by_fkey" FOREIGN KEY ("inspected_by") REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supply_vehicle_inspections"
    ADD CONSTRAINT "supply_vehicle_inspections_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."packaging_quality_parameters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "packaging_quality_parameters_read_access" ON "public"."packaging_quality_parameters" FOR SELECT TO "authenticated", "anon", "service_role" USING (true);



CREATE POLICY "supplies_admin_write" ON "public"."supplies" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."auth_user_id" = "auth"."uid"()) AND ("up"."role" = ANY (ARRAY['admin'::"text", 'planner'::"text"]))))));



CREATE POLICY "supplies_read_authenticated" ON "public"."supplies" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."supply_packaging_quality_check_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supply_packaging_quality_check_items_full_access" ON "public"."supply_packaging_quality_check_items" TO "authenticated", "anon", "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."supply_packaging_quality_checks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supply_packaging_quality_checks_full_access" ON "public"."supply_packaging_quality_checks" TO "authenticated", "anon", "service_role" USING (true) WITH CHECK (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."accept_batch"("p_batch_id" bigint, "p_accept_qty" numeric, "p_warehouse_id" bigint, "p_actor" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_batch"("p_batch_id" bigint, "p_accept_qty" numeric, "p_warehouse_id" bigint, "p_actor" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_batch"("p_batch_id" bigint, "p_accept_qty" numeric, "p_warehouse_id" bigint, "p_actor" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_inventory_movement"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_inventory_movement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_inventory_movement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_if_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_if_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_if_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_create_process_step_runs"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_create_process_step_runs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_create_process_step_runs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_step"("p_batch_id" bigint, "p_step_id" bigint, "p_operator_id" bigint, "p_equipment_id" bigint, "p_input_qty" numeric, "p_output_qty" numeric, "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_step"("p_batch_id" bigint, "p_step_id" bigint, "p_operator_id" bigint, "p_equipment_id" bigint, "p_input_qty" numeric, "p_output_qty" numeric, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_step"("p_batch_id" bigint, "p_step_id" bigint, "p_operator_id" bigint, "p_equipment_id" bigint, "p_input_qty" numeric, "p_output_qty" numeric, "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_box_pack_rule"("p_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."delete_box_pack_rule"("p_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_box_pack_rule"("p_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_apply_stock_movement"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_apply_stock_movement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_apply_stock_movement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_batch_event_chain_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_batch_event_chain_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_batch_event_chain_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_check_second_local_packaging"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_check_second_local_packaging"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_check_second_local_packaging"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_qc_event_chain_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_qc_event_chain_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_qc_event_chain_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_box_pack_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_box_pack_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_box_pack_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_packaging_units"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_packaging_units"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_packaging_units"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_supplier_countries"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_supplier_countries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_supplier_countries"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_supplier_detail"("p_supplier_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_supplier_detail"("p_supplier_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_supplier_detail"("p_supplier_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_suppliers_list"("p_search" "text", "p_type" "text", "p_country" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_suppliers_list"("p_search" "text", "p_type" "text", "p_country" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_suppliers_list"("p_search" "text", "p_type" "text", "p_country" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_packaging_remainder_usage_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_packaging_remainder_usage_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_packaging_remainder_usage_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_packaging_storage_allocation_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_packaging_storage_allocation_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_packaging_storage_allocation_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_shipment_pack_item_units"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_shipment_pack_item_units"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_shipment_pack_item_units"() TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_process_lot_run_steps"("lot_run_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_process_lot_run_steps"("lot_run_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_process_lot_run_steps"("lot_run_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."next_shipment_doc_no"() TO "anon";
GRANT ALL ON FUNCTION "public"."next_shipment_doc_no"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_shipment_doc_no"() TO "service_role";



GRANT ALL ON FUNCTION "public"."next_supply_doc_no"() TO "anon";
GRANT ALL ON FUNCTION "public"."next_supply_doc_no"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_supply_doc_no"() TO "service_role";



GRANT ALL ON FUNCTION "public"."post_allocation_movement"() TO "anon";
GRANT ALL ON FUNCTION "public"."post_allocation_movement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_allocation_movement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."product_components_type_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."product_components_type_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."product_components_type_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."receive_batch"("p_supplier_id" bigint, "p_warehouse_id" bigint, "p_doc_no" "text", "p_product_id" bigint, "p_unit_id" bigint, "p_lot_no" "text", "p_received_qty" numeric, "p_received_units" integer, "p_received_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."receive_batch"("p_supplier_id" bigint, "p_warehouse_id" bigint, "p_doc_no" "text", "p_product_id" bigint, "p_unit_id" bigint, "p_lot_no" "text", "p_received_qty" numeric, "p_received_units" integer, "p_received_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_batch"("p_supplier_id" bigint, "p_warehouse_id" bigint, "p_doc_no" "text", "p_product_id" bigint, "p_unit_id" bigint, "p_lot_no" "text", "p_received_qty" numeric, "p_received_units" integer, "p_received_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_box_pack_rule_active"("p_id" integer, "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_box_pack_rule_active"("p_id" integer, "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_box_pack_rule_active"("p_id" integer, "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_timestamp_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_packaging_unit_active"("p_id" integer, "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_packaging_unit_active"("p_id" integer, "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_packaging_unit_active"("p_id" integer, "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_supply_payment_updated_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_supply_payment_updated_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_supply_payment_updated_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_box_pack_rule"("p_id" integer, "p_box_unit_id" integer, "p_packet_unit_id" integer, "p_packets_per_box" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_box_pack_rule"("p_id" integer, "p_box_unit_id" integer, "p_packet_unit_id" integer, "p_packets_per_box" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_box_pack_rule"("p_id" integer, "p_box_unit_id" integer, "p_packet_unit_id" integer, "p_packets_per_box" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_packaging_unit"("p_id" integer, "p_code" "text", "p_name" "text", "p_unit_type" "text", "p_packaging_type" "text", "p_net_weight_kg" numeric, "p_length_mm" integer, "p_width_mm" integer, "p_height_mm" integer, "p_operational_product_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_packaging_unit"("p_id" integer, "p_code" "text", "p_name" "text", "p_unit_type" "text", "p_packaging_type" "text", "p_net_weight_kg" numeric, "p_length_mm" integer, "p_width_mm" integer, "p_height_mm" integer, "p_operational_product_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_packaging_unit"("p_id" integer, "p_code" "text", "p_name" "text", "p_unit_type" "text", "p_packaging_type" "text", "p_net_weight_kg" numeric, "p_length_mm" integer, "p_width_mm" integer, "p_height_mm" integer, "p_operational_product_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_stock_level"("p_product_id" integer, "p_warehouse_id" integer, "p_lot_id" bigint, "p_on_hand_delta" numeric, "p_allocated_delta" numeric, "p_quality_delta" numeric, "p_transit_delta" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_stock_level"("p_product_id" integer, "p_warehouse_id" integer, "p_lot_id" bigint, "p_on_hand_delta" numeric, "p_allocated_delta" numeric, "p_quality_delta" numeric, "p_transit_delta" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_stock_level"("p_product_id" integer, "p_warehouse_id" integer, "p_lot_id" bigint, "p_on_hand_delta" numeric, "p_allocated_delta" numeric, "p_quality_delta" numeric, "p_transit_delta" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_document_expiry"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_document_expiry"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_document_expiry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_operational_supply_entry_supply_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_operational_supply_entry_supply_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_operational_supply_entry_supply_category"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_packaging_unit_operational_product_type"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_packaging_unit_operational_product_type"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_packaging_unit_operational_product_type"() TO "service_role";


















GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."batch_step_transitions" TO "anon";
GRANT ALL ON TABLE "public"."batch_step_transitions" TO "authenticated";
GRANT ALL ON TABLE "public"."batch_step_transitions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."batch_step_transitions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."batch_step_transitions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."batch_step_transitions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."box_pack_rules" TO "anon";
GRANT ALL ON TABLE "public"."box_pack_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."box_pack_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."box_pack_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."box_pack_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."box_pack_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."carriers" TO "anon";
GRANT ALL ON TABLE "public"."carriers" TO "authenticated";
GRANT ALL ON TABLE "public"."carriers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."carriers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."carriers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."carriers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."customer_contacts" TO "anon";
GRANT ALL ON TABLE "public"."customer_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_contacts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."customer_contacts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."customer_contacts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."customer_contacts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."customers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."customers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."customers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cycle_count_lines" TO "anon";
GRANT ALL ON TABLE "public"."cycle_count_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."cycle_count_lines" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cycle_count_lines_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cycle_count_lines_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cycle_count_lines_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cycle_counts" TO "anon";
GRANT ALL ON TABLE "public"."cycle_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."cycle_counts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cycle_counts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cycle_counts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cycle_counts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."daily_checks" TO "anon";
GRANT ALL ON TABLE "public"."daily_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_checks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."document_types" TO "anon";
GRANT ALL ON TABLE "public"."document_types" TO "authenticated";
GRANT ALL ON TABLE "public"."document_types" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_adjustments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inventory_adjustments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inventory_adjustments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventory_adjustments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."inventory_movements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."inventory_movements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."inventory_movements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."metal_detector_check_sessions" TO "anon";
GRANT ALL ON TABLE "public"."metal_detector_check_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."metal_detector_check_sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."metal_detector_check_sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."metal_detector_check_sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."metal_detector_check_sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."metal_detector_hourly_checks" TO "anon";
GRANT ALL ON TABLE "public"."metal_detector_hourly_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."metal_detector_hourly_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."metal_detector_hourly_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."metal_detector_hourly_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."metal_detector_hourly_checks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."operational_supply_entries" TO "anon";
GRANT ALL ON TABLE "public"."operational_supply_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_supply_entries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."operational_supply_entries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."operational_supply_entries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."operational_supply_entries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."packaging_quality_parameters" TO "anon";
GRANT ALL ON TABLE "public"."packaging_quality_parameters" TO "authenticated";
GRANT ALL ON TABLE "public"."packaging_quality_parameters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."packaging_quality_parameters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."packaging_quality_parameters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."packaging_quality_parameters_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."packaging_units" TO "anon";
GRANT ALL ON TABLE "public"."packaging_units" TO "authenticated";
GRANT ALL ON TABLE "public"."packaging_units" TO "service_role";



GRANT ALL ON SEQUENCE "public"."packaging_units_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."packaging_units_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."packaging_units_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_drying_runs" TO "anon";
GRANT ALL ON TABLE "public"."process_drying_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."process_drying_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_drying_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_drying_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_drying_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_drying_waste" TO "anon";
GRANT ALL ON TABLE "public"."process_drying_waste" TO "authenticated";
GRANT ALL ON TABLE "public"."process_drying_waste" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_drying_waste_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_drying_waste_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_drying_waste_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_foreign_object_rejections" TO "anon";
GRANT ALL ON TABLE "public"."process_foreign_object_rejections" TO "authenticated";
GRANT ALL ON TABLE "public"."process_foreign_object_rejections" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_foreign_object_rejections_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_foreign_object_rejections_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_foreign_object_rejections_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_lot_run_batches" TO "anon";
GRANT ALL ON TABLE "public"."process_lot_run_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."process_lot_run_batches" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_lot_run_batches_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_lot_run_batches_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_lot_run_batches_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_lot_runs" TO "anon";
GRANT ALL ON TABLE "public"."process_lot_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."process_lot_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_lot_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_lot_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_lot_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_measurements" TO "anon";
GRANT ALL ON TABLE "public"."process_measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."process_measurements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_measurements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_measurements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_measurements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_metal_detector" TO "anon";
GRANT ALL ON TABLE "public"."process_metal_detector" TO "authenticated";
GRANT ALL ON TABLE "public"."process_metal_detector" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_metal_detector_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_metal_detector_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_metal_detector_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_metal_detector_waste" TO "anon";
GRANT ALL ON TABLE "public"."process_metal_detector_waste" TO "authenticated";
GRANT ALL ON TABLE "public"."process_metal_detector_waste" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_metal_detector_waste_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_metal_detector_waste_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_metal_detector_waste_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_non_conformances" TO "anon";
GRANT ALL ON TABLE "public"."process_non_conformances" TO "authenticated";
GRANT ALL ON TABLE "public"."process_non_conformances" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_non_conformances_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_non_conformances_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_non_conformances_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_packaging_metal_check_rejections" TO "anon";
GRANT ALL ON TABLE "public"."process_packaging_metal_check_rejections" TO "authenticated";
GRANT ALL ON TABLE "public"."process_packaging_metal_check_rejections" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_packaging_metal_check_rejections_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_packaging_metal_check_rejections_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_packaging_metal_check_rejections_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_packaging_metal_checks" TO "anon";
GRANT ALL ON TABLE "public"."process_packaging_metal_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."process_packaging_metal_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_packaging_metal_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_packaging_metal_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_packaging_metal_checks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_packaging_pack_entries" TO "anon";
GRANT ALL ON TABLE "public"."process_packaging_pack_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."process_packaging_pack_entries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_packaging_pack_entries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_packaging_pack_entries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_packaging_pack_entries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_packaging_photos" TO "anon";
GRANT ALL ON TABLE "public"."process_packaging_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."process_packaging_photos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_packaging_photos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_packaging_photos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_packaging_photos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_packaging_remainder_usages" TO "anon";
GRANT ALL ON TABLE "public"."process_packaging_remainder_usages" TO "authenticated";
GRANT ALL ON TABLE "public"."process_packaging_remainder_usages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_packaging_remainder_usages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_packaging_remainder_usages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_packaging_remainder_usages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_packaging_runs" TO "anon";
GRANT ALL ON TABLE "public"."process_packaging_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."process_packaging_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_packaging_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_packaging_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_packaging_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_packaging_storage_allocations" TO "anon";
GRANT ALL ON TABLE "public"."process_packaging_storage_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."process_packaging_storage_allocations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_packaging_storage_allocations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_packaging_storage_allocations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_packaging_storage_allocations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_packaging_waste" TO "anon";
GRANT ALL ON TABLE "public"."process_packaging_waste" TO "authenticated";
GRANT ALL ON TABLE "public"."process_packaging_waste" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_packaging_waste_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_packaging_waste_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_packaging_waste_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_packaging_weight_checks" TO "anon";
GRANT ALL ON TABLE "public"."process_packaging_weight_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."process_packaging_weight_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_packaging_weight_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_packaging_weight_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_packaging_weight_checks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_qc_checks" TO "anon";
GRANT ALL ON TABLE "public"."process_qc_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."process_qc_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_qc_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_qc_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_qc_checks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_quality_parameters" TO "anon";
GRANT ALL ON TABLE "public"."process_quality_parameters" TO "authenticated";
GRANT ALL ON TABLE "public"."process_quality_parameters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_quality_parameters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_quality_parameters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_quality_parameters_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_signoffs" TO "anon";
GRANT ALL ON TABLE "public"."process_signoffs" TO "authenticated";
GRANT ALL ON TABLE "public"."process_signoffs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_signoffs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_signoffs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_signoffs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_sorting_outputs" TO "anon";
GRANT ALL ON TABLE "public"."process_sorting_outputs" TO "authenticated";
GRANT ALL ON TABLE "public"."process_sorting_outputs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_sorting_outputs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_sorting_outputs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_sorting_outputs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_sorting_waste" TO "anon";
GRANT ALL ON TABLE "public"."process_sorting_waste" TO "authenticated";
GRANT ALL ON TABLE "public"."process_sorting_waste" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_sorting_waste_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_sorting_waste_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_sorting_waste_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_step_names" TO "anon";
GRANT ALL ON TABLE "public"."process_step_names" TO "authenticated";
GRANT ALL ON TABLE "public"."process_step_names" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_step_names_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_step_names_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_step_names_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_step_quality_check_items" TO "anon";
GRANT ALL ON TABLE "public"."process_step_quality_check_items" TO "authenticated";
GRANT ALL ON TABLE "public"."process_step_quality_check_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_step_quality_check_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_step_quality_check_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_step_quality_check_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_step_quality_checks" TO "anon";
GRANT ALL ON TABLE "public"."process_step_quality_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."process_step_quality_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_step_quality_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_step_quality_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_step_quality_checks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_step_quality_parameters" TO "anon";
GRANT ALL ON TABLE "public"."process_step_quality_parameters" TO "authenticated";
GRANT ALL ON TABLE "public"."process_step_quality_parameters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_step_quality_parameters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_step_quality_parameters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_step_quality_parameters_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_step_runs" TO "anon";
GRANT ALL ON TABLE "public"."process_step_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."process_step_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_step_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_step_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_step_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_steps" TO "anon";
GRANT ALL ON TABLE "public"."process_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."process_steps" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_steps_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_steps_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_steps_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_washing_runs" TO "anon";
GRANT ALL ON TABLE "public"."process_washing_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."process_washing_runs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_washing_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_washing_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_washing_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."process_washing_waste" TO "anon";
GRANT ALL ON TABLE "public"."process_washing_waste" TO "authenticated";
GRANT ALL ON TABLE "public"."process_washing_waste" TO "service_role";



GRANT ALL ON SEQUENCE "public"."process_washing_waste_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."process_washing_waste_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."process_washing_waste_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."processes" TO "anon";
GRANT ALL ON TABLE "public"."processes" TO "authenticated";
GRANT ALL ON TABLE "public"."processes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."processes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."processes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."processes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_components" TO "anon";
GRANT ALL ON TABLE "public"."product_components" TO "authenticated";
GRANT ALL ON TABLE "public"."product_components" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_components_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_components_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_components_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_processes" TO "anon";
GRANT ALL ON TABLE "public"."product_processes" TO "authenticated";
GRANT ALL ON TABLE "public"."product_processes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."product_processes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."product_processes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."product_processes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."production_batches" TO "anon";
GRANT ALL ON TABLE "public"."production_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."production_batches" TO "service_role";



GRANT ALL ON SEQUENCE "public"."production_batches_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."production_batches_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."production_batches_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."products_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."quality_parameters" TO "anon";
GRANT ALL ON TABLE "public"."quality_parameters" TO "authenticated";
GRANT ALL ON TABLE "public"."quality_parameters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."quality_parameters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."quality_parameters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."quality_parameters_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."recent_audit" TO "anon";
GRANT ALL ON TABLE "public"."recent_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_audit" TO "service_role";



GRANT ALL ON TABLE "public"."reworked_lots" TO "anon";
GRANT ALL ON TABLE "public"."reworked_lots" TO "authenticated";
GRANT ALL ON TABLE "public"."reworked_lots" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reworked_lots_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reworked_lots_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reworked_lots_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shipment_activities" TO "anon";
GRANT ALL ON TABLE "public"."shipment_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."shipment_activities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shipment_activities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shipment_activities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shipment_activities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shipment_contacts" TO "anon";
GRANT ALL ON TABLE "public"."shipment_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."shipment_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."shipment_items" TO "anon";
GRANT ALL ON TABLE "public"."shipment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."shipment_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shipment_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shipment_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shipment_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shipment_lot_allocations" TO "anon";
GRANT ALL ON TABLE "public"."shipment_lot_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."shipment_lot_allocations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shipment_lot_allocations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shipment_lot_allocations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shipment_lot_allocations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shipment_pack_items" TO "anon";
GRANT ALL ON TABLE "public"."shipment_pack_items" TO "authenticated";
GRANT ALL ON TABLE "public"."shipment_pack_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shipment_pack_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shipment_pack_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shipment_pack_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."shipments" TO "anon";
GRANT ALL ON TABLE "public"."shipments" TO "authenticated";
GRANT ALL ON TABLE "public"."shipments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shipments_doc_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shipments_doc_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shipments_doc_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shipments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shipments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shipments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."stock_levels" TO "anon";
GRANT ALL ON TABLE "public"."stock_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_levels" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stock_levels_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_levels_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_levels_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_categories" TO "anon";
GRANT ALL ON TABLE "public"."supplier_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_categories" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_types" TO "anon";
GRANT ALL ON TABLE "public"."supplier_types" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_types" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supplies" TO "anon";
GRANT ALL ON TABLE "public"."supplies" TO "authenticated";
GRANT ALL ON TABLE "public"."supplies" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supplies_doc_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supplies_doc_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supplies_doc_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supplies_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supplies_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supplies_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_activities" TO "anon";
GRANT ALL ON TABLE "public"."supply_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_activities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_activities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_activities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_activities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_batches" TO "anon";
GRANT ALL ON TABLE "public"."supply_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_batches" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_batches_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_batches_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_batches_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_document_types" TO "anon";
GRANT ALL ON TABLE "public"."supply_document_types" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_document_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_document_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_document_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_document_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_documents" TO "anon";
GRANT ALL ON TABLE "public"."supply_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_documents_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_documents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_documents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_lines" TO "anon";
GRANT ALL ON TABLE "public"."supply_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_lines" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_lines_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_lines_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_lines_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_packaging_quality_check_items" TO "anon";
GRANT ALL ON TABLE "public"."supply_packaging_quality_check_items" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_packaging_quality_check_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_packaging_quality_check_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_packaging_quality_check_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_packaging_quality_check_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_packaging_quality_checks" TO "anon";
GRANT ALL ON TABLE "public"."supply_packaging_quality_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_packaging_quality_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_packaging_quality_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_packaging_quality_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_packaging_quality_checks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_payments" TO "anon";
GRANT ALL ON TABLE "public"."supply_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_payments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_payments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_payments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_payments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_quality_check_items" TO "anon";
GRANT ALL ON TABLE "public"."supply_quality_check_items" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_quality_check_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_quality_check_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_quality_check_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_quality_check_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_quality_checks" TO "anon";
GRANT ALL ON TABLE "public"."supply_quality_checks" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_quality_checks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_quality_checks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_quality_checks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_quality_checks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_supplier_sign_offs" TO "anon";
GRANT ALL ON TABLE "public"."supply_supplier_sign_offs" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_supplier_sign_offs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_supplier_sign_offs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_supplier_sign_offs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_supplier_sign_offs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."supply_vehicle_inspections" TO "anon";
GRANT ALL ON TABLE "public"."supply_vehicle_inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."supply_vehicle_inspections" TO "service_role";



GRANT ALL ON SEQUENCE "public"."supply_vehicle_inspections_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."supply_vehicle_inspections_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."supply_vehicle_inspections_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";



GRANT ALL ON SEQUENCE "public"."units_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."units_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."units_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."warehouses" TO "anon";
GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouses" TO "service_role";



GRANT ALL ON TABLE "public"."vw_inventory_summary" TO "anon";
GRANT ALL ON TABLE "public"."vw_inventory_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_inventory_summary" TO "service_role";



GRANT ALL ON SEQUENCE "public"."warehouses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."warehouses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."warehouses_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































