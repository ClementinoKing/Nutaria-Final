-- Ensure required supplier categories exist for supplier_types.category_code FK
INSERT INTO public.supplier_categories (code, name)
VALUES
  ('PRODUCT', 'Product Supplier'),
  ('SERVICE', 'Service / Operational Supplier')
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name;
