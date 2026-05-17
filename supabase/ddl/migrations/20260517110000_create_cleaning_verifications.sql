create table if not exists public.cleaning_verifications (
  id uuid primary key default gen_random_uuid(),
  frequency text not null,
  status text not null default 'DRAFT',
  verification_date date,
  signoff_by uuid references public.user_profiles(id) on delete set null,
  recorded_by uuid references public.user_profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cleaning_verifications_frequency_check check (frequency in ('DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL')),
  constraint cleaning_verifications_status_check check (status in ('DRAFT', 'COMPLETED')),
  constraint cleaning_verifications_completed_check check (
    (status = 'DRAFT' and completed_at is null)
    or (status = 'COMPLETED' and completed_at is not null and verification_date is not null and signoff_by is not null)
  )
);

create table if not exists public.cleaning_verification_items (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.cleaning_verifications(id) on delete cascade,
  item_key text not null,
  area_key text not null,
  area_name text not null,
  color_code text,
  item_name text not null,
  result text,
  notes text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cleaning_verification_items_result_check check (result is null or result in ('C', 'NC')),
  constraint cleaning_verification_items_unique_key unique (verification_id, item_key)
);

create table if not exists public.cleaning_verification_area_signoffs (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.cleaning_verifications(id) on delete cascade,
  area_key text not null,
  area_name text not null,
  signed_by text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cleaning_verification_area_signoffs_unique_key unique (verification_id, area_key)
);

create table if not exists public.cleaning_verification_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.cleaning_verifications(id) on delete cascade,
  row_key text not null,
  action_date date,
  non_conformance text,
  corrective_action text,
  signoff text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cleaning_verification_corrective_actions_unique_key unique (verification_id, row_key)
);

create index if not exists cleaning_verifications_frequency_status_idx
  on public.cleaning_verifications(frequency, status);

create index if not exists cleaning_verifications_verification_date_idx
  on public.cleaning_verifications(frequency, verification_date desc);

create index if not exists cleaning_verifications_signoff_by_idx
  on public.cleaning_verifications(signoff_by);

create index if not exists cleaning_verification_items_verification_id_idx
  on public.cleaning_verification_items(verification_id, sort_order);

create index if not exists cleaning_verification_area_signoffs_verification_id_idx
  on public.cleaning_verification_area_signoffs(verification_id, sort_order);

create index if not exists cleaning_verification_corrective_actions_verification_id_idx
  on public.cleaning_verification_corrective_actions(verification_id, sort_order);

create or replace trigger cleaning_verifications_set_updated_at
before update on public.cleaning_verifications
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger cleaning_verification_items_set_updated_at
before update on public.cleaning_verification_items
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger cleaning_verification_area_signoffs_set_updated_at
before update on public.cleaning_verification_area_signoffs
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger cleaning_verification_corrective_actions_set_updated_at
before update on public.cleaning_verification_corrective_actions
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_audit_cleaning_verifications on public.cleaning_verifications;
create trigger trg_audit_cleaning_verifications
after insert or update or delete on public.cleaning_verifications
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_cleaning_verification_items on public.cleaning_verification_items;
create trigger trg_audit_cleaning_verification_items
after insert or update or delete on public.cleaning_verification_items
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_cleaning_verification_area_signoffs on public.cleaning_verification_area_signoffs;
create trigger trg_audit_cleaning_verification_area_signoffs
after insert or update or delete on public.cleaning_verification_area_signoffs
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_cleaning_verification_corrective_actions on public.cleaning_verification_corrective_actions;
create trigger trg_audit_cleaning_verification_corrective_actions
after insert or update or delete on public.cleaning_verification_corrective_actions
for each row execute function public.audit_if_write();

alter table public.cleaning_verifications enable row level security;
alter table public.cleaning_verification_items enable row level security;
alter table public.cleaning_verification_area_signoffs enable row level security;
alter table public.cleaning_verification_corrective_actions enable row level security;

