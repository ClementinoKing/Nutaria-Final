begin;

alter table public.supply_payments
  add column if not exists proof_storage_path text null;

comment on column public.supply_payments.proof_storage_path is
  'Supabase storage path to uploaded proof of payment (image/pdf).';

commit;
