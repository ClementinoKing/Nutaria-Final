begin;

create or replace function public.system_reset_database(
  p_keep_tables text[] default array[
    'process_step_names',
    'roles',
    'permissions',
    'role_permissions',
    'user_profiles',
    'user_roles'
  ]::text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_keep_tables text[] := coalesce(p_keep_tables, array[]::text[]);
  v_truncate_tables text[];
  v_truncate_sql text;
begin
  if not public.is_super_admin() then
    raise exception 'insufficient permissions for database reset' using errcode = '42501';
  end if;

  select coalesce(
    array_agg(format('%I.%I', t.table_schema, t.table_name) order by t.table_name),
    array[]::text[]
  )
  into v_truncate_tables
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and not (t.table_name = any(v_keep_tables));

  if coalesce(array_length(v_truncate_tables, 1), 0) = 0 then
    return jsonb_build_object(
      'kept_tables', to_jsonb(v_keep_tables),
      'truncated_tables', '[]'::jsonb
    );
  end if;

  v_truncate_sql := 'truncate table ' || array_to_string(v_truncate_tables, ', ') || ' restart identity cascade';
  execute v_truncate_sql;

  return jsonb_build_object(
    'kept_tables', to_jsonb(v_keep_tables),
    'truncated_tables', to_jsonb(v_truncate_tables)
  );
end;
$$;

grant execute on function public.system_reset_database(text[]) to authenticated, service_role;

commit;
