-- Fix the auto_create_process_step_runs function to remove the non-existent seq column
-- The seq column exists in process_steps, not process_step_runs

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
