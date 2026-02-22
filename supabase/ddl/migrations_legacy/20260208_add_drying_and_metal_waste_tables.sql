-- Waste recording for Drying and Metal Detection steps (required on all stages except Packaging)

-- Drying waste: linked to drying run
create table if not exists public.process_drying_waste (
  id bigserial not null,
  drying_run_id bigint not null,
  waste_type text not null,
  quantity_kg numeric not null,
  remarks text,
  created_at timestamp with time zone not null default now(),
  constraint process_drying_waste_pkey primary key (id),
  constraint process_drying_waste_drying_run_id_fkey foreign key (drying_run_id)
    references public.process_drying_runs (id) on delete cascade
);

create index if not exists process_drying_waste_drying_run_id_idx
  on public.process_drying_waste using btree (drying_run_id);

-- Metal detector waste: linked to step run (one list per metal step)
create table if not exists public.process_metal_detector_waste (
  id bigserial not null,
  process_step_run_id bigint not null,
  waste_type text not null,
  quantity_kg numeric not null,
  remarks text,
  created_at timestamp with time zone not null default now(),
  constraint process_metal_detector_waste_pkey primary key (id),
  constraint process_metal_detector_waste_step_run_id_fkey foreign key (process_step_run_id)
    references public.process_step_runs (id) on delete cascade
);

create index if not exists process_metal_detector_waste_step_run_id_idx
  on public.process_metal_detector_waste using btree (process_step_run_id);
