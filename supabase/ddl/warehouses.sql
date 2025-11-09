-- Warehouses schema definition
create table if not exists public.warehouses (
  id serial not null,
  name text not null,
  code text null,
  enabled boolean null default true,
  created_at timestamp with time zone null default now(),
  constraint warehouses_pkey primary key (id),
  constraint warehouses_code_key unique (code),
  constraint warehouses_name_key unique (name)
) tablespace pg_default;


