begin;

create unique index if not exists products_name_type_unique_idx
  on public.products using btree (lower(btrim(name)), coalesce(upper(product_type), 'RAW'));

commit;
