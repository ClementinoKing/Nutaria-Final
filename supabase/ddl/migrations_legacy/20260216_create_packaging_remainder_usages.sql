-- Tracks consumption of packaging remainders when those remainders are reused in later pack entries.
-- Defensive migration: only runs when process_packaging_pack_entries exists.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'process_packaging_pack_entries'
  ) then
    execute $sql$
      create table if not exists public.process_packaging_remainder_usages (
        id bigserial not null,
        source_pack_entry_id bigint not null,
        consumer_pack_entry_id bigint not null,
        quantity_kg numeric not null,
        created_by uuid null,
        created_at timestamp with time zone not null default now(),
        constraint process_packaging_remainder_usages_pkey primary key (id),
        constraint process_packaging_remainder_usages_source_pack_entry_id_fkey
          foreign key (source_pack_entry_id) references public.process_packaging_pack_entries (id) on delete cascade,
        constraint process_packaging_remainder_usages_consumer_pack_entry_id_fkey
          foreign key (consumer_pack_entry_id) references public.process_packaging_pack_entries (id) on delete cascade,
        constraint process_packaging_remainder_usages_created_by_fkey
          foreign key (created_by) references auth.users (id) on delete set null,
        constraint process_packaging_remainder_usages_quantity_kg_check check (quantity_kg > 0),
        constraint process_packaging_remainder_usages_distinct_entries_check check (source_pack_entry_id <> consumer_pack_entry_id)
      ) tablespace pg_default
    $sql$;

    execute $sql$
      create index if not exists process_packaging_remainder_usages_source_pack_entry_id_idx
        on public.process_packaging_remainder_usages using btree (source_pack_entry_id)
        tablespace pg_default
    $sql$;

    execute $sql$
      create index if not exists process_packaging_remainder_usages_consumer_pack_entry_id_idx
        on public.process_packaging_remainder_usages using btree (consumer_pack_entry_id)
        tablespace pg_default
    $sql$;

    execute $sql$
      create index if not exists process_packaging_remainder_usages_created_at_desc_idx
        on public.process_packaging_remainder_usages using btree (created_at desc)
        tablespace pg_default
    $sql$;
  end if;
end
$$;

-- Guard source remainder balance so consumed quantity never exceeds source remainder_kg.
create or replace function public.guard_packaging_remainder_usage_balance()
returns trigger
language plpgsql
as $$
declare
  source_remainder numeric;
  already_consumed numeric;
  candidate_consumed numeric;
begin
  select coalesce(pe.remainder_kg, 0)
  into source_remainder
  from public.process_packaging_pack_entries pe
  where pe.id = new.source_pack_entry_id;

  if source_remainder <= 0 then
    raise exception 'Source pack entry % has no remainder available', new.source_pack_entry_id;
  end if;

  select coalesce(sum(u.quantity_kg), 0)
  into already_consumed
  from public.process_packaging_remainder_usages u
  where u.source_pack_entry_id = new.source_pack_entry_id
    and (tg_op <> 'UPDATE' or u.id <> old.id);

  candidate_consumed := already_consumed + coalesce(new.quantity_kg, 0);
  if candidate_consumed > source_remainder then
    raise exception 'Remainder over-consumed for source entry % (used %, source %)',
      new.source_pack_entry_id, candidate_consumed, source_remainder;
  end if;

  return new;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'process_packaging_remainder_usages'
  ) then
    if not exists (
      select 1 from pg_trigger where tgname = 'guard_packaging_remainder_usage_balance_trg'
    ) then
      create trigger guard_packaging_remainder_usage_balance_trg
        before insert or update on public.process_packaging_remainder_usages
        for each row
        execute function public.guard_packaging_remainder_usage_balance();
    end if;

    grant select, insert, update, delete on public.process_packaging_remainder_usages to anon, authenticated, service_role;
    grant usage, select on sequence public.process_packaging_remainder_usages_id_seq to anon, authenticated, service_role;
  end if;
end
$$;
