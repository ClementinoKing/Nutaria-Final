-- Ensure supply packaging quality tables are accessible through PostgREST.
-- Without grants/policies, REST can return 404 ("not found in schema cache")
-- even when tables exist in public schema.

-- Table/sequence grants
grant select, insert, update, delete on public.supply_packaging_quality_checks to anon, authenticated, service_role;
grant usage, select on sequence public.supply_packaging_quality_checks_id_seq to anon, authenticated, service_role;

grant select, insert, update, delete on public.supply_packaging_quality_check_items to anon, authenticated, service_role;
grant usage, select on sequence public.supply_packaging_quality_check_items_id_seq to anon, authenticated, service_role;

grant select on public.packaging_quality_parameters to anon, authenticated, service_role;

-- RLS policies (safe for current app behavior)
alter table public.supply_packaging_quality_checks enable row level security;
alter table public.supply_packaging_quality_check_items enable row level security;
alter table public.packaging_quality_parameters enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'supply_packaging_quality_checks'
      and policyname = 'supply_packaging_quality_checks_full_access'
  ) then
    create policy supply_packaging_quality_checks_full_access
      on public.supply_packaging_quality_checks
      for all
      to anon, authenticated, service_role
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'supply_packaging_quality_check_items'
      and policyname = 'supply_packaging_quality_check_items_full_access'
  ) then
    create policy supply_packaging_quality_check_items_full_access
      on public.supply_packaging_quality_check_items
      for all
      to anon, authenticated, service_role
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'packaging_quality_parameters'
      and policyname = 'packaging_quality_parameters_read_access'
  ) then
    create policy packaging_quality_parameters_read_access
      on public.packaging_quality_parameters
      for select
      to anon, authenticated, service_role
      using (true);
  end if;
end
$$;

-- Force PostgREST to reload schema cache after grants/policies.
notify pgrst, 'reload schema';

