begin;

alter table public.supply_payments
  add column if not exists proof_name text null,
  add column if not exists proof_type text null,
  add column if not exists proof_source text null
    check (proof_source = any (array['URL'::text, 'FILE_PATH'::text, 'STORAGE'::text, 'MANUAL'::text])),
  add column if not exists recorded_by uuid null references auth.users(id) on delete set null,
  add column if not exists updated_by uuid null references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.supply_payments
  alter column recorded_by set default auth.uid();

comment on column public.supply_payments.proof_name is 'Display filename/title for payment proof.';
comment on column public.supply_payments.proof_type is 'Proof MIME type or category (for example application/pdf).';
comment on column public.supply_payments.proof_source is 'Proof reference source: URL, FILE_PATH, STORAGE, or MANUAL.';
comment on column public.supply_payments.recorded_by is 'Auth user who recorded this payment.';
comment on column public.supply_payments.updated_by is 'Auth user who last updated this payment.';
comment on column public.supply_payments.updated_at is 'Last update timestamp for this payment row.';

update public.supply_payments
set proof_source = case
  when proof_storage_path ilike 'http://%' or proof_storage_path ilike 'https://%' then 'URL'
  when proof_storage_path like 'payments/%' then 'STORAGE'
  when proof_storage_path is not null and btrim(proof_storage_path) <> '' then 'FILE_PATH'
  else null
end
where proof_source is null;

create or replace function public.set_supply_payment_updated_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_by = auth.uid();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'supply_payments_set_updated_at'
  ) then
    create trigger supply_payments_set_updated_at
      before update on public.supply_payments
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'supply_payments_set_updated_by'
  ) then
    create trigger supply_payments_set_updated_by
      before update on public.supply_payments
      for each row
      execute function public.set_supply_payment_updated_by();
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_proc where proname = 'audit_if_write'
  ) and not exists (
    select 1 from pg_trigger where tgname = 'trg_audit_supply_payments'
  ) then
    create trigger trg_audit_supply_payments
      after insert or update or delete on public.supply_payments
      for each row execute function audit_if_write();
  end if;
end $$;

commit;
