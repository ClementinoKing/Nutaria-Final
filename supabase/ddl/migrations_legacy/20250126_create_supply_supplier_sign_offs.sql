-- Create supply_supplier_sign_offs table
create table if not exists public.supply_supplier_sign_offs (
  id bigserial primary key,
  supply_id bigint not null references public.supplies (id) on delete cascade,
  signature_type text not null,
  signature_data text null,
  document_id bigint null references public.documents (id) on delete set null,
  signed_by_name text not null,
  signed_by bigint null references public.user_profiles (id) on delete set null,
  signed_at timestamp with time zone default now(),
  remarks text null,
  constraint supply_supplier_sign_offs_supply_id_unique unique (supply_id),
  constraint supply_supplier_sign_offs_signature_type_check check (
    signature_type = any (array['E_SIGNATURE'::text, 'UPLOADED_DOCUMENT'::text])
  )
) tablespace pg_default;

create index if not exists supply_supplier_sign_offs_supply_id_idx
  on public.supply_supplier_sign_offs using btree (supply_id) tablespace pg_default;

create trigger trg_audit_supply_supplier_sign_offs
after INSERT
or DELETE
or UPDATE on supply_supplier_sign_offs for EACH row
execute FUNCTION audit_if_write ();
