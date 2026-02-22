-- Create process step quality checks table
create table if not exists public.process_step_quality_checks (
  id bigserial not null,
  process_step_run_id bigint not null,
  status text not null,
  overall_score numeric(4, 2),
  remarks text null,
  evaluated_by uuid references auth.users (id),
  evaluated_at timestamp with time zone null default now(),
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint process_step_quality_checks_pkey primary key (id),
  constraint process_step_quality_checks_process_step_run_id_fkey foreign key (process_step_run_id) 
    references public.process_step_runs (id) on delete cascade,
  constraint process_step_quality_checks_status_check check (
    status = any (array['PASS'::text, 'FAIL'::text, 'PENDING'::text])
  )
) tablespace pg_default;

create index if not exists process_step_quality_checks_step_run_id_idx
  on public.process_step_quality_checks using btree (process_step_run_id)
  tablespace pg_default;

-- Create process step quality check items table
create table if not exists public.process_step_quality_check_items (
  id bigserial not null,
  quality_check_id bigint not null,
  parameter_id integer not null,
  score integer not null,
  remarks text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  results text null,
  constraint process_step_quality_check_items_pkey primary key (id),
  constraint process_step_quality_check_items_quality_check_id_parameter_id_key unique (quality_check_id, parameter_id),
  constraint process_step_quality_check_items_parameter_id_fkey foreign key (parameter_id) 
    references public.quality_parameters (id) on delete restrict,
  constraint process_step_quality_check_items_quality_check_id_fkey foreign key (quality_check_id) 
    references public.process_step_quality_checks (id) on delete cascade,
  constraint process_step_quality_check_items_score_check check (
    (
      (score >= 1)
      and (score <= 4)
    )
  )
) tablespace pg_default;

create index if not exists process_step_quality_check_items_quality_check_id_idx
  on public.process_step_quality_check_items using btree (quality_check_id)
  tablespace pg_default;

create index if not exists process_step_quality_check_items_parameter_id_idx
  on public.process_step_quality_check_items using btree (parameter_id)
  tablespace pg_default;

create trigger trg_audit_process_step_quality_check_items
after INSERT
or DELETE
or UPDATE on public.process_step_quality_check_items for EACH row
execute FUNCTION audit_if_write ();
