create table if not exists public.audit_logs (
  id uuid not null default gen_random_uuid(),
  table_schema text not null default 'public'::text,
  table_name text not null,
  operation text not null,
  changed_by uuid null,
  change_time timestamp with time zone not null default now(),
  primary_key jsonb null,
  old_data jsonb null,
  new_data jsonb null,
  change_summary text null,
  meta jsonb null default '{}'::jsonb,
  constraint audit_logs_pkey primary key (id),
  constraint audit_logs_operation_check check (
    (
      operation = any (
        array['INSERT'::text, 'UPDATE'::text, 'DELETE'::text]
      )
    )
  )
) TABLESPACE pg_default;

create index if not exists audit_logs_table_time_idx 
  on public.audit_logs using btree (table_name, change_time desc) 
  TABLESPACE pg_default;

create index if not exists audit_logs_table_schema_idx 
  on public.audit_logs using btree (table_schema) 
  TABLESPACE pg_default;

