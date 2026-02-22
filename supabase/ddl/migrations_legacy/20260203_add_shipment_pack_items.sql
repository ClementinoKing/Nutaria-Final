create table if not exists public.shipment_pack_items (
  id bigserial not null,
  shipment_id bigint not null,
  pack_entry_id bigint not null,
  pack_count integer not null,
  box_label text null,
  created_at timestamp with time zone not null default now(),
  constraint shipment_pack_items_pkey primary key (id),
  constraint shipment_pack_items_shipment_id_fkey foreign key (shipment_id)
    references public.shipments (id) on delete cascade,
  constraint shipment_pack_items_pack_entry_id_fkey foreign key (pack_entry_id)
    references public.process_packaging_pack_entries (id) on delete restrict,
  constraint shipment_pack_items_pack_count_check check (pack_count > 0)
) tablespace pg_default;

create index if not exists shipment_pack_items_shipment_id_idx
  on public.shipment_pack_items using btree (shipment_id);

create index if not exists shipment_pack_items_pack_entry_id_idx
  on public.shipment_pack_items using btree (pack_entry_id);