drop policy if exists cleaning_verifications_read on public.cleaning_verifications;
create policy cleaning_verifications_read
on public.cleaning_verifications
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists cleaning_verifications_write on public.cleaning_verifications;
create policy cleaning_verifications_write
on public.cleaning_verifications
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists cleaning_verification_items_read on public.cleaning_verification_items;
create policy cleaning_verification_items_read
on public.cleaning_verification_items
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists cleaning_verification_items_write on public.cleaning_verification_items;
create policy cleaning_verification_items_write
on public.cleaning_verification_items
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists cleaning_verification_area_signoffs_read on public.cleaning_verification_area_signoffs;
create policy cleaning_verification_area_signoffs_read
on public.cleaning_verification_area_signoffs
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists cleaning_verification_area_signoffs_write on public.cleaning_verification_area_signoffs;
create policy cleaning_verification_area_signoffs_write
on public.cleaning_verification_area_signoffs
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists cleaning_verification_corrective_actions_read on public.cleaning_verification_corrective_actions;
create policy cleaning_verification_corrective_actions_read
on public.cleaning_verification_corrective_actions
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists cleaning_verification_corrective_actions_write on public.cleaning_verification_corrective_actions;
create policy cleaning_verification_corrective_actions_write
on public.cleaning_verification_corrective_actions
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

