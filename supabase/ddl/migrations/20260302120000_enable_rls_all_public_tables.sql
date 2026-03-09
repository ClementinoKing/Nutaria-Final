-- Enable RLS on all public tables.
-- For tables without any existing policies, create a default authenticated policy
-- so application behavior does not break immediately.

do $$
declare
  tbl record;
  has_policy boolean;
begin
  for tbl in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      tbl.schemaname,
      tbl.tablename
    );

    select exists (
      select 1
      from pg_policies p
      where p.schemaname = tbl.schemaname
        and p.tablename = tbl.tablename
    )
    into has_policy;

    if not has_policy then
      execute format(
        'create policy %I on %I.%I for all to authenticated using (true) with check (true)',
        'authenticated_full_access',
        tbl.schemaname,
        tbl.tablename
      );
    end if;
  end loop;
end $$;

