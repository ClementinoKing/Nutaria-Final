-- Units schema definition
create table if not exists public.units (
  id serial primary key,
  name text not null constraint units_name_key unique,
  symbol text not null constraint units_symbol_key unique,
  created_at timestamp with time zone default now()
) tablespace pg_default;

