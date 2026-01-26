-- Junction table for many-to-many relationship between process steps and quality parameters
create table if not exists public.process_step_quality_parameters (
  id bigserial not null,
  process_step_id bigint not null,
  quality_parameter_id integer not null,
  created_at timestamp with time zone not null default now(),
  constraint process_step_quality_parameters_pkey primary key (id),
  constraint process_step_quality_parameters_process_step_id_fkey foreign key (process_step_id) references public.process_steps (id) on delete cascade,
  constraint process_step_quality_parameters_quality_parameter_id_fkey foreign key (quality_parameter_id) references public.quality_parameters (id) on delete restrict,
  constraint process_step_quality_parameters_step_quality_parameter_key unique (process_step_id, quality_parameter_id)
) tablespace pg_default;

create index if not exists process_step_quality_parameters_step_id_idx
  on public.process_step_quality_parameters using btree (process_step_id)
  tablespace pg_default;

create index if not exists process_step_quality_parameters_quality_parameter_id_idx
  on public.process_step_quality_parameters using btree (quality_parameter_id)
  tablespace pg_default;
