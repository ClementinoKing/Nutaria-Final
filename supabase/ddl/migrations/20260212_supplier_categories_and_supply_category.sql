create table if not exists public.supplier_categories (
  code text primary key,
  name text not null
);

insert into public.supplier_categories (code, name)
values
  ('PRODUCT', 'Product Supplier'),
  ('SERVICE', 'Service / Operational Supplier')
on conflict (code) do update
set name = excluded.name;

alter table if exists public.supplier_types
  add column if not exists category_code text not null default 'PRODUCT';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplier_types_category_fkey'
  ) then
    alter table public.supplier_types
      add constraint supplier_types_category_fkey
      foreign key (category_code) references public.supplier_categories(code);
  end if;
end $$;

update public.supplier_types
set category_code = 'PRODUCT'
where code in ('GS', 'NS', 'SS');

update public.supplier_types
set category_code = 'SERVICE'
where code in ('OS');

alter table if exists public.supplies
  add column if not exists category_code text not null default 'PRODUCT';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'supplies_category_code_fkey'
  ) then
    alter table public.supplies
      add constraint supplies_category_code_fkey
      foreign key (category_code) references public.supplier_categories(code);
  end if;
end $$;
