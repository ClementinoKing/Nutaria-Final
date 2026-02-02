-- Migration: Create process step execution tables
-- Tables for tracking detailed data for each process step (Washing, Drying, Sorting, Metal Detection, Packaging)

-- 1. Washing Runs
create table if not exists public.process_washing_runs (
  id bigserial not null,
  process_step_run_id bigint not null,
  washing_water_litres numeric,
  oxy_acid_ml numeric,
  moisture_percent numeric,
  remarks text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_washing_runs_pkey primary key (id),
  constraint process_washing_runs_process_step_run_id_fkey foreign key (process_step_run_id) 
    references public.process_step_runs (id) on delete cascade
) tablespace pg_default;

create index if not exists process_washing_runs_step_run_id_idx
  on public.process_washing_runs using btree (process_step_run_id)
  tablespace pg_default;

-- 2. Washing Waste
create table if not exists public.process_washing_waste (
  id bigserial not null,
  washing_run_id bigint not null,
  waste_type text not null,
  quantity_kg numeric not null,
  remarks text,
  created_at timestamp with time zone not null default now(),
  constraint process_washing_waste_pkey primary key (id),
  constraint process_washing_waste_washing_run_id_fkey foreign key (washing_run_id) 
    references public.process_washing_runs (id) on delete cascade
) tablespace pg_default;

create index if not exists process_washing_waste_washing_run_id_idx
  on public.process_washing_waste using btree (washing_run_id)
  tablespace pg_default;

-- 3. Drying Runs
create table if not exists public.process_drying_runs (
  id bigserial not null,
  process_step_run_id bigint not null,
  dryer_temperature_c numeric,
  time_in timestamp with time zone,
  time_out timestamp with time zone,
  moisture_in numeric,
  moisture_out numeric,
  crates_clean text,
  insect_infestation text,
  dryer_hygiene_clean text,
  remarks text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_drying_runs_pkey primary key (id),
  constraint process_drying_runs_process_step_run_id_fkey foreign key (process_step_run_id) 
    references public.process_step_runs (id) on delete cascade,
  constraint process_drying_runs_crates_clean_check check (
    crates_clean is null or crates_clean = any (array['Yes'::text, 'No'::text, 'NA'::text])
  ),
  constraint process_drying_runs_insect_infestation_check check (
    insect_infestation is null or insect_infestation = any (array['Yes'::text, 'No'::text, 'NA'::text])
  ),
  constraint process_drying_runs_dryer_hygiene_clean_check check (
    dryer_hygiene_clean is null or dryer_hygiene_clean = any (array['Yes'::text, 'No'::text, 'NA'::text])
  )
) tablespace pg_default;

create index if not exists process_drying_runs_step_run_id_idx
  on public.process_drying_runs using btree (process_step_run_id)
  tablespace pg_default;

-- 4. Sorting Outputs
create table if not exists public.process_sorting_outputs (
  id bigserial not null,
  process_step_run_id bigint not null,
  product_id integer not null,
  quantity_kg numeric not null,
  moisture_percent numeric,
  remarks text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_sorting_outputs_pkey primary key (id),
  constraint process_sorting_outputs_process_step_run_id_fkey foreign key (process_step_run_id) 
    references public.process_step_runs (id) on delete cascade,
  constraint process_sorting_outputs_product_id_fkey foreign key (product_id) 
    references public.products (id) on delete restrict
) tablespace pg_default;

create index if not exists process_sorting_outputs_step_run_id_idx
  on public.process_sorting_outputs using btree (process_step_run_id)
  tablespace pg_default;

create index if not exists process_sorting_outputs_product_id_idx
  on public.process_sorting_outputs using btree (product_id)
  tablespace pg_default;

-- 5. Sorting Waste
create table if not exists public.process_sorting_waste (
  id bigserial not null,
  sorting_run_id bigint not null,
  waste_type text not null,
  quantity_kg numeric not null,
  created_at timestamp with time zone not null default now(),
  constraint process_sorting_waste_pkey primary key (id),
  constraint process_sorting_waste_sorting_run_id_fkey foreign key (sorting_run_id) 
    references public.process_sorting_outputs (id) on delete cascade
) tablespace pg_default;

create index if not exists process_sorting_waste_sorting_run_id_idx
  on public.process_sorting_waste using btree (sorting_run_id)
  tablespace pg_default;

-- 6. Metal Detector Sessions
create table if not exists public.process_metal_detector (
  id bigserial not null,
  process_step_run_id bigint not null,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_metal_detector_pkey primary key (id),
  constraint process_metal_detector_process_step_run_id_fkey foreign key (process_step_run_id) 
    references public.process_step_runs (id) on delete cascade
) tablespace pg_default;

create index if not exists process_metal_detector_step_run_id_idx
  on public.process_metal_detector using btree (process_step_run_id)
  tablespace pg_default;

-- 7. Foreign Object Rejections
create table if not exists public.process_foreign_object_rejections (
  id bigserial not null,
  session_id bigint not null,
  rejection_time timestamp with time zone not null,
  object_type text not null,
  weight numeric,
  corrective_action text,
  created_at timestamp with time zone not null default now(),
  constraint process_foreign_object_rejections_pkey primary key (id),
  constraint process_foreign_object_rejections_session_id_fkey foreign key (session_id) 
    references public.process_metal_detector (id) on delete cascade
) tablespace pg_default;

create index if not exists process_foreign_object_rejections_session_id_idx
  on public.process_foreign_object_rejections using btree (session_id)
  tablespace pg_default;

