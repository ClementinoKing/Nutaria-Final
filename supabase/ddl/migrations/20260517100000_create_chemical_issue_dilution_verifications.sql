create table if not exists public.chemical_issue_dilution_verifications (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'DRAFT',
  signoff_by uuid references public.user_profiles(id) on delete set null,
  recorded_by uuid references public.user_profiles(id) on delete set null,
  signoff_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chemical_issue_dilution_verifications_status_check check (status in ('DRAFT', 'COMPLETED')),
  constraint chemical_issue_dilution_verifications_completed_check check (
    (status = 'DRAFT' and completed_at is null)
    or (status = 'COMPLETED' and completed_at is not null and signoff_by is not null and signoff_date is not null)
  )
);

create table if not exists public.chemical_issue_dilution_verification_items (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.chemical_issue_dilution_verifications(id) on delete cascade,
  row_key text not null,
  issue_date date,
  chemical_name text,
  batch_details text,
  quantity_issued text,
  dilution_verified_by text,
  issued_to text,
  issued_by text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chemical_issue_dilution_items_unique_key unique (verification_id, row_key)
);

create index if not exists chemical_issue_dilution_verifications_status_idx
  on public.chemical_issue_dilution_verifications(status);

create index if not exists chemical_issue_dilution_verifications_signoff_date_idx
  on public.chemical_issue_dilution_verifications(signoff_date desc);

create index if not exists chemical_issue_dilution_verifications_signoff_by_idx
  on public.chemical_issue_dilution_verifications(signoff_by);

create index if not exists chemical_issue_dilution_items_verification_id_idx
  on public.chemical_issue_dilution_verification_items(verification_id, sort_order);

create or replace trigger chemical_issue_dilution_verifications_set_updated_at
before update on public.chemical_issue_dilution_verifications
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger chemical_issue_dilution_items_set_updated_at
before update on public.chemical_issue_dilution_verification_items
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_audit_chemical_issue_dilution_verifications on public.chemical_issue_dilution_verifications;
create trigger trg_audit_chemical_issue_dilution_verifications
after insert or update or delete on public.chemical_issue_dilution_verifications
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_chemical_issue_dilution_items on public.chemical_issue_dilution_verification_items;
create trigger trg_audit_chemical_issue_dilution_items
after insert or update or delete on public.chemical_issue_dilution_verification_items
for each row execute function public.audit_if_write();

alter table public.chemical_issue_dilution_verifications enable row level security;
alter table public.chemical_issue_dilution_verification_items enable row level security;

drop policy if exists chemical_issue_dilution_verifications_read on public.chemical_issue_dilution_verifications;
create policy chemical_issue_dilution_verifications_read
on public.chemical_issue_dilution_verifications
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists chemical_issue_dilution_verifications_write on public.chemical_issue_dilution_verifications;
create policy chemical_issue_dilution_verifications_write
on public.chemical_issue_dilution_verifications
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists chemical_issue_dilution_items_read on public.chemical_issue_dilution_verification_items;
create policy chemical_issue_dilution_items_read
on public.chemical_issue_dilution_verification_items
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists chemical_issue_dilution_items_write on public.chemical_issue_dilution_verification_items;
create policy chemical_issue_dilution_items_write
on public.chemical_issue_dilution_verification_items
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

