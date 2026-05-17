create table if not exists public.visitor_questionnaires (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'DRAFT',
  visit_date date,
  completed_by uuid references public.user_profiles(id) on delete set null,
  recorded_by uuid references public.user_profiles(id) on delete set null,
  visitor_name text,
  company text,
  reason_for_visit text,
  contact_number text,
  declaration text,
  visitor_signature text,
  employee_signature text,
  site_contact_name text,
  authorized_to_proceed boolean,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_questionnaires_status_check check (status in ('DRAFT', 'COMPLETED')),
  constraint visitor_questionnaires_completed_check check (
    (status = 'DRAFT' and completed_at is null)
    or (
      status = 'COMPLETED'
      and completed_at is not null
      and visit_date is not null
      and completed_by is not null
      and nullif(trim(visitor_name), '') is not null
      and nullif(trim(company), '') is not null
      and nullif(trim(reason_for_visit), '') is not null
      and nullif(trim(contact_number), '') is not null
      and nullif(trim(visitor_signature), '') is not null
      and nullif(trim(employee_signature), '') is not null
      and nullif(trim(site_contact_name), '') is not null
      and authorized_to_proceed is not null
    )
  )
);

create table if not exists public.visitor_questionnaire_questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.visitor_questionnaires(id) on delete cascade,
  question_key text not null,
  section_key text not null,
  question_text text not null,
  answer text,
  details text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_questionnaire_questions_answer_check check (answer is null or answer in ('YES', 'NO')),
  constraint visitor_questionnaire_questions_unique_key unique (questionnaire_id, question_key)
);

create table if not exists public.visitor_questionnaire_induction_items (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.visitor_questionnaires(id) on delete cascade,
  item_key text not null,
  item_text text not null,
  acknowledged boolean,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_questionnaire_induction_unique_key unique (questionnaire_id, item_key)
);

create index if not exists visitor_questionnaires_status_idx
  on public.visitor_questionnaires(status);

create index if not exists visitor_questionnaires_visit_date_idx
  on public.visitor_questionnaires(visit_date desc);

create index if not exists visitor_questionnaires_completed_by_idx
  on public.visitor_questionnaires(completed_by);

create index if not exists visitor_questionnaire_questions_questionnaire_id_idx
  on public.visitor_questionnaire_questions(questionnaire_id, sort_order);

create index if not exists visitor_questionnaire_induction_questionnaire_id_idx
  on public.visitor_questionnaire_induction_items(questionnaire_id, sort_order);

create or replace trigger visitor_questionnaires_set_updated_at
before update on public.visitor_questionnaires
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger visitor_questionnaire_questions_set_updated_at
before update on public.visitor_questionnaire_questions
for each row execute function public.set_current_timestamp_updated_at();

create or replace trigger visitor_questionnaire_induction_set_updated_at
before update on public.visitor_questionnaire_induction_items
for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_audit_visitor_questionnaires on public.visitor_questionnaires;
create trigger trg_audit_visitor_questionnaires
after insert or update or delete on public.visitor_questionnaires
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_visitor_questionnaire_questions on public.visitor_questionnaire_questions;
create trigger trg_audit_visitor_questionnaire_questions
after insert or update or delete on public.visitor_questionnaire_questions
for each row execute function public.audit_if_write();

drop trigger if exists trg_audit_visitor_questionnaire_induction on public.visitor_questionnaire_induction_items;
create trigger trg_audit_visitor_questionnaire_induction
after insert or update or delete on public.visitor_questionnaire_induction_items
for each row execute function public.audit_if_write();

alter table public.visitor_questionnaires enable row level security;
alter table public.visitor_questionnaire_questions enable row level security;
alter table public.visitor_questionnaire_induction_items enable row level security;

drop policy if exists visitor_questionnaires_read on public.visitor_questionnaires;
create policy visitor_questionnaires_read
on public.visitor_questionnaires
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists visitor_questionnaires_write on public.visitor_questionnaires;
create policy visitor_questionnaires_write
on public.visitor_questionnaires
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists visitor_questionnaire_questions_read on public.visitor_questionnaire_questions;
create policy visitor_questionnaire_questions_read
on public.visitor_questionnaire_questions
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists visitor_questionnaire_questions_write on public.visitor_questionnaire_questions;
create policy visitor_questionnaire_questions_write
on public.visitor_questionnaire_questions
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

