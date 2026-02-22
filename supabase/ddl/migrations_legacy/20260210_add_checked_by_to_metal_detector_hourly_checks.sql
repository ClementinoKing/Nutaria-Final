alter table if exists public.metal_detector_hourly_checks
  add column if not exists checked_by uuid;

alter table if exists public.metal_detector_hourly_checks
  add column if not exists checked_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'metal_detector_hourly_checks_checked_by_fkey'
  ) then
    alter table public.metal_detector_hourly_checks
      add constraint metal_detector_hourly_checks_checked_by_fkey
      foreign key (checked_by) references auth.users (id) on delete set null;
  end if;
end
$$;

update public.metal_detector_hourly_checks
set
  checked_by = coalesce(checked_by, created_by),
  checked_at = coalesce(checked_at, updated_at)
where checked_by is null or checked_at is null;
