-- Products schema definition
create table if not exists public.products (
  id serial primary key,
  sku text not null constraint products_sku_key unique,
  name text not null,
  category text,
  base_unit_id integer references public.units (id),
  reorder_point numeric,
  safety_stock numeric,
  target_stock numeric,
  status text default 'ACTIVE'::text,
  product_type text default 'RAW'::text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint products_product_type_check check (product_type = any (array['RAW'::text, 'WIP'::text, 'FINISHED'::text, 'OP'::text))
  )
) tablespace pg_default;

create index if not exists products_sku_idx on public.products using btree (sku) tablespace pg_default;
create index if not exists products_category_idx on public.products using btree (category) tablespace pg_default;
