begin;

create or replace function public.force_delete_supply(p_supply_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_ids bigint[] := '{}';
  v_run_ids bigint[] := '{}';
  v_step_run_ids bigint[] := '{}';
  v_sorting_output_ids bigint[] := '{}';
  v_packaging_run_ids bigint[] := '{}';
  v_pack_entry_ids bigint[] := '{}';
  v_allocation_ids bigint[] := '{}';
begin
  if p_supply_id is null then
    raise exception 'Supply id is required' using errcode = '22023';
  end if;

  if not public.is_super_admin() then
    raise exception 'Only Super Admin can force delete supplies' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.supplies
    where id = p_supply_id
  ) then
    return;
  end if;

  select coalesce(array_agg(sb.id), '{}')
  into v_batch_ids
  from public.supply_batches sb
  where sb.supply_id = p_supply_id;

  select coalesce(array_agg(distinct affected_runs.id), '{}')
  into v_run_ids
  from (
    select plr.id
    from public.process_lot_runs plr
    where plr.supply_batch_id = any(v_batch_ids)

    union

    select plrb.process_lot_run_id as id
    from public.process_lot_run_batches plrb
    where plrb.supply_batch_id = any(v_batch_ids)
  ) as affected_runs;

  select coalesce(array_agg(psr.id), '{}')
  into v_step_run_ids
  from public.process_step_runs psr
  where psr.process_lot_run_id = any(v_run_ids);

  select coalesce(array_agg(pso.id), '{}')
  into v_sorting_output_ids
  from public.process_sorting_outputs pso
  where pso.process_step_run_id = any(v_step_run_ids);

  select coalesce(array_agg(ppr.id), '{}')
  into v_packaging_run_ids
  from public.process_packaging_runs ppr
  where ppr.process_step_run_id = any(v_step_run_ids);

  select coalesce(array_agg(ppe.id), '{}')
  into v_pack_entry_ids
  from public.process_packaging_pack_entries ppe
  where ppe.packaging_run_id = any(v_packaging_run_ids);

  select coalesce(array_agg(ppa.id), '{}')
  into v_allocation_ids
  from public.process_packaging_storage_allocations ppa
  where ppa.packaging_run_id = any(v_packaging_run_ids)
     or ppa.pack_entry_id = any(v_pack_entry_ids);

  delete from public.shipment_pack_items
  where packaging_allocation_id = any(v_allocation_ids)
     or pack_entry_id = any(v_pack_entry_ids);

  delete from public.mixed_pack_batch_items
  where source_allocation_id = any(v_allocation_ids)
     or source_pack_entry_id = any(v_pack_entry_ids)
     or source_lot_run_id = any(v_run_ids);

  delete from public.shipment_lot_allocations
  where lot_id = any(v_batch_ids);

  delete from public.stock_levels
  where lot_id = any(v_batch_ids);

  delete from public.inventory_movements
  where lot_id = any(v_batch_ids);

  delete from public.inventory_adjustments
  where lot_id = any(v_batch_ids);

  delete from public.cycle_count_lines
  where lot_id = any(v_batch_ids);

  delete from public.process_packaging_storage_allocations
  where id = any(v_allocation_ids);

  delete from public.process_packaging_pack_entries
  where id = any(v_pack_entry_ids);

  delete from public.process_packaging_metal_checks
  where packaging_run_id = any(v_packaging_run_ids)
     or sorting_output_id = any(v_sorting_output_ids);

  delete from public.process_sorting_outputs
  where id = any(v_sorting_output_ids)
     or process_step_run_id = any(v_step_run_ids);

  delete from public.process_non_conformances
  where process_step_run_id = any(v_step_run_ids);

  delete from public.process_qc_checks
  where process_step_run_id = any(v_step_run_ids);

  delete from public.process_signoffs
  where process_lot_run_id = any(v_run_ids);

  delete from public.production_batches
  where process_lot_run_id = any(v_run_ids)
     or supply_batch_id = any(v_batch_ids);

  delete from public.process_lot_run_batches
  where process_lot_run_id = any(v_run_ids)
     or supply_batch_id = any(v_batch_ids);

  delete from public.supply_quality_checks
  where supply_id = p_supply_id
     or lot_id = any(v_batch_ids);

  delete from public.supply_batches
  where id = any(v_batch_ids);

  delete from public.supplies
  where id = p_supply_id;
end;
$$;

grant execute on function public.force_delete_supply(bigint) to authenticated, service_role;

commit;
