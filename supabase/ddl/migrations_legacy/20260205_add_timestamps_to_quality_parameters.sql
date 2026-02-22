-- Add created_at and updated_at to quality_parameters if missing (fixes 400 on select)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quality_parameters' and column_name = 'created_at'
  ) then
    alter table public.quality_parameters
      add column created_at timestamptz default now();
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quality_parameters' and column_name = 'updated_at'
  ) then
    alter table public.quality_parameters
      add column updated_at timestamptz default now();
  end if;
end
$$;

-- Ensure API can access quality_parameters (fixes 400 when table was created without grants)
grant select, insert, update, delete on public.quality_parameters to anon;
grant select, insert, update, delete on public.quality_parameters to authenticated;
grant usage, select on sequence public.quality_parameters_id_seq to anon;
grant usage, select on sequence public.quality_parameters_id_seq to authenticated;