create or replace function public.upsert_chemical_issue_dilution_verification(
  p_verification_id uuid,
  p_status text,
  p_signoff_by uuid,
  p_signoff_date date,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(trim(coalesce(p_status, 'DRAFT')));
  v_verification_id uuid := p_verification_id;
  v_recorded_by uuid;
  v_existing_status text;
  v_item jsonb;
  v_sort_order integer := 0;
  v_has_completed_row boolean := false;
  v_row_has_any_value boolean;
begin
  perform public.require_permission('workflow.checklist.manage');

  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid chemical verification status: %', p_status using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'chemical verification items must be a JSON array' using errcode = '22023';
  end if;

  if v_status = 'COMPLETED' and (p_signoff_by is null or p_signoff_date is null) then
    raise exception 'signoff by and signoff date are required before submission' using errcode = '23514';
  end if;

  select id
  into v_recorded_by
  from public.user_profiles
  where auth_user_id = auth.uid()
    and deleted_at is null
  limit 1;

  if v_recorded_by is null then
    raise exception 'current user profile was not found' using errcode = '42501';
  end if;

  if v_verification_id is not null then
    select status
    into v_existing_status
    from public.chemical_issue_dilution_verifications
    where id = v_verification_id
    for update;

    if not found then
      raise exception 'chemical verification % was not found', v_verification_id using errcode = 'P0002';
    end if;

    if v_existing_status = 'COMPLETED' then
      raise exception 'completed chemical verifications are read-only' using errcode = '23514';
    end if;

    update public.chemical_issue_dilution_verifications
    set status = v_status,
        signoff_by = p_signoff_by,
        recorded_by = v_recorded_by,
        signoff_date = p_signoff_date,
        completed_at = case when v_status = 'COMPLETED' then now() else null end
    where id = v_verification_id;
  else
    insert into public.chemical_issue_dilution_verifications (
      status,
      signoff_by,
      recorded_by,
      signoff_date,
      completed_at
    )
    values (
      v_status,
      p_signoff_by,
      v_recorded_by,
      p_signoff_date,
      case when v_status = 'COMPLETED' then now() else null end
    )
    returning id into v_verification_id;
  end if;

  delete from public.chemical_issue_dilution_verification_items
  where verification_id = v_verification_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;

    if nullif(trim(v_item->>'row_key'), '') is null then
      raise exception 'each chemical verification row needs a row key' using errcode = '23514';
    end if;

    v_row_has_any_value :=
      nullif(trim(coalesce(v_item->>'issue_date', '')), '') is not null
      or nullif(trim(coalesce(v_item->>'chemical_name', '')), '') is not null
      or nullif(trim(coalesce(v_item->>'batch_details', '')), '') is not null
      or nullif(trim(coalesce(v_item->>'quantity_issued', '')), '') is not null
      or nullif(trim(coalesce(v_item->>'dilution_verified_by', '')), '') is not null
      or nullif(trim(coalesce(v_item->>'issued_to', '')), '') is not null
      or nullif(trim(coalesce(v_item->>'issued_by', '')), '') is not null;

    if v_status = 'COMPLETED' and v_row_has_any_value then
      if nullif(trim(coalesce(v_item->>'issue_date', '')), '') is null
        or nullif(trim(coalesce(v_item->>'chemical_name', '')), '') is null
        or nullif(trim(coalesce(v_item->>'batch_details', '')), '') is null
        or nullif(trim(coalesce(v_item->>'quantity_issued', '')), '') is null
        or nullif(trim(coalesce(v_item->>'dilution_verified_by', '')), '') is null
        or nullif(trim(coalesce(v_item->>'issued_to', '')), '') is null
        or nullif(trim(coalesce(v_item->>'issued_by', '')), '') is null
      then
        raise exception 'complete all fields for chemical verification row %', v_item->>'row_key' using errcode = '23514';
      end if;

      v_has_completed_row := true;
    end if;

    insert into public.chemical_issue_dilution_verification_items (
      verification_id,
      row_key,
      issue_date,
      chemical_name,
      batch_details,
      quantity_issued,
      dilution_verified_by,
      issued_to,
      issued_by,
      sort_order
    )
    values (
      v_verification_id,
      trim(v_item->>'row_key'),
      nullif(v_item->>'issue_date', '')::date,
      nullif(trim(v_item->>'chemical_name'), ''),
      nullif(trim(v_item->>'batch_details'), ''),
      nullif(trim(v_item->>'quantity_issued'), ''),
      nullif(trim(v_item->>'dilution_verified_by'), ''),
      nullif(trim(v_item->>'issued_to'), ''),
      nullif(trim(v_item->>'issued_by'), ''),
      coalesce(nullif(v_item->>'sort_order', '')::integer, v_sort_order)
    );
  end loop;

  if v_status = 'COMPLETED' and not v_has_completed_row then
    raise exception 'at least one completed chemical verification row is required before submission' using errcode = '23514';
  end if;

  return v_verification_id;
end;
$$;

grant all on table public.chemical_issue_dilution_verifications to authenticated;
grant all on table public.chemical_issue_dilution_verification_items to authenticated;
grant execute on function public.upsert_chemical_issue_dilution_verification(uuid, text, uuid, date, jsonb) to authenticated;
