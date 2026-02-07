-- Packaging settings tables used by /settings/packaging

create table if not exists public.packaging_units (
  id serial not null,
  code text not null unique,
  name text not null,
  unit_type text not null check (unit_type in ('PACKET', 'BOX')),
  packaging_type text null check (packaging_type in ('DOY', 'VACUUM', 'POLY', 'BOX')),
  net_weight_kg numeric(10, 3) null,
  length_mm integer null,
  width_mm integer null,
  height_mm integer null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  constraint packaging_units_pkey primary key (id)
) tablespace pg_default;

create table if not exists public.box_pack_rules (
  id serial not null,
  box_unit_id integer not null,
  packet_unit_id integer not null,
  packets_per_box integer not null check (packets_per_box > 0),
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  constraint box_pack_rules_pkey primary key (id),
  constraint box_pack_rules_box_fkey foreign key (box_unit_id) references public.packaging_units (id) on delete cascade,
  constraint box_pack_rules_packet_fkey foreign key (packet_unit_id) references public.packaging_units (id) on delete restrict,
  constraint box_pack_rules_unique unique (box_unit_id, packet_unit_id)
) tablespace pg_default;

create index if not exists box_pack_rules_box_unit_id_idx
  on public.box_pack_rules using btree (box_unit_id) tablespace pg_default;

create index if not exists box_pack_rules_packet_unit_id_idx
  on public.box_pack_rules using btree (packet_unit_id) tablespace pg_default;

grant select, insert, update, delete on public.packaging_units to anon;
grant select, insert, update, delete on public.packaging_units to authenticated;
grant usage, select on sequence public.packaging_units_id_seq to anon;
grant usage, select on sequence public.packaging_units_id_seq to authenticated;

grant select, insert, update, delete on public.box_pack_rules to anon;
grant select, insert, update, delete on public.box_pack_rules to authenticated;
grant usage, select on sequence public.box_pack_rules_id_seq to anon;
grant usage, select on sequence public.box_pack_rules_id_seq to authenticated;

insert into public.packaging_units
  (code, name, unit_type, packaging_type, net_weight_kg, length_mm, width_mm, height_mm)
values
  ('DOY_250G', 'Doy Pack 250g', 'PACKET', 'DOY', 0.250, null, null, null),
  ('DOY_500G', 'Doy Pack 500g', 'PACKET', 'DOY', 0.500, null, null, null),
  ('DOY_1KG', 'Doy Pack 1kg', 'PACKET', 'DOY', 1.000, null, null, null),
  ('VAC_5KG', 'Vacuum Silver Bag 5kg', 'PACKET', 'VACUUM', 5.000, null, null, null),
  ('VAC_10KG', 'Vacuum Silver Bag 10kg', 'PACKET', 'VACUUM', 10.000, null, null, null),
  ('VAC_11_34KG', 'Vacuum Silver Bag 11.34kg', 'PACKET', 'VACUUM', 11.340, null, null, null),
  ('VAC_20KG', 'Vacuum Silver Bag 20kg', 'PACKET', 'VACUUM', 20.000, null, null, null),
  ('BOX_11_34KG', 'Box 11.34kg', 'BOX', 'BOX', null, 360, 225, 242),
  ('BOX_20KG', 'Box 20kg', 'BOX', 'BOX', null, 400, 330, 270)
on conflict (code) do update
set
  name = excluded.name,
  unit_type = excluded.unit_type,
  packaging_type = excluded.packaging_type,
  net_weight_kg = excluded.net_weight_kg,
  length_mm = excluded.length_mm,
  width_mm = excluded.width_mm,
  height_mm = excluded.height_mm;

insert into public.box_pack_rules (box_unit_id, packet_unit_id, packets_per_box)
values
  (
    (select id from public.packaging_units where code = 'BOX_11_34KG'),
    (select id from public.packaging_units where code = 'VAC_11_34KG'),
    1
  ),
  (
    (select id from public.packaging_units where code = 'BOX_20KG'),
    (select id from public.packaging_units where code = 'VAC_10KG'),
    2
  )
on conflict (box_unit_id, packet_unit_id) do update
set packets_per_box = excluded.packets_per_box;

-- After applying this migration on hosted Supabase, reload the REST API schema
-- so the new tables are exposed: run in SQL Editor: NOTIFY pgrst, 'reload schema';
