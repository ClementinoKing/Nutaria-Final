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
begin
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
      p_operational_product_id
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
      operational_product_id = p_operational_product_id
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
