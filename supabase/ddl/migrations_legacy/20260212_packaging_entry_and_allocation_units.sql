-- Link packaging execution rows to packaging settings master data.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'process_packaging_pack_entries'
  ) then
    alter table public.process_packaging_pack_entries
      add column if not exists packet_unit_code text null;
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
    where conname = 'process_packaging_pack_entries_packet_unit_code_fkey'
  ) then
    alter table public.process_packaging_pack_entries
      add constraint process_packaging_pack_entries_packet_unit_code_fkey
      foreign key (packet_unit_code) references public.packaging_units (code) on delete restrict;
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
  ) then
    create index if not exists process_packaging_pack_entries_packet_unit_code_idx
      on public.process_packaging_pack_entries using btree (packet_unit_code)
      tablespace pg_default;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'process_packaging_storage_allocations'
  ) then
    alter table public.process_packaging_storage_allocations
      add column if not exists box_unit_code text null;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'process_packaging_storage_allocations'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'process_packaging_storage_allocations_box_unit_code_fkey'
  ) then
    alter table public.process_packaging_storage_allocations
      add constraint process_packaging_storage_allocations_box_unit_code_fkey
      foreign key (box_unit_code) references public.packaging_units (code) on delete restrict;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'process_packaging_storage_allocations'
  ) then
    create index if not exists process_packaging_storage_allocations_box_unit_code_idx
      on public.process_packaging_storage_allocations using btree (box_unit_code)
      tablespace pg_default;
  end if;
end
$$;
