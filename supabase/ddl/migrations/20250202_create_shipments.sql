-- Shipments and shipment line items for outbound deliveries
-- customer_id: optional FK if customers table exists; otherwise store snapshot in contact/address fields

create table if not exists public.shipments (
  id bigserial not null,
  doc_no text null,
  customer_id bigint null,
  warehouse_id bigint null,
  carrier_name text null,
  carrier_reference text null,
  planned_ship_date timestamp with time zone null,
  shipped_at timestamp with time zone null,
  expected_delivery timestamp with time zone null,
  doc_status text not null default 'PENDING',
  shipping_address text null,
  customer_contact_name text null,
  customer_contact_email text null,
  customer_contact_phone text null,
  notes text null,
  special_instructions text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint shipments_pkey primary key (id),
  constraint shipments_doc_status_check check (
    doc_status = any (array['PENDING'::text, 'READY'::text, 'SHIPPED'::text, 'DELIVERED'::text, 'CANCELLED'::text])
  )
) tablespace pg_default;

create unique index if not exists shipments_doc_no_key
  on public.shipments (doc_no) where (doc_no is not null and doc_no <> '');

create index if not exists shipments_customer_id_idx
  on public.shipments using btree (customer_id);
create index if not exists shipments_warehouse_id_idx
  on public.shipments using btree (warehouse_id);
create index if not exists shipments_doc_status_idx
  on public.shipments using btree (doc_status);
create index if not exists shipments_planned_ship_date_idx
  on public.shipments using btree (planned_ship_date);

-- FK to warehouses (table exists in project)
alter table public.shipments drop constraint if exists shipments_warehouse_id_fkey;
alter table public.shipments add constraint shipments_warehouse_id_fkey
  foreign key (warehouse_id) references public.warehouses (id) on delete set null;

create table if not exists public.shipment_items (
  id bigserial not null,
  shipment_id bigint not null,
  product_id bigint null,
  sku text null,
  description text null,
  quantity numeric not null default 0,
  unit text null,
  created_at timestamp with time zone not null default now(),
  constraint shipment_items_pkey primary key (id),
  constraint shipment_items_shipment_id_fkey foreign key (shipment_id)
    references public.shipments (id) on delete cascade
) tablespace pg_default;

create index if not exists shipment_items_shipment_id_idx
  on public.shipment_items using btree (shipment_id);
create index if not exists shipment_items_product_id_idx
  on public.shipment_items using btree (product_id);

-- Trigger for updated_at
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'shipments_set_updated_at'
  ) then
    create trigger shipments_set_updated_at
      before update on public.shipments
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;
