-- Add results column to supply_quality_check_items table if it doesn't exist
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'supply_quality_check_items'
      and column_name = 'results'
  ) then
    alter table public.supply_quality_check_items
      add column results text null;
    
    comment on column public.supply_quality_check_items.results is 'Manual results entry for the quality check item, entered by users during evaluation';
  end if;
end
$$;
