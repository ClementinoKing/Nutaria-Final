-- Add finished product to pack entries (what product is being packed)
alter table public.process_packaging_pack_entries
  add column if not exists product_id bigint null;

alter table public.process_packaging_pack_entries
  add constraint process_packaging_pack_entries_product_id_fkey
  foreign key (product_id) references public.products (id) on delete set null;

create index if not exists process_packaging_pack_entries_product_id_idx
  on public.process_packaging_pack_entries using btree (product_id);
