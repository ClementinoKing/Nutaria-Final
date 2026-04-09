-- Resets the product catalog only.
-- The database function is defined in migrations so this script can be used
-- as a simple entrypoint after db push.

select public.reset_products_catalog();
