do $$
begin
  -- If an older environment still has supplier_name and not supply_name,
  -- rename it so the app queries stay compatible.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'operational_supply_flows'
      and column_name = 'supplier_name'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'operational_supply_flows'
      and column_name = 'supply_name'
  ) then
    alter table public.operational_supply_flows
      rename column supplier_name to supply_name;
  end if;
end
$$;

-- If both columns exist (for any manual drift), drop the legacy one.
alter table if exists public.operational_supply_flows
  drop column if exists supplier_name;
