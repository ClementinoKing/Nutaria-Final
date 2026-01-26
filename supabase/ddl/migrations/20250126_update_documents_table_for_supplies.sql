-- Update documents table to support supplies
do $$
begin
  -- Drop the existing foreign key constraint if it exists
  alter table public.documents
    drop constraint if exists documents_owner_id_fkey;
  
  -- The owner_id will be a polymorphic reference (supplier_id or supply_id)
  -- We rely on application logic to ensure referential integrity based on owner_type
  -- No new constraint needed as owner_type check already allows 'supply'
end
$$;

-- Add document_type_code column if it doesn't exist (for compatibility with newer code)
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'document_type_code'
  ) then
    alter table public.documents
      add column document_type_code text null;
  end if;
end
$$;
