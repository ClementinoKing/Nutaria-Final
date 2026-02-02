-- Create process_packaging_pack_entries table
-- Tracks how much quantity of what style (sorted WIP) went into what packs
create table if not exists public.process_packaging_pack_entries (
  id bigserial not null,
  packaging_run_id bigint not null,
  sorting_output_id bigint not null,
  pack_identifier text not null,
  quantity_kg numeric not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_packaging_pack_entries_pkey primary key (id),
  constraint process_packaging_pack_entries_packaging_run_id_fkey foreign key (packaging_run_id) 
    references public.process_packaging_runs (id) on delete cascade,
  constraint process_packaging_pack_entries_sorting_output_id_fkey foreign key (sorting_output_id) 
    references public.process_sorting_outputs (id) on delete restrict,
  constraint process_packaging_pack_entries_quantity_kg_check check (quantity_kg > 0)
) tablespace pg_default;

create index if not exists process_packaging_pack_entries_packaging_run_id_idx
  on public.process_packaging_pack_entries using btree (packaging_run_id)
  tablespace pg_default;

create index if not exists process_packaging_pack_entries_sorting_output_id_idx
  on public.process_packaging_pack_entries using btree (sorting_output_id)
  tablespace pg_default;

create index if not exists process_packaging_pack_entries_pack_identifier_idx
  on public.process_packaging_pack_entries using btree (pack_identifier)
  tablespace pg_default;

-- Trigger to update updated_at timestamp
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'process_packaging_pack_entries_set_updated_at'
  ) then
    create trigger process_packaging_pack_entries_set_updated_at
      before update on public.process_packaging_pack_entries
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;
