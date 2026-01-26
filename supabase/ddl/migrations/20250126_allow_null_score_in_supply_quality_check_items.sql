-- Allow score value 4 (N/A) in supply_quality_check_items
do $$
begin
  -- Drop the existing check constraint
  alter table public.supply_quality_check_items
    drop constraint if exists supply_quality_check_items_score_check;
  
  -- Add new constraint that allows values 1-4 (4 = N/A)
  alter table public.supply_quality_check_items
    add constraint supply_quality_check_items_score_check check (
      score >= 1 and score <= 4
    );
end
$$;
