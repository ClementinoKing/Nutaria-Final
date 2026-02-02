-- Fix foreign key reference for evaluated_by in process_step_quality_checks
-- Change from user_profiles (id) to auth.users (id)

-- Drop the existing foreign key constraint if it exists
alter table if exists public.process_step_quality_checks
  drop constraint if exists process_step_quality_checks_evaluated_by_fkey;

-- Add the correct foreign key constraint referencing auth.users
alter table if exists public.process_step_quality_checks
  add constraint process_step_quality_checks_evaluated_by_fkey 
  foreign key (evaluated_by) references auth.users (id);
