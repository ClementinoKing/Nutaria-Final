create table if not exists public.operational_supply_entries (
  id bigserial primary key,
  supply_id bigint not null unique references public.supplies (id) on delete cascade,
  flow_id bigint not null references public.operational_supply_flows (id) on delete restrict,
  delivery_reference text not null,
  received_condition text not null,
  remarks text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_supply_entries_received_condition_check
    check (received_condition = any (array['PASS'::text, 'HOLD'::text, 'REJECT'::text]))
);

create index if not exists operational_supply_entries_supply_id_idx
  on public.operational_supply_entries (supply_id);

create index if not exists operational_supply_entries_flow_id_idx
  on public.operational_supply_entries (flow_id);

create or replace function public.validate_operational_supply_entry_supply_category()
returns trigger
language plpgsql
as $$
declare
  v_category text;
begin
  select category_code into v_category
  from public.supplies
  where id = new.supply_id;

  if v_category is distinct from 'SERVICE' then
    raise exception
      'Operational supply entry requires supplies.category_code=SERVICE. supply_id=% category=%',
      new.supply_id,
      coalesce(v_category, 'NULL');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_operational_supply_entry_supply_category
  on public.operational_supply_entries;

create trigger trg_validate_operational_supply_entry_supply_category
before insert or update on public.operational_supply_entries
for each row
execute function public.validate_operational_supply_entry_supply_category();
