-- Track damaged packet units on pack entries so inventory consumption can include damaged stock.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'process_packaging_pack_entries'
  ) then
    alter table public.process_packaging_pack_entries
      add column if not exists damaged_pack_count integer not null default 0;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'process_packaging_pack_entries'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'process_packaging_pack_entries_damaged_pack_count_check'
  ) then
    alter table public.process_packaging_pack_entries
      add constraint process_packaging_pack_entries_damaged_pack_count_check
      check (damaged_pack_count >= 0);
  end if;
end
$$;
