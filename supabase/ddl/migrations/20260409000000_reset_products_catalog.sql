begin;

create or replace function public.reset_products_catalog()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_deleted_tables text[] := array[
    'product_processing_chains',
    'product_components',
    'product_processes',
    'products'
  ]::text[];
begin
  if not public.is_super_admin() then
    raise exception 'insufficient permissions for product reset' using errcode = '42501';
  end if;

  delete from public.product_processing_chains;
  delete from public.product_components;
  delete from public.product_processes;
  delete from public.products;

  return jsonb_build_object(
    'deleted_tables',
    to_jsonb(v_deleted_tables)
  );
end;
$$;

grant execute on function public.reset_products_catalog() to authenticated, service_role;

commit;
