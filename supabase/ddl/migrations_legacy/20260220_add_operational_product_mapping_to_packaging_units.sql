-- Map packet packaging units to OP products and expose mapping via packaging RPC.

alter table public.packaging_units
  add column if not exists operational_product_id integer null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'packaging_units_operational_product_id_fkey'
  ) then
    alter table public.packaging_units
      add constraint packaging_units_operational_product_id_fkey
      foreign key (operational_product_id)
      references public.products(id)
      on delete restrict;
  end if;
end
$$;

create index if not exists packaging_units_operational_product_id_idx
  on public.packaging_units(operational_product_id);

alter table public.packaging_units
  drop constraint if exists packaging_units_packet_requires_operational_product_check;

alter table public.packaging_units
  add constraint packaging_units_packet_requires_operational_product_check
  check (
    unit_type <> 'PACKET'
    or operational_product_id is not null
  ) not valid;

create or replace function public.validate_packaging_unit_operational_product_type()
returns trigger
language plpgsql
as $$
declare
  v_product_type text;
begin
  if new.unit_type <> 'PACKET' then
    return new;
  end if;

  select p.product_type
  into v_product_type
  from public.products p
  where p.id = new.operational_product_id;

  if v_product_type is distinct from 'OP' then
    raise exception 'Packaging packet units must map to OP products. product_id=% type=%',
      new.operational_product_id,
      coalesce(v_product_type, 'NULL');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_packaging_unit_operational_product_type
  on public.packaging_units;

create trigger trg_validate_packaging_unit_operational_product_type
before insert or update on public.packaging_units
for each row
execute function public.validate_packaging_unit_operational_product_type();

drop function if exists public.get_packaging_units();

create function public.get_packaging_units()
returns table (
  id integer,
  code text,
  name text,
  unit_type text,
  packaging_type text,
  net_weight_kg numeric,
  length_mm integer,
  width_mm integer,
  height_mm integer,
  operational_product_id integer,
  is_active boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    pu.id,
    pu.code,
    pu.name,
    pu.unit_type,
    pu.packaging_type,
    pu.net_weight_kg,
    pu.length_mm,
    pu.width_mm,
    pu.height_mm,
    pu.operational_product_id,
    pu.is_active,
    pu.created_at
  from public.packaging_units pu
  order by pu.code;
$$;

drop function if exists public.upsert_packaging_unit(integer, text, text, text, text, numeric, integer, integer, integer);

create or replace function public.upsert_packaging_unit(
  p_id integer,
  p_code text,
  p_name text,
  p_unit_type text,
  p_packaging_type text,
  p_net_weight_kg numeric,
  p_length_mm integer,
  p_width_mm integer,
  p_height_mm integer,
  p_operational_product_id integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id integer;
  v_operational_product_id integer;
begin
  v_operational_product_id := case
    when p_unit_type = 'PACKET' then p_operational_product_id
    else null
  end;

  if p_id is null then
    insert into public.packaging_units (
      code,
      name,
      unit_type,
      packaging_type,
      net_weight_kg,
      length_mm,
      width_mm,
      height_mm,
      operational_product_id
    )
    values (
      p_code,
      p_name,
      p_unit_type,
      p_packaging_type,
      p_net_weight_kg,
      p_length_mm,
      p_width_mm,
      p_height_mm,
      v_operational_product_id
    )
    returning id into v_id;
  else
    update public.packaging_units
    set
      code = p_code,
      name = p_name,
      unit_type = p_unit_type,
      packaging_type = p_packaging_type,
      net_weight_kg = p_net_weight_kg,
      length_mm = p_length_mm,
      width_mm = p_width_mm,
      height_mm = p_height_mm,
      operational_product_id = v_operational_product_id
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.get_packaging_units() to anon, authenticated, service_role;
grant execute on function public.upsert_packaging_unit(integer, text, text, text, text, numeric, integer, integer, integer, integer)
  to anon, authenticated, service_role;
