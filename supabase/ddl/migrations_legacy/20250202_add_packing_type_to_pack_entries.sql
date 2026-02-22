-- Add packing_type to pack entries (Vacuum packing, Bag packing, Shop packing)
alter table public.process_packaging_pack_entries
  add column if not exists packing_type text null;

alter table public.process_packaging_pack_entries
  drop constraint if exists process_packaging_pack_entries_packing_type_check;

alter table public.process_packaging_pack_entries
  add constraint process_packaging_pack_entries_packing_type_check
  check (packing_type is null or packing_type in ('Vacuum packing', 'Bag packing', 'Shop packing'));

create index if not exists process_packaging_pack_entries_packing_type_idx
  on public.process_packaging_pack_entries using btree (packing_type);
