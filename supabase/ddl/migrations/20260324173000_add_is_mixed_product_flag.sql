BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_mixed_product boolean NOT NULL DEFAULT false;

UPDATE public.products p
SET is_mixed_product = true
WHERE upper(coalesce(p.product_type, '')) = 'FINISHED'
  AND EXISTS (
    SELECT 1
    FROM public.product_components pc
    JOIN public.products component_product
      ON component_product.id = pc.component_product_id
    WHERE pc.parent_product_id = p.id
      AND upper(coalesce(component_product.product_type, '')) = 'FINISHED'
  );

CREATE INDEX IF NOT EXISTS products_is_mixed_product_idx
  ON public.products(is_mixed_product)
  WHERE is_mixed_product = true;

COMMIT;
