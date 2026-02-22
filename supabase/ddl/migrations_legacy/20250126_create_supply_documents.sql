-- Create supply_documents table
create table if not exists public.supply_documents (
  id bigserial primary key,
  supply_id bigint not null references public.supplies (id) on delete cascade,
  document_type_code text not null references public.supply_document_types (code) on delete restrict,
  value text null,
  date_value date null,
  boolean_value boolean null,
  document_id bigint null references public.documents (id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint supply_documents_supply_document_type_unique unique (supply_id, document_type_code)
) tablespace pg_default;

create index if not exists supply_documents_supply_id_idx
  on public.supply_documents using btree (supply_id) tablespace pg_default;

create index if not exists supply_documents_document_type_code_idx
  on public.supply_documents using btree (document_type_code) tablespace pg_default;

create trigger trg_audit_supply_documents
after INSERT
or DELETE
or UPDATE on supply_documents for EACH row
execute FUNCTION audit_if_write ();
