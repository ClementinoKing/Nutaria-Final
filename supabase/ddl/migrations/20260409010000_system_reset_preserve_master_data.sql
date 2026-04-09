begin;

create or replace function public.system_reset_database(
  p_keep_tables text[] default array[
    'units',
    'warehouses',
    'supplier_categories',
    'supplier_types',
    'document_types',
    'supply_document_types',
    'quality_parameters',
    'packaging_quality_parameters',
    'packaging_units',
    'box_pack_rules',
    'roles',
    'permissions',
    'role_permissions',
    'user_profiles',
    'user_roles',
    'suppliers',
    'supplier_contacts',
    'customers',
    'customer_contacts',
    'customer_addresses',
    'carriers'
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
  v_products_seq regclass;
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
    and t.table_name <> 'products'
    and not (t.table_name = any(v_keep_tables));

  if coalesce(array_length(v_truncate_tables, 1), 0) > 0 then
    v_truncate_sql := 'truncate table ' || array_to_string(v_truncate_tables, ', ') || ' restart identity cascade';
    execute v_truncate_sql;
  end if;

  if array_position(v_keep_tables, 'packaging_units') is not null then
    update public.packaging_units
    set operational_product_id = null
    where operational_product_id is not null;
  end if;

  delete from public.products;

  select pg_get_serial_sequence('public.products', 'id')::regclass
  into v_products_seq;

  if v_products_seq is not null then
    perform setval(v_products_seq, 1, false);
  end if;

  return jsonb_build_object(
    'kept_tables', to_jsonb(v_keep_tables),
    'truncated_tables', to_jsonb(coalesce(v_truncate_tables, array[]::text[])),
    'cleared_tables', to_jsonb(array['products']::text[])
  );
end;
$$;

grant execute on function public.system_reset_database(text[]) to authenticated, service_role;

commit;
