-- RPC fallback for packaging settings when direct table REST endpoints are unavailable.

create or replace function public.get_packaging_units()
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
    pu.is_active,
    pu.created_at
  from public.packaging_units pu
  order by pu.code;
$$;

create or replace function public.get_box_pack_rules()
returns table (
  id integer,
  box_unit_id integer,
  packet_unit_id integer,
  packets_per_box integer,
  is_active boolean,
  created_at timestamptz,
  box_unit_code text,
  box_unit_name text,
  packet_unit_code text,
  packet_unit_name text
)
language sql
security definer
set search_path = public
as $$
  select
    r.id,
    r.box_unit_id,
    r.packet_unit_id,
    r.packets_per_box,
    r.is_active,
    r.created_at,
    b.code as box_unit_code,
    b.name as box_unit_name,
    p.code as packet_unit_code,
    p.name as packet_unit_name
  from public.box_pack_rules r
  left join public.packaging_units b on b.id = r.box_unit_id
  left join public.packaging_units p on p.id = r.packet_unit_id
  order by r.id desc;
$$;

create or replace function public.upsert_packaging_unit(
  p_id integer,
  p_code text,
  p_name text,
  p_unit_type text,
  p_packaging_type text,
  p_net_weight_kg numeric,
  p_length_mm integer,
  p_width_mm integer,
  p_height_mm integer
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
      code, name, unit_type, packaging_type, net_weight_kg, length_mm, width_mm, height_mm
    )
    values (
      p_code, p_name, p_unit_type, p_packaging_type, p_net_weight_kg, p_length_mm, p_width_mm, p_height_mm
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
      height_mm = p_height_mm
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.set_packaging_unit_active(
  p_id integer,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.packaging_units
  set is_active = p_is_active
  where id = p_id;
  return true;
end;
$$;

create or replace function public.upsert_box_pack_rule(
  p_id integer,
  p_box_unit_id integer,
  p_packet_unit_id integer,
  p_packets_per_box integer
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
    insert into public.box_pack_rules (box_unit_id, packet_unit_id, packets_per_box)
    values (p_box_unit_id, p_packet_unit_id, p_packets_per_box)
    returning id into v_id;
  else
    update public.box_pack_rules
    set
      box_unit_id = p_box_unit_id,
      packet_unit_id = p_packet_unit_id,
      packets_per_box = p_packets_per_box
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.set_box_pack_rule_active(
  p_id integer,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.box_pack_rules
  set is_active = p_is_active
  where id = p_id;
  return true;
end;
$$;

create or replace function public.delete_box_pack_rule(
  p_id integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.box_pack_rules
  where id = p_id;
  return true;
end;
$$;

grant execute on function public.get_packaging_units() to anon, authenticated, service_role;
grant execute on function public.get_box_pack_rules() to anon, authenticated, service_role;
grant execute on function public.upsert_packaging_unit(integer, text, text, text, text, numeric, integer, integer, integer) to anon, authenticated, service_role;
grant execute on function public.set_packaging_unit_active(integer, boolean) to anon, authenticated, service_role;
grant execute on function public.upsert_box_pack_rule(integer, integer, integer, integer) to anon, authenticated, service_role;
grant execute on function public.set_box_pack_rule_active(integer, boolean) to anon, authenticated, service_role;
grant execute on function public.delete_box_pack_rule(integer) to anon, authenticated, service_role;
