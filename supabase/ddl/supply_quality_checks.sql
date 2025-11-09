-- Supply quality evaluation schema definition
create table if not exists public.quality_parameters (
  id serial primary key,
  code text not null unique,
  name text not null,
  specification text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
) tablespace pg_default;

create unique index if not exists quality_parameters_code_idx
  on public.quality_parameters using btree (code) tablespace pg_default;

create table if not exists public.supply_quality_checks (
  id bigserial primary key,
  supply_id bigint not null references public.supplies (id) on delete cascade,
  lot_id bigint references public.supply_batches (id),
  check_name text not null,
  result text,
  status text,
  remarks text,
  performed_by uuid references public.user_profiles (id),
  performed_at timestamp with time zone default now(),
  evaluated_at timestamp with time zone default now(),
  evaluated_by uuid references public.user_profiles (id),
  overall_score numeric(4, 2),
  constraint supply_quality_checks_status_check check (
    status = any (array['PASS'::text, 'FAIL'::text, 'PENDING'::text])
  )
) tablespace pg_default;

create index if not exists supply_quality_checks_supply_idx
  on public.supply_quality_checks using btree (supply_id) tablespace pg_default;

create unique index if not exists supply_quality_checks_supply_id_idx
  on public.supply_quality_checks using btree (supply_id) tablespace pg_default;

create table if not exists public.supply_quality_check_items (
  id uuid primary key default gen_random_uuid(),
  quality_check_id bigint not null references public.supply_quality_checks (id) on delete cascade,
  parameter_id integer not null references public.quality_parameters (id) on delete restrict,
  score integer not null check (score >= 1 and score <= 3),
  remarks text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (quality_check_id, parameter_id)
) tablespace pg_default;

insert into public.quality_parameters (code, name, specification)
values
  ('MECHANICAL_DAMAGE', 'Mechanical damage', '< 10%'),
  ('DISCOLORATION', 'Discoloration', '< 1%'),
  ('DECAY', 'Decay', 'None'),
  ('DEHYDRATION', 'Dehydration', 'None'),
  ('SOIL', 'Soil', 'None'),
  ('INCORRECT_SIZING', 'Incorrect sizing', 'Within tolerance'),
  ('INSECT_INFESTATION', 'Insect infestation', 'None'),
  ('VISUAL_MOULDS', 'Visual moulds', 'None'),
  ('MINERAL_CHEMICAL_DAMAGE', 'Mineral or chemical damages', 'None'),
  ('BLACK_SPOTS', 'Black spots', 'None'),
  ('FOREIGN_MATTER', 'Foreign matter', 'None'),
  ('PARTICLES_DUST', 'Particles & Dust', '< 1%'),
  ('SMALL_PIECES', 'Small pieces', '< 1%'),
  ('TASTE', 'Taste', 'Fresh / acceptable'),
  ('SPROUTED_SEEDS', 'Sprouted seeds', 'None'),
  ('PACKAGING', 'Packaging', 'Intact / proper labeling')
on conflict (code) do update
set name = excluded.name,
    specification = excluded.specification,
    updated_at = now();