drop policy if exists visitor_questionnaire_induction_read on public.visitor_questionnaire_induction_items;
create policy visitor_questionnaire_induction_read
on public.visitor_questionnaire_induction_items
for select
to authenticated
using (public.has_permission('workflow.checklist.manage'));

drop policy if exists visitor_questionnaire_induction_write on public.visitor_questionnaire_induction_items;
create policy visitor_questionnaire_induction_write
on public.visitor_questionnaire_induction_items
for all
to authenticated
using (public.has_permission('workflow.checklist.manage'))
with check (public.has_permission('workflow.checklist.manage'));

create or replace function public.upsert_visitor_questionnaire(
  p_questionnaire_id uuid,
  p_status text,
  p_visit_date date,
  p_completed_by uuid,
  p_visitor_name text,
  p_company text,
  p_reason_for_visit text,
  p_contact_number text,
  p_declaration text,
  p_visitor_signature text,
  p_employee_signature text,
  p_site_contact_name text,
  p_authorized_to_proceed boolean,
  p_questions jsonb,
  p_induction_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := upper(trim(coalesce(p_status, 'DRAFT')));
  v_questionnaire_id uuid := p_questionnaire_id;
  v_recorded_by uuid;
  v_existing_status text;
  v_question jsonb;
  v_induction jsonb;
  v_sort_order integer := 0;
begin
  perform public.require_permission('workflow.checklist.manage');

  if v_status not in ('DRAFT', 'COMPLETED') then
    raise exception 'invalid visitor questionnaire status: %', p_status using errcode = '22023';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'visitor questionnaire questions must be a JSON array' using errcode = '22023';
  end if;

  if p_induction_items is null or jsonb_typeof(p_induction_items) <> 'array' then
    raise exception 'visitor questionnaire induction items must be a JSON array' using errcode = '22023';
  end if;

  if v_status = 'COMPLETED' then
    if p_visit_date is null
      or p_completed_by is null
      or nullif(trim(coalesce(p_visitor_name, '')), '') is null
      or nullif(trim(coalesce(p_company, '')), '') is null
      or nullif(trim(coalesce(p_reason_for_visit, '')), '') is null
      or nullif(trim(coalesce(p_contact_number, '')), '') is null
      or nullif(trim(coalesce(p_visitor_signature, '')), '') is null
      or nullif(trim(coalesce(p_employee_signature, '')), '') is null
      or nullif(trim(coalesce(p_site_contact_name, '')), '') is null
      or p_authorized_to_proceed is null
    then
      raise exception 'visitor questionnaire header, signatures, and authorization are required before submission' using errcode = '23514';
    end if;
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

  if v_questionnaire_id is not null then
    select status
    into v_existing_status
    from public.visitor_questionnaires
    where id = v_questionnaire_id
    for update;

    if not found then
      raise exception 'visitor questionnaire % was not found', v_questionnaire_id using errcode = 'P0002';
    end if;

    if v_existing_status = 'COMPLETED' then
      raise exception 'completed visitor questionnaires are read-only' using errcode = '23514';
    end if;

    update public.visitor_questionnaires
    set status = v_status,
        visit_date = p_visit_date,
        completed_by = p_completed_by,
        recorded_by = v_recorded_by,
        visitor_name = nullif(trim(coalesce(p_visitor_name, '')), ''),
        company = nullif(trim(coalesce(p_company, '')), ''),
        reason_for_visit = nullif(trim(coalesce(p_reason_for_visit, '')), ''),
        contact_number = nullif(trim(coalesce(p_contact_number, '')), ''),
        declaration = nullif(trim(coalesce(p_declaration, '')), ''),
        visitor_signature = nullif(trim(coalesce(p_visitor_signature, '')), ''),
        employee_signature = nullif(trim(coalesce(p_employee_signature, '')), ''),
        site_contact_name = nullif(trim(coalesce(p_site_contact_name, '')), ''),
        authorized_to_proceed = p_authorized_to_proceed,
        completed_at = case when v_status = 'COMPLETED' then now() else null end
    where id = v_questionnaire_id;
  else
    insert into public.visitor_questionnaires (
      status,
      visit_date,
      completed_by,
      recorded_by,
      visitor_name,
      company,
      reason_for_visit,
      contact_number,
      declaration,
      visitor_signature,
      employee_signature,
      site_contact_name,
      authorized_to_proceed,
      completed_at
    )
    values (
      v_status,
      p_visit_date,
      p_completed_by,
      v_recorded_by,
      nullif(trim(coalesce(p_visitor_name, '')), ''),
      nullif(trim(coalesce(p_company, '')), ''),
      nullif(trim(coalesce(p_reason_for_visit, '')), ''),
      nullif(trim(coalesce(p_contact_number, '')), ''),
      nullif(trim(coalesce(p_declaration, '')), ''),
      nullif(trim(coalesce(p_visitor_signature, '')), ''),
      nullif(trim(coalesce(p_employee_signature, '')), ''),
      nullif(trim(coalesce(p_site_contact_name, '')), ''),
      p_authorized_to_proceed,
      case when v_status = 'COMPLETED' then now() else null end
    )
    returning id into v_questionnaire_id;
  end if;

  delete from public.visitor_questionnaire_questions
  where questionnaire_id = v_questionnaire_id;

  v_sort_order := 0;
  for v_question in select value from jsonb_array_elements(p_questions)
  loop
    v_sort_order := v_sort_order + 1;

    if nullif(trim(v_question->>'question_key'), '') is null
      or nullif(trim(v_question->>'section_key'), '') is null
      or nullif(trim(v_question->>'question_text'), '') is null
    then
      raise exception 'each visitor questionnaire question needs key, section, and question text' using errcode = '23514';
    end if;

    if v_status = 'COMPLETED' and nullif(trim(coalesce(v_question->>'answer', '')), '') is null then
      raise exception 'answer every visitor screening question before submission' using errcode = '23514';
    end if;

    insert into public.visitor_questionnaire_questions (
      questionnaire_id,
      question_key,
      section_key,
      question_text,
      answer,
      details,
      sort_order
    )
    values (
      v_questionnaire_id,
      trim(v_question->>'question_key'),
      trim(v_question->>'section_key'),
      trim(v_question->>'question_text'),
      nullif(trim(v_question->>'answer'), ''),
      nullif(trim(coalesce(v_question->>'details', '')), ''),
      coalesce(nullif(v_question->>'sort_order', '')::integer, v_sort_order)
    );
  end loop;

  delete from public.visitor_questionnaire_induction_items
  where questionnaire_id = v_questionnaire_id;

  v_sort_order := 0;
  for v_induction in select value from jsonb_array_elements(p_induction_items)
  loop
    v_sort_order := v_sort_order + 1;

    if nullif(trim(v_induction->>'item_key'), '') is null
      or nullif(trim(v_induction->>'item_text'), '') is null
    then
      raise exception 'each visitor induction item needs key and text' using errcode = '23514';
    end if;

    if v_status = 'COMPLETED' and nullif(trim(coalesce(v_induction->>'acknowledged', '')), '') is null then
      raise exception 'acknowledge every visitor induction item before submission' using errcode = '23514';
    end if;

    insert into public.visitor_questionnaire_induction_items (
      questionnaire_id,
      item_key,
      item_text,
      acknowledged,
      sort_order
    )
    values (
      v_questionnaire_id,
      trim(v_induction->>'item_key'),
      trim(v_induction->>'item_text'),
      case
        when v_induction ? 'acknowledged' then (v_induction->>'acknowledged')::boolean
        else null
      end,
      coalesce(nullif(v_induction->>'sort_order', '')::integer, v_sort_order)
    );
  end loop;

  return v_questionnaire_id;
end;
$$;

grant all on table public.visitor_questionnaires to authenticated;
grant all on table public.visitor_questionnaire_questions to authenticated;
grant all on table public.visitor_questionnaire_induction_items to authenticated;
grant execute on function public.upsert_visitor_questionnaire(uuid, text, date, uuid, text, text, text, text, text, text, text, text, boolean, jsonb, jsonb) to authenticated;
