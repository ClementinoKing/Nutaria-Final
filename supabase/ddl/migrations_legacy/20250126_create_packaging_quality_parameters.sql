-- Create packaging_quality_parameters table
create table if not exists public.packaging_quality_parameters (
  id serial primary key,
  code text not null unique,
  name text not null,
  input_type text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint packaging_quality_parameters_input_type_check check (
    input_type = any (array['YES_NO_NA'::text, 'NUMERIC'::text, 'GOOD_BAD_NA'::text])
  )
) tablespace pg_default;

create unique index if not exists packaging_quality_parameters_code_idx
  on public.packaging_quality_parameters using btree (code) tablespace pg_default;

create trigger trg_audit_packaging_quality_parameters
after INSERT
or DELETE
or UPDATE on packaging_quality_parameters for EACH row
execute FUNCTION audit_if_write ();

-- Insert default packaging quality parameters
insert into public.packaging_quality_parameters (code, name, input_type)
values
  ('INACCURATE_LABELLING', 'Inaccurate Labelling', 'YES_NO_NA'),
  ('VISIBLE_DAMAGE', 'Visible Damage', 'YES_NO_NA'),
  ('SPECIFIED_QUANTITY', 'Specified Quantity', 'NUMERIC'),
  ('ODOR', 'Odor', 'YES_NO_NA'),
  ('STRENGTH_INTEGRITY', 'Strength/Integrity', 'GOOD_BAD_NA')
on conflict (code) do update
set name = excluded.name,
    input_type = excluded.input_type,
    updated_at = now();
