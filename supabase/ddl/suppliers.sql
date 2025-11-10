-- Supplier schema definition with extended profile fields
create table if not exists public.suppliers (
  id serial not null,
  name text not null,
  supplier_type text not null,
  primary_contact_name text null,
  phone text null,
  email text null,
  address text null,
  country text null,
  supplier_age integer null,
  gender text null,
  number_of_employees integer null,
  number_of_dependants integer null,
  bank text null,
  account_number text null,
  branch text null,
  is_halal_certified boolean null default false,
  created_at timestamp with time zone null default now(),
  constraint suppliers_pkey primary key (id),
  constraint suppliers_name_key unique (name),
  constraint suppliers_supplier_type_check check (
    supplier_type = any (array['NUT', 'OPERATIONAL'])
  )
) tablespace pg_default;

-- Documents schema definition referencing suppliers
create table if not exists public.documents (
  id bigserial not null,
  owner_type text not null,
  owner_id integer not null,
  name text not null,
  doc_type text null,
  storage_path text not null,
  expiry_date date null,
  uploaded_by uuid null,
  uploaded_at timestamp with time zone null default now(),
  constraint documents_pkey primary key (id),
  constraint documents_owner_id_fkey foreign key (owner_id) references suppliers (id),
  constraint documents_uploaded_by_fkey foreign key (uploaded_by) references user_profiles (id),
  constraint documents_owner_type_check check (
    owner_type = any (array['supply', 'shipment', 'supplier'])
  )
) tablespace pg_default;

create index if not exists documents_owner_idx
  on public.documents using btree (owner_type, owner_id)
  tablespace pg_default;

-- Migration helper for existing deployments
alter table if exists public.suppliers
  add column if not exists supplier_age integer null,
  add column if not exists gender text null,
  add column if not exists number_of_employees integer null,
  add column if not exists number_of_dependants integer null,
  add column if not exists bank text null,
  add column if not exists account_number text null,
  add column if not exists branch text null;

alter table if exists public.suppliers
  drop column if exists banking_details;

alter table if exists public.suppliers
  drop constraint if exists suppliers_supplier_type_check,
  add constraint suppliers_supplier_type_check check (
    supplier_type = any (array['NUT', 'OPERATIONAL'])
  );

alter table if exists public.suppliers
  drop column if exists proof_of_residence;

alter table if exists public.documents
  drop constraint if exists documents_owner_type_check,
  add constraint documents_owner_type_check check (
    owner_type = any (array['supply', 'shipment', 'supplier'])
  );

alter table if exists public.documents
  add column if not exists expiry_date date null;

