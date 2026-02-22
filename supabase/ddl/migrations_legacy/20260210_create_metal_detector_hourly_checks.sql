-- Create table for hourly metal detector checks (8:00 AM to 5:00 PM)
create table if not exists public.metal_detector_hourly_checks (
  id bigserial not null,
  check_date date not null default current_date,
  check_hour time without time zone not null,
  fe_1_5mm text not null,
  non_fe_1_5mm text not null,
  ss_1_5mm text not null,
  remarks text,
  corrective_action text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint metal_detector_hourly_checks_pkey primary key (id),
  constraint metal_detector_hourly_checks_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null,
  constraint metal_detector_hourly_checks_fe_check check (fe_1_5mm = any (array['Yes'::text, 'No'::text])),
  constraint metal_detector_hourly_checks_non_fe_check check (non_fe_1_5mm = any (array['Yes'::text, 'No'::text])),
  constraint metal_detector_hourly_checks_ss_check check (ss_1_5mm = any (array['Yes'::text, 'No'::text])),
  constraint metal_detector_hourly_checks_hour_range_check check (
    extract(hour from check_hour) between 8 and 17
    and extract(minute from check_hour) = 0
    and extract(second from check_hour) = 0
  ),
  constraint metal_detector_hourly_checks_date_hour_unique unique (check_date, check_hour)
) tablespace pg_default;

create index if not exists metal_detector_hourly_checks_check_date_idx
  on public.metal_detector_hourly_checks using btree (check_date)
  tablespace pg_default;

create index if not exists metal_detector_hourly_checks_check_hour_idx
  on public.metal_detector_hourly_checks using btree (check_hour)
  tablespace pg_default;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'metal_detector_hourly_checks_set_updated_at'
  ) then
    create trigger metal_detector_hourly_checks_set_updated_at
      before update on public.metal_detector_hourly_checks
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;
