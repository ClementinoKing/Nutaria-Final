alter table public.shipment_pack_items
  add column if not exists box_count integer null;

alter table public.shipment_pack_items
  drop constraint if exists shipment_pack_items_box_count_check;

alter table public.shipment_pack_items
  add constraint shipment_pack_items_box_count_check
  check (box_count is null or box_count > 0);
