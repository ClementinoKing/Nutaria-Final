create table if not exists public.ablution_facility_records (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'DRAFT',
  record_date date,
  signed_off_by uuid references public.user_profiles(id) on delete set null,
  recorded_by uuid references public.user_profiles(id) on delete set null,
  corrective_actions text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ablution_facility_records_status_check check (status in ('DRAFT', 'COMPLETED')),
  constraint ablution_facility_records_completed_check check (
    (status = 'DRAFT' and completed_at is null)
    or (status = 'COMPLETED' and completed_at is not null and record_date is not null and signed_off_by is not null)
  )
);

create table if not exists public.ablution_facility_record_checks (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.ablution_facility_records(id) on delete cascade,
  check_key text not null,
  group_key text not null,
  group_label text not null,
  check_label text not null,
  result text,
  notes text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ablution_facility_record_checks_result_check check (result is null or result in ('C', 'NC')),
  constraint ablution_facility_record_checks_unique_key unique (record_id, check_key)
);

create table if not exists public.hygiene_records (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'DRAFT',
  record_date date,
  checked_by uuid references public.user_profiles(id) on delete set null,
  recorded_by uuid references public.user_profiles(id) on delete set null,
  names_checked text,
  comments text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hygiene_records_status_check check (status in ('DRAFT', 'COMPLETED')),
  constraint hygiene_records_completed_check check (
    (status = 'DRAFT' and completed_at is null)
    or (
      status = 'COMPLETED'
      and completed_at is not null
      and record_date is not null
      and checked_by is not null
      and nullif(trim(names_checked), '') is not null
    )
  )
);

create table if not exists public.hygiene_record_requirements (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.hygiene_records(id) on delete cascade,
  requirement_key text not null,
  requirement_label text not null,
  result text,
  notes text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hygiene_record_requirements_result_check check (result is null or result in ('PASS', 'FAIL')),
  constraint hygiene_record_requirements_unique_key unique (record_id, requirement_key)
);

create index if not exists ablution_facility_records_status_idx on public.ablution_facility_records(status);
create index if not exists ablution_facility_records_record_date_idx on public.ablution_facility_records(record_date desc);
create index if not exists ablution_facility_records_signed_off_by_idx on public.ablution_facility_records(signed_off_by);
create index if not exists ablution_facility_record_checks_record_id_idx on public.ablution_facility_record_checks(record_id, sort_order);

create index if not exists hygiene_records_status_idx on public.hygiene_records(status);
create index if not exists hygiene_records_record_date_idx on public.hygiene_records(record_date desc);
create index if not exists hygiene_records_checked_by_idx on public.hygiene_records(checked_by);
create index if not exists hygiene_record_requirements_record_id_idx on public.hygiene_record_requirements(record_id, sort_order);

create or replace trigger ablution_facility_records_set_updated_at
before update on public.ablution_facility_records
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger ablution_facility_record_checks_set_updated_at
before update on public.ablution_facility_record_checks
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger hygiene_records_set_updated_at
before update on public.hygiene_records
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger hygiene_record_requirements_set_updated_at
before update on public.hygiene_record_requirements
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_audit_ablution_facility_records on public.ablution_facility_records;
create trigger trg_audit_ablution_facility_records
after insert or update or delete on public.ablution_facility_records
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_ablution_facility_record_checks on public.ablution_facility_record_checks;
create trigger trg_audit_ablution_facility_record_checks
after insert or update or delete on public.ablution_facility_record_checks
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_hygiene_records on public.hygiene_records;
create trigger trg_audit_hygiene_records
after insert or update or delete on public.hygiene_records
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_hygiene_record_requirements on public.hygiene_record_requirements;
create trigger trg_audit_hygiene_record_requirements
after insert or update or delete on public.hygiene_record_requirements
for each row execute function public.audit_if_write();

alter table public.ablution_facility_records enable row level security;
alter table public.ablution_facility_record_checks enable row level security;
alter table public.hygiene_records enable row level security;
alter table public.hygiene_record_requirements enable row level security;

drop policy if exists ablution_facility_records_read on public.ablution_facility_records;
create policy ablution_facility_records_read on public.ablution_facility_records
for select to authenticated using (public.has_permission('workflow.checklist.manage'));

drop policy if exists ablution_facility_records_write on public.ablution_facility_records;
create policy ablution_facility_records_write on public.ablution_facility_records
for all to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists ablution_facility_record_checks_read on public.ablution_facility_record_checks;
create policy ablution_facility_record_checks_read on public.ablution_facility_record_checks
for select to authenticated using (public.has_permission('workflow.checklist.manage'));

