alter table public.documents
  drop constraint if exists documents_owner_type_check,
  add constraint documents_owner_type_check check (
    owner_type = any (array['supply', 'shipment', 'supplier', 'supply_batch'])
  );
