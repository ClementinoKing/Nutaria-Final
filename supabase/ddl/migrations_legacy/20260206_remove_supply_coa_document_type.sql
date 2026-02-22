-- Remove supply-level COA document type: COA is now tracked on the supplier (documents table, owner_type='supplier').
-- Delete existing supply_documents rows that stored the "COA available" flag.
delete from public.supply_documents
where document_type_code = 'COA';

-- Remove the COA type from supply_document_types so it is no longer used for supplies.
delete from public.supply_document_types
where code = 'COA';
