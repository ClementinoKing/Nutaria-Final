-- Create supply_document_types table
create table if not exists public.supply_document_types (
  id serial primary key,
  code text not null unique,
  name text not null,
  is_required boolean not null default false,
  allows_file_upload boolean not null default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
) tablespace pg_default;

create unique index if not exists supply_document_types_code_idx
  on public.supply_document_types using btree (code) tablespace pg_default;

create trigger trg_audit_supply_document_types
after INSERT
or DELETE
or UPDATE on supply_document_types for EACH row
execute FUNCTION audit_if_write ();

-- Insert default supply document types
insert into public.supply_document_types (code, name, is_required, allows_file_upload)
values
  ('INVOICE', 'Invoice Number', true, true),
  ('DRIVER_LICENSE', 'Driver License/Name', true, false),
  ('BATCH_NUMBER', 'Supply Batch Number', true, false),
  ('PRODUCTION_DATE', 'Production Date', false, false),
  ('EXPIRY_DATE', 'Expiry Date', false, false),
  ('COA', 'COA Available', false, false)
on conflict (code) do update
set name = excluded.name,
    is_required = excluded.is_required,
    allows_file_upload = excluded.allows_file_upload,
    updated_at = now();
