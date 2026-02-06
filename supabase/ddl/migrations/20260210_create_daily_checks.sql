-- Create table for Daily Checks page records
create table if not exists public.daily_checks (
  id bigserial not null,
  check_date date not null default current_date,
  category text not null,
  item_key text not null,
  item_name text not null,
  note text,
  completed boolean not null default false,
  completed_at timestamp with time zone,
  completed_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint daily_checks_pkey primary key (id),
  constraint daily_checks_completed_by_fkey
    foreign key (completed_by) references auth.users (id) on delete set null,
  constraint daily_checks_date_item_unique unique (check_date, item_key),
  constraint daily_checks_completed_consistency check (
    (completed = false and completed_at is null)
    or
    (completed = true and completed_at is not null)
  )
) tablespace pg_default;

create index if not exists daily_checks_check_date_idx
  on public.daily_checks using btree (check_date)
  tablespace pg_default;

create index if not exists daily_checks_category_idx
  on public.daily_checks using btree (category)
  tablespace pg_default;

create index if not exists daily_checks_completed_idx
  on public.daily_checks using btree (completed)
  tablespace pg_default;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'daily_checks_set_updated_at'
  ) then
    create trigger daily_checks_set_updated_at
      before update on public.daily_checks
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;
