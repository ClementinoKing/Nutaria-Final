-- Packing-stage metal checks (attempt loop per sorting output)
create table if not exists public.process_packaging_metal_checks (
  id bigserial not null,
  packaging_run_id bigint not null,
  sorting_output_id bigint not null,
  attempt_no integer not null,
  status text not null,
  remarks text,
  checked_by uuid,
  checked_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_packaging_metal_checks_pkey primary key (id),
  constraint process_packaging_metal_checks_packaging_run_id_fkey
    foreign key (packaging_run_id) references public.process_packaging_runs (id) on delete cascade,
  constraint process_packaging_metal_checks_sorting_output_id_fkey
    foreign key (sorting_output_id) references public.process_sorting_outputs (id) on delete restrict,
  constraint process_packaging_metal_checks_checked_by_fkey
    foreign key (checked_by) references auth.users (id) on delete set null,
  constraint process_packaging_metal_checks_attempt_no_check check (attempt_no > 0),
  constraint process_packaging_metal_checks_status_check check (status in ('PASS', 'FAIL')),
  constraint process_packaging_metal_checks_unique_attempt unique (packaging_run_id, sorting_output_id, attempt_no)
) tablespace pg_default;

create index if not exists process_packaging_metal_checks_packaging_sorting_idx
  on public.process_packaging_metal_checks using btree (packaging_run_id, sorting_output_id)
  tablespace pg_default;

create index if not exists process_packaging_metal_checks_status_idx
  on public.process_packaging_metal_checks using btree (status)
  tablespace pg_default;

create index if not exists process_packaging_metal_checks_checked_at_desc_idx
  on public.process_packaging_metal_checks using btree (checked_at desc)
  tablespace pg_default;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'process_packaging_metal_checks_set_updated_at'
  ) then
    create trigger process_packaging_metal_checks_set_updated_at
      before update on public.process_packaging_metal_checks
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;

-- Foreign object details linked to failed metal-check attempts
create table if not exists public.process_packaging_metal_check_rejections (
  id bigserial not null,
  metal_check_id bigint not null,
  object_type text not null,
  weight_kg numeric not null,
  corrective_action text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  constraint process_packaging_metal_check_rejections_pkey primary key (id),
  constraint process_packaging_metal_check_rejections_metal_check_id_fkey
    foreign key (metal_check_id) references public.process_packaging_metal_checks (id) on delete cascade,
  constraint process_packaging_metal_check_rejections_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint process_packaging_metal_check_rejections_weight_kg_check check (weight_kg > 0)
) tablespace pg_default;

create index if not exists process_packaging_metal_check_rejections_metal_check_id_idx
  on public.process_packaging_metal_check_rejections using btree (metal_check_id)
  tablespace pg_default;

create index if not exists process_packaging_metal_check_rejections_created_at_desc_idx
  on public.process_packaging_metal_check_rejections using btree (created_at desc)
  tablespace pg_default;

-- Pack-entry summary fields for latest metal-check state
alter table public.process_packaging_pack_entries
  add column if not exists metal_check_status text null;

alter table public.process_packaging_pack_entries
  add column if not exists metal_check_attempts integer not null default 0;

alter table public.process_packaging_pack_entries
  add column if not exists metal_check_last_id bigint null;

alter table public.process_packaging_pack_entries
  add column if not exists metal_check_last_checked_at timestamp with time zone null;

alter table public.process_packaging_pack_entries
  add column if not exists metal_check_last_checked_by uuid null;

alter table public.process_packaging_pack_entries
  drop constraint if exists process_packaging_pack_entries_metal_check_status_check;

alter table public.process_packaging_pack_entries
  add constraint process_packaging_pack_entries_metal_check_status_check
  check (metal_check_status is null or metal_check_status in ('PASS', 'FAIL'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'process_packaging_pack_entries_metal_check_last_id_fkey'
  ) then
    alter table public.process_packaging_pack_entries
      add constraint process_packaging_pack_entries_metal_check_last_id_fkey
      foreign key (metal_check_last_id) references public.process_packaging_metal_checks (id) on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'process_packaging_pack_entries_metal_check_last_checked_by_fkey'
  ) then
    alter table public.process_packaging_pack_entries
      add constraint process_packaging_pack_entries_metal_check_last_checked_by_fkey
      foreign key (metal_check_last_checked_by) references auth.users (id) on delete set null;
  end if;
end
$$;

create index if not exists process_packaging_pack_entries_metal_check_status_idx
  on public.process_packaging_pack_entries using btree (metal_check_status)
  tablespace pg_default;

create index if not exists process_packaging_pack_entries_metal_check_last_id_idx
  on public.process_packaging_pack_entries using btree (metal_check_last_id)
  tablespace pg_default;
