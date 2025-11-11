-- Processes schema definition
create table if not exists public.processes (
  id bigserial not null,
  code text not null,
  name text not null,
  description text null,
  product_ids integer[] not null default '{}'::integer[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint processes_pkey primary key (id),
  constraint processes_code_key unique (code)
) tablespace pg_default;

create index if not exists processes_product_ids_idx
  on public.processes using gin (product_ids)
  tablespace pg_default;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'processes_set_updated_at'
  ) then
    create trigger processes_set_updated_at
      before update on public.processes
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;

-- Process steps schema definition
create table if not exists public.process_steps (
  id bigserial not null,
  process_id bigint not null,
  seq integer not null,
  step_code text not null,
  step_name text not null,
  description text null,
  requires_qc boolean not null default false,
  default_location_id integer null,
  estimated_duration interval null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_steps_pkey primary key (id),
  constraint process_steps_process_seq_key unique (process_id, seq),
  constraint process_steps_process_step_code_key unique (process_id, step_code),
  constraint process_steps_default_location_id_fkey foreign key (default_location_id) references public.warehouses (id),
  constraint process_steps_process_id_fkey foreign key (process_id) references public.processes (id) on delete cascade
) tablespace pg_default;

create index if not exists process_steps_process_id_idx
  on public.process_steps using btree (process_id)
  tablespace pg_default;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'process_steps_set_updated_at'
  ) then
    create trigger process_steps_set_updated_at
      before update on public.process_steps
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;


