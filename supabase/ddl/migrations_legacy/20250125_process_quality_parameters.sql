-- Junction table for many-to-many relationship between processes and quality parameters
create table if not exists public.process_quality_parameters (
  id bigserial not null,
  process_id bigint not null,
  quality_parameter_id integer not null,
  created_at timestamp with time zone not null default now(),
  constraint process_quality_parameters_pkey primary key (id),
  constraint process_quality_parameters_process_id_fkey foreign key (process_id) references public.processes (id) on delete cascade,
  constraint process_quality_parameters_quality_parameter_id_fkey foreign key (quality_parameter_id) references public.quality_parameters (id) on delete restrict,
  constraint process_quality_parameters_process_quality_parameter_key unique (process_id, quality_parameter_id)
) tablespace pg_default;

create index if not exists process_quality_parameters_process_id_idx
  on public.process_quality_parameters using btree (process_id)
  tablespace pg_default;

create index if not exists process_quality_parameters_quality_parameter_id_idx
  on public.process_quality_parameters using btree (quality_parameter_id)
  tablespace pg_default;
