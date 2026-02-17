-- Remove operational supply profile model and mappings.
-- Operational supplies now use OP products directly without flow/profile linkage.

-- Remove flow reference from operational entries.
drop index if exists public.operational_supply_entries_flow_id_idx;

alter table if exists public.operational_supply_entries
  drop constraint if exists operational_supply_entries_flow_id_fkey;

alter table if exists public.operational_supply_entries
  drop column if exists flow_id;

-- Remove mapping validation trigger/function.
drop trigger if exists trg_validate_operational_flow_product_type
  on public.operational_supply_flow_products;

drop function if exists public.validate_operational_flow_product_type();

-- Drop mapping and profile tables.
drop table if exists public.operational_supply_flow_products;
drop table if exists public.operational_supply_flows;