-- 8. Packaging Runs
create table if not exists public.process_packaging_runs (
  id bigserial not null,
  process_step_run_id bigint not null,
  visual_status text,
  rework_destination text,
  pest_status text,
  foreign_object_status text,
  mould_status text,
  damaged_kernels_pct numeric,
  insect_damaged_kernels_pct numeric,
  nitrogen_used numeric,
  nitrogen_batch_number text,
  primary_packaging_type text,
  primary_packaging_batch text,
  secondary_packaging text,
  secondary_packaging_type text,
  secondary_packaging_batch text,
  label_correct text,
  label_legible text,
  pallet_integrity text,
  allergen_swab_result text,
  remarks text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_packaging_runs_pkey primary key (id),
  constraint process_packaging_runs_process_step_run_id_fkey foreign key (process_step_run_id) 
    references public.process_step_runs (id) on delete cascade,
  constraint process_packaging_runs_label_correct_check check (
    label_correct is null or label_correct = any (array['Yes'::text, 'No'::text, 'NA'::text])
  ),
  constraint process_packaging_runs_label_legible_check check (
    label_legible is null or label_legible = any (array['Yes'::text, 'No'::text, 'NA'::text])
  ),
  constraint process_packaging_runs_pallet_integrity_check check (
    pallet_integrity is null or pallet_integrity = any (array['Yes'::text, 'No'::text, 'NA'::text])
  )
) tablespace pg_default;

create index if not exists process_packaging_runs_step_run_id_idx
  on public.process_packaging_runs using btree (process_step_run_id)
  tablespace pg_default;

-- 9. Packaging Weight Checks
create table if not exists public.process_packaging_weight_checks (
  id bigserial not null,
  packaging_run_id bigint not null,
  check_no integer not null,
  weight_kg numeric not null,
  created_at timestamp with time zone not null default now(),
  constraint process_packaging_weight_checks_pkey primary key (id),
  constraint process_packaging_weight_checks_packaging_run_id_fkey foreign key (packaging_run_id) 
    references public.process_packaging_runs (id) on delete cascade,
  constraint process_packaging_weight_checks_check_no_check check (check_no >= 1 and check_no <= 4)
) tablespace pg_default;

create index if not exists process_packaging_weight_checks_packaging_run_id_idx
  on public.process_packaging_weight_checks using btree (packaging_run_id)
  tablespace pg_default;

-- 10. Packaging Photos
create table if not exists public.process_packaging_photos (
  id bigserial not null,
  packaging_run_id bigint not null,
  photo_type text not null,
  file_path text not null,
  created_at timestamp with time zone not null default now(),
  constraint process_packaging_photos_pkey primary key (id),
  constraint process_packaging_photos_packaging_run_id_fkey foreign key (packaging_run_id) 
    references public.process_packaging_runs (id) on delete cascade,
  constraint process_packaging_photos_photo_type_check check (
    photo_type = any (array['product'::text, 'label'::text, 'pallet'::text])
  )
) tablespace pg_default;

create index if not exists process_packaging_photos_packaging_run_id_idx
  on public.process_packaging_photos using btree (packaging_run_id)
  tablespace pg_default;

-- 11. Packaging Waste
create table if not exists public.process_packaging_waste (
  id bigserial not null,
  packaging_run_id bigint not null,
  waste_type text not null,
  quantity_kg numeric not null,
  created_at timestamp with time zone not null default now(),
  constraint process_packaging_waste_pkey primary key (id),
  constraint process_packaging_waste_packaging_run_id_fkey foreign key (packaging_run_id) 
    references public.process_packaging_runs (id) on delete cascade
) tablespace pg_default;

create index if not exists process_packaging_waste_packaging_run_id_idx
  on public.process_packaging_waste using btree (packaging_run_id)
  tablespace pg_default;

-- 12. Batch Step Transitions
create table if not exists public.batch_step_transitions (
  id bigserial not null,
  manufacturing_batch_id bigint not null,
  from_step text,
  to_step text not null,
  reason text,
  created_by uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint batch_step_transitions_pkey primary key (id),
  constraint batch_step_transitions_manufacturing_batch_id_fkey foreign key (manufacturing_batch_id) 
    references public.process_lot_runs (id) on delete cascade,
  constraint batch_step_transitions_created_by_fkey foreign key (created_by) 
    references auth.users (id) on delete restrict
) tablespace pg_default;

create index if not exists batch_step_transitions_manufacturing_batch_id_idx
  on public.batch_step_transitions using btree (manufacturing_batch_id)
  tablespace pg_default;

create index if not exists batch_step_transitions_created_by_idx
  on public.batch_step_transitions using btree (created_by)
  tablespace pg_default;

-- Add updated_at triggers for tables that need them
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'process_washing_runs_set_updated_at'
  ) then
    create trigger process_washing_runs_set_updated_at
      before update on public.process_washing_runs
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'process_drying_runs_set_updated_at'
  ) then
    create trigger process_drying_runs_set_updated_at
      before update on public.process_drying_runs
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'process_sorting_outputs_set_updated_at'
  ) then
    create trigger process_sorting_outputs_set_updated_at
      before update on public.process_sorting_outputs
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'process_metal_detector_set_updated_at'
  ) then
    create trigger process_metal_detector_set_updated_at
      before update on public.process_metal_detector
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'process_packaging_runs_set_updated_at'
  ) then
    create trigger process_packaging_runs_set_updated_at
      before update on public.process_packaging_runs
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;
