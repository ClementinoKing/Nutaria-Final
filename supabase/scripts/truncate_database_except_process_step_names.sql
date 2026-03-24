begin;

do $$
declare
  v_sql text;
  v_tables text;
begin
  select string_agg(format('%I.%I', table_schema, table_name), ', ' order by table_name)
  into v_tables
  from information_schema.tables
  where table_schema = 'public'
    and table_type = 'BASE TABLE'
    and table_name <> all (array[
      'process_step_names',
      'roles',
      'permissions',
      'role_permissions',
      'user_profiles',
      'user_roles'
    ]);

  if v_tables is null then
    raise notice 'No tables to truncate';
    return;
  end if;

  v_sql := 'truncate table ' || v_tables || ' restart identity cascade';
  execute v_sql;
end $$;

commit;
