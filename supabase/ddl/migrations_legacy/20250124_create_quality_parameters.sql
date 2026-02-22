-- Ensure quality_parameters table exists (referenced by process_quality_parameters, process_step_quality_parameters, supply_quality_check_items).
-- Tables created via SQL need explicit grants for PostgREST/API access.
create table if not exists public.quality_parameters (
  id serial primary key,
  code text not null unique,
  name text not null,
  specification text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists quality_parameters_code_idx
  on public.quality_parameters using btree (code);

-- Expose table to Supabase API (anon and authenticated need these for REST)
grant select, insert, update, delete on public.quality_parameters to anon;
grant select, insert, update, delete on public.quality_parameters to authenticated;
grant usage, select on sequence public.quality_parameters_id_seq to anon;
grant usage, select on sequence public.quality_parameters_id_seq to authenticated;