drop policy if exists ablution_facility_record_checks_write on public.ablution_facility_record_checks;
create policy ablution_facility_record_checks_write on public.ablution_facility_record_checks
for all to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists hygiene_records_read on public.hygiene_records;
create policy hygiene_records_read on public.hygiene_records
for select to authenticated using (public.has_permission('workflow.checklist.manage'));

drop policy if exists hygiene_records_write on public.hygiene_records;
create policy hygiene_records_write on public.hygiene_records
for all to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists hygiene_record_requirements_read on public.hygiene_record_requirements;
create policy hygiene_record_requirements_read on public.hygiene_record_requirements
for select to authenticated using (public.has_permission('workflow.checklist.manage'));

drop policy if exists hygiene_record_requirements_write on public.hygiene_record_requirements;
create policy hygiene_record_requirements_write on public.hygiene_record_requirements
for all to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

create or replace function public.current_user_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.user_profiles
  where auth_user_id = auth.uid()
    and deleted_at is null
  limit 1
$$;

create or replace function public.upsert_ablution_facility_record(
  p_record_id uuid,
  p_status text,
  p_record_date date,
  p_signed_off_by uuid,
  p_corrective_actions text,
  p_checks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(trim(coalesce(p_status, 'DRAFT')));
  v_record_id uuid := p_record_id;
  v_recorded_by uuid;
  v_existing_status text;
  v_check jsonb;
  v_sort_order integer := 0;
begin
  perform public.require_permission('workflow.checklist.manage');

  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid ablution record status: %', p_status using errcode = '22023';
  end if;

  if p_checks is null or jsonb_typeof(p_checks) <> 'array' then
    raise exception 'ablution record checks must be a JSON array' using errcode = '22023';
  end if;

  if v_status = 'COMPLETED' and (p_record_date is null or p_signed_off_by is null) then
    raise exception 'record date and signed off by are required before submission' using errcode = '23514';
  end if;

  v_recorded_by := public.current_user_profile_id();
  if v_recorded_by is null then
    raise exception 'current user profile was not found' using errcode = '42501';
  end if;

  if v_record_id is not null then
    select status into v_existing_status from public.ablution_facility_records where id = v_record_id for update;
    if not found then
      raise exception 'ablution facility record % was not found', v_record_id using errcode = 'P0002';
    end if;
    if v_existing_status = 'COMPLETED' then
      raise exception 'completed ablution facility records are read-only' using errcode = '23514';
    end if;

    update public.ablution_facility_records
    set status = v_status,
        record_date = p_record_date,
        signed_off_by = p_signed_off_by,
        recorded_by = v_recorded_by,
        corrective_actions = nullif(trim(coalesce(p_corrective_actions, '')), ''),
        completed_at = case when v_status = 'COMPLETED' then now() else null end
    where id = v_record_id;
  else
    insert into public.ablution_facility_records (status, record_date, signed_off_by, recorded_by, corrective_actions, completed_at)
    values (
      v_status,
      p_record_date,
      p_signed_off_by,
      v_recorded_by,
      nullif(trim(coalesce(p_corrective_actions, '')), ''),
      case when v_status = 'COMPLETED' then now() else null end
    )
    returning id into v_record_id;
  end if;

  delete from public.ablution_facility_record_checks where record_id = v_record_id;

  for v_check in select value from jsonb_array_elements(p_checks)
  loop
    v_sort_order := v_sort_order + 1;

    if nullif(trim(v_check->>'check_key'), '') is null
      or nullif(trim(v_check->>'group_key'), '') is null
      or nullif(trim(v_check->>'group_label'), '') is null
      or nullif(trim(v_check->>'check_label'), '') is null
    then
      raise exception 'each ablution check needs key, group, and label fields' using errcode = '23514';
    end if;

    if v_status = 'COMPLETED' and nullif(trim(coalesce(v_check->>'result', '')), '') is null then
      raise exception 'complete every ablution check before submission' using errcode = '23514';
    end if;

    insert into public.ablution_facility_record_checks (
      record_id, check_key, group_key, group_label, check_label, result, notes, sort_order
    )
    values (
      v_record_id,
      trim(v_check->>'check_key'),
      trim(v_check->>'group_key'),
      trim(v_check->>'group_label'),
      trim(v_check->>'check_label'),
      nullif(trim(coalesce(v_check->>'result', '')), ''),
      nullif(trim(coalesce(v_check->>'notes', '')), ''),
      coalesce(nullif(v_check->>'sort_order', '')::integer, v_sort_order)
    );
  end loop;

  return v_record_id;
end;
$$;

create or replace function public.upsert_hygiene_record(
  p_record_id uuid,
  p_status text,
  p_record_date date,
  p_checked_by uuid,
  p_names_checked text,
  p_comments text,
  p_requirements jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(trim(coalesce(p_status, 'DRAFT')));
  v_record_id uuid := p_record_id;
  v_recorded_by uuid;
  v_existing_status text;
  v_requirement jsonb;
  v_sort_order integer := 0;
begin
  perform public.require_permission('workflow.checklist.manage');

  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid hygiene record status: %', p_status using errcode = '22023';
  end if;

  if p_requirements is null or jsonb_typeof(p_requirements) <> 'array' then
    raise exception 'hygiene record requirements must be a JSON array' using errcode = '22023';
  end if;

  if v_status = 'COMPLETED' and (
    p_record_date is null
    or p_checked_by is null
    or nullif(trim(coalesce(p_names_checked, '')), '') is null
  ) then
    raise exception 'record date, checked by, and sampled names are required before submission' using errcode = '23514';
  end if;

  v_recorded_by := public.current_user_profile_id();
  if v_recorded_by is null then
    raise exception 'current user profile was not found' using errcode = '42501';
  end if;

  if v_record_id is not null then
    select status into v_existing_status from public.hygiene_records where id = v_record_id for update;
    if not found then
      raise exception 'hygiene record % was not found', v_record_id using errcode = 'P0002';
    end if;
    if v_existing_status = 'COMPLETED' then
      raise exception 'completed hygiene records are read-only' using errcode = '23514';
    end if;

    update public.hygiene_records
    set status = v_status,
        record_date = p_record_date,
        checked_by = p_checked_by,
        recorded_by = v_recorded_by,
        names_checked = nullif(trim(coalesce(p_names_checked, '')), ''),
        comments = nullif(trim(coalesce(p_comments, '')), ''),
        completed_at = case when v_status = 'COMPLETED' then now() else null end
    where id = v_record_id;
  else
    insert into public.hygiene_records (status, record_date, checked_by, recorded_by, names_checked, comments, completed_at)
    values (
      v_status,
      p_record_date,
      p_checked_by,
      v_recorded_by,
      nullif(trim(coalesce(p_names_checked, '')), ''),
      nullif(trim(coalesce(p_comments, '')), ''),
      case when v_status = 'COMPLETED' then now() else null end
    )
    returning id into v_record_id;
  end if;

  delete from public.hygiene_record_requirements where record_id = v_record_id;

  for v_requirement in select value from jsonb_array_elements(p_requirements)
  loop
    v_sort_order := v_sort_order + 1;

    if nullif(trim(v_requirement->>'requirement_key'), '') is null
      or nullif(trim(v_requirement->>'requirement_label'), '') is null
    then
      raise exception 'each hygiene requirement needs key and label fields' using errcode = '23514';
    end if;

    if v_status = 'COMPLETED' and nullif(trim(coalesce(v_requirement->>'result', '')), '') is null then
      raise exception 'complete every hygiene requirement before submission' using errcode = '23514';
    end if;

    insert into public.hygiene_record_requirements (
      record_id, requirement_key, requirement_label, result, notes, sort_order
    )
    values (
      v_record_id,
      trim(v_requirement->>'requirement_key'),
      trim(v_requirement->>'requirement_label'),
      nullif(trim(coalesce(v_requirement->>'result', '')), ''),
      nullif(trim(coalesce(v_requirement->>'notes', '')), ''),
      coalesce(nullif(v_requirement->>'sort_order', '')::integer, v_sort_order)
    );
  end loop;

  return v_record_id;
end;
$$;

grant all on table public.ablution_facility_records to authenticated;
grant all on table public.ablution_facility_record_checks to authenticated;
grant all on table public.hygiene_records to authenticated;
grant all on table public.hygiene_record_requirements to authenticated;
grant execute on function public.current_user_profile_id() to authenticated;
grant execute on function public.upsert_ablution_facility_record(uuid, text, date, uuid, text, jsonb) to authenticated;
grant execute on function public.upsert_hygiene_record(uuid, text, date, uuid, text, text, jsonb) to authenticated;
