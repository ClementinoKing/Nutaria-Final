-- Migration script to convert existing process_lot_runs.step_progress JSONB data
-- to process_step_runs relational records

-- Function to migrate a single process lot run's step_progress JSONB to process_step_runs
CREATE OR REPLACE FUNCTION migrate_process_lot_run_steps(lot_run_id bigint)
RETURNS TABLE(
  migrated_count integer,
  skipped_count integer,
  errors text[]
) AS $$
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
$$ LANGUAGE plpgsql;

-- Migrate all existing process lot runs
DO $$
DECLARE
  lot_run_record record;
  migration_result record;
  total_migrated integer := 0;
  total_skipped integer := 0;
  all_errors text[] := ARRAY[]::text[];
BEGIN
  -- Loop through all process_lot_runs that have step_progress JSONB data
  FOR lot_run_record IN 
    SELECT id 
    FROM process_lot_runs 
    WHERE step_progress IS NOT NULL 
      AND jsonb_typeof(step_progress) = 'array'
      AND jsonb_array_length(step_progress) > 0
      -- Only migrate if no process_step_runs exist yet for this lot run
      AND NOT EXISTS (
        SELECT 1 FROM process_step_runs WHERE process_lot_run_id = process_lot_runs.id
      )
  LOOP
    SELECT * INTO migration_result 
    FROM migrate_process_lot_run_steps(lot_run_record.id);
    
    total_migrated := total_migrated + (migration_result.migrated_count);
    total_skipped := total_skipped + (migration_result.skipped_count);
    
    IF migration_result.errors IS NOT NULL THEN
      all_errors := array_cat(all_errors, migration_result.errors);
    END IF;
  END LOOP;

  -- Log migration results
  RAISE NOTICE 'Migration completed:';
  RAISE NOTICE '  Total migrated: %', total_migrated;
  RAISE NOTICE '  Total skipped: %', total_skipped;
  RAISE NOTICE '  Errors: %', array_length(all_errors, 1);
END;
$$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS process_step_runs_lot_status_idx 
  ON process_step_runs(process_lot_run_id, status);

CREATE INDEX IF NOT EXISTS process_measurements_step_run_idx 
  ON process_measurements(process_step_run_id);

CREATE INDEX IF NOT EXISTS process_non_conformances_step_run_resolved_idx 
  ON process_non_conformances(process_step_run_id, resolved);

-- Add function to auto-create process_step_runs when process_lot_run is created
CREATE OR REPLACE FUNCTION auto_create_process_step_runs()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate step runs
DROP TRIGGER IF EXISTS trigger_auto_create_process_step_runs ON process_lot_runs;
CREATE TRIGGER trigger_auto_create_process_step_runs
  AFTER INSERT ON process_lot_runs
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_process_step_runs();