create or replace function public.upsert_cleaning_verification(
  p_verification_id uuid,
  p_frequency text,
  p_status text,
  p_verification_date date,
  p_signoff_by uuid,
  p_items jsonb,
  p_area_signoffs jsonb,
  p_corrective_actions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frequency text := upper(trim(coalesce(p_frequency, '')));
  v_status text := upper(trim(coalesce(p_status, 'DRAFT')));
  v_verification_id uuid := p_verification_id;
  v_recorded_by uuid;
  v_existing_status text;
  v_item jsonb;
  v_area_signoff jsonb;
  v_action jsonb;
  v_sort_order integer := 0;
  v_action_has_any_value boolean;
begin
  perform public.require_permission('workflow.checklist.manage');

  if v_frequency not in ('DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL') then
    raise exception 'invalid cleaning verification frequency: %', p_frequency using errcode = '22023';
  end if;

  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid cleaning verification status: %', p_status using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'cleaning verification items must be a JSON array' using errcode = '22023';
  end if;

  if p_area_signoffs is null or jsonb_typeof(p_area_signoffs) <> 'array' then
    raise exception 'cleaning verification area signoffs must be a JSON array' using errcode = '22023';
  end if;

  if p_corrective_actions is null or jsonb_typeof(p_corrective_actions) <> 'array' then
    raise exception 'cleaning verification corrective actions must be a JSON array' using errcode = '22023';
  end if;

  if v_status = 'COMPLETED' and (p_verification_date is null or p_signoff_by is null) then
    raise exception 'verification date and signoff are required before submission' using errcode = '23514';
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
    from public.cleaning_verifications
    where id = v_verification_id
    for update;

    if not found then
      raise exception 'cleaning verification % was not found', v_verification_id using errcode = 'P0002';
    end if;

    if v_existing_status = 'COMPLETED' then
      raise exception 'completed cleaning verifications are read-only' using errcode = '23514';
    end if;

    update public.cleaning_verifications
    set frequency = v_frequency,
        status = v_status,
        verification_date = p_verification_date,
        signoff_by = p_signoff_by,
        recorded_by = v_recorded_by,
        completed_at = case when v_status = 'COMPLETED' then now() else null end
    where id = v_verification_id;
  else
    insert into public.cleaning_verifications (
      frequency,
      status,
      verification_date,
      signoff_by,
      recorded_by,
      completed_at
    )
    values (
      v_frequency,
      v_status,
      p_verification_date,
      p_signoff_by,
      v_recorded_by,
      case when v_status = 'COMPLETED' then now() else null end
    )
    returning id into v_verification_id;
  end if;

  delete from public.cleaning_verification_items
  where verification_id = v_verification_id;

  v_sort_order := 0;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;

    if nullif(trim(v_item->>'item_key'), '') is null
      or nullif(trim(v_item->>'area_key'), '') is null
      or nullif(trim(v_item->>'area_name'), '') is null
      or nullif(trim(v_item->>'item_name'), '') is null
    then
      raise exception 'each cleaning verification item needs item, area, and label fields' using errcode = '23514';
    end if;

    if v_status = 'COMPLETED' and nullif(trim(coalesce(v_item->>'result', '')), '') is null then
      raise exception 'complete every cleaning verification item before submission' using errcode = '23514';
    end if;

    insert into public.cleaning_verification_items (
      verification_id,
      item_key,
      area_key,
      area_name,
      color_code,
      item_name,
      result,
      notes,
      sort_order
    )
    values (
      v_verification_id,
      trim(v_item->>'item_key'),
      trim(v_item->>'area_key'),
      trim(v_item->>'area_name'),
      nullif(trim(coalesce(v_item->>'color_code', '')), ''),
      trim(v_item->>'item_name'),
      nullif(trim(coalesce(v_item->>'result', '')), ''),
      nullif(trim(coalesce(v_item->>'notes', '')), ''),
      coalesce(nullif(v_item->>'sort_order', '')::integer, v_sort_order)
    );
  end loop;

  delete from public.cleaning_verification_area_signoffs
  where verification_id = v_verification_id;

  v_sort_order := 0;
  for v_area_signoff in select value from jsonb_array_elements(p_area_signoffs)
  loop
    v_sort_order := v_sort_order + 1;

    if nullif(trim(v_area_signoff->>'area_key'), '') is null
      or nullif(trim(v_area_signoff->>'area_name'), '') is null
    then
      raise exception 'each cleaning verification area signoff needs area fields' using errcode = '23514';
    end if;

    if v_status = 'COMPLETED' and nullif(trim(coalesce(v_area_signoff->>'signed_by', '')), '') is null then
      raise exception 'sign off every cleaning verification area before submission' using errcode = '23514';
    end if;

    insert into public.cleaning_verification_area_signoffs (
      verification_id,
      area_key,
      area_name,
      signed_by,
      sort_order
    )
    values (
      v_verification_id,
      trim(v_area_signoff->>'area_key'),
      trim(v_area_signoff->>'area_name'),
      nullif(trim(coalesce(v_area_signoff->>'signed_by', '')), ''),
      coalesce(nullif(v_area_signoff->>'sort_order', '')::integer, v_sort_order)
    );
  end loop;

  delete from public.cleaning_verification_corrective_actions
  where verification_id = v_verification_id;

  v_sort_order := 0;
  for v_action in select value from jsonb_array_elements(p_corrective_actions)
  loop
    v_sort_order := v_sort_order + 1;

    if nullif(trim(v_action->>'row_key'), '') is null then
      raise exception 'each cleaning corrective action row needs a row key' using errcode = '23514';
    end if;

    v_action_has_any_value :=
      nullif(trim(coalesce(v_action->>'action_date', '')), '') is not null
      or nullif(trim(coalesce(v_action->>'non_conformance', '')), '') is not null
      or nullif(trim(coalesce(v_action->>'corrective_action', '')), '') is not null
      or nullif(trim(coalesce(v_action->>'signoff', '')), '') is not null;

    if v_status = 'COMPLETED' and v_action_has_any_value then
      if nullif(trim(coalesce(v_action->>'action_date', '')), '') is null
        or nullif(trim(coalesce(v_action->>'non_conformance', '')), '') is null
        or nullif(trim(coalesce(v_action->>'corrective_action', '')), '') is null
        or nullif(trim(coalesce(v_action->>'signoff', '')), '') is null
      then
        raise exception 'complete every started corrective action row before submission' using errcode = '23514';
      end if;
    end if;

    insert into public.cleaning_verification_corrective_actions (
      verification_id,
      row_key,
      action_date,
      non_conformance,
      corrective_action,
      signoff,
      sort_order
    )
    values (
      v_verification_id,
      trim(v_action->>'row_key'),
      nullif(v_action->>'action_date', '')::date,
      nullif(trim(coalesce(v_action->>'non_conformance', '')), ''),
      nullif(trim(coalesce(v_action->>'corrective_action', '')), ''),
      nullif(trim(coalesce(v_action->>'signoff', '')), ''),
      coalesce(nullif(v_action->>'sort_order', '')::integer, v_sort_order)
    );
  end loop;

  return v_verification_id;
end;
$$;

grant all on table public.cleaning_verifications to authenticated;
grant all on table public.cleaning_verification_items to authenticated;
grant all on table public.cleaning_verification_area_signoffs to authenticated;
grant all on table public.cleaning_verification_corrective_actions to authenticated;
grant execute on function public.upsert_cleaning_verification(uuid, text, text, date, uuid, jsonb, jsonb, jsonb) to authenticated;
