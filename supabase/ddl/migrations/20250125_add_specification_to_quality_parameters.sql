-- Add specification column to quality_parameters table if it doesn't exist
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quality_parameters'
      and column_name = 'specification'
  ) then
    alter table public.quality_parameters
      add column specification text null;
    
    comment on column public.quality_parameters.specification is 'Manual specification for the quality parameter';
  end if;
end
$$;
