begin;

-- 1) Align supply batch status with app behavior (app already uses PROCESSING)
alter table public.supply_batches
  drop constraint if exists supply_batches_process_status_check;

alter table public.supply_batches
  add constraint supply_batches_process_status_check
  check (process_status = any (array['UNPROCESSED'::text, 'PROCESSING'::text, 'PROCESSED'::text]));

-- 2) Bridge table: one process run -> many supply batches (lots)
create table if not exists public.process_lot_run_batches (
  id bigserial primary key,
  process_lot_run_id bigint not null
    references public.process_lot_runs(id) on delete cascade,
  supply_batch_id bigint not null
    references public.supply_batches(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint process_lot_run_batches_run_batch_unique unique (process_lot_run_id, supply_batch_id),
  constraint process_lot_run_batches_batch_unique unique (supply_batch_id)
);

create index if not exists process_lot_run_batches_run_idx
  on public.process_lot_run_batches(process_lot_run_id);

create index if not exists process_lot_run_batches_batch_idx
  on public.process_lot_run_batches(supply_batch_id);

create unique index if not exists process_lot_run_batches_one_primary_per_run_idx
  on public.process_lot_run_batches(process_lot_run_id)
  where is_primary = true;

-- 2a) Backfill existing single-lot runs into bridge table
insert into public.process_lot_run_batches (process_lot_run_id, supply_batch_id, is_primary)
select plr.id, plr.supply_batch_id, true
from public.process_lot_runs plr
where plr.supply_batch_id is not null
on conflict on constraint process_lot_run_batches_run_batch_unique do nothing;

-- 3) Allow one production batch per lot within one run
-- (table exists in runtime schema even though not in repo DDL)
do $$
begin
  if to_regclass('public.production_batches') is not null then
    alter table public.production_batches
      add column if not exists supply_batch_id bigint
      references public.supply_batches(id) on delete restrict;

    update public.production_batches pb
    set supply_batch_id = plr.supply_batch_id
    from public.process_lot_runs plr
    where pb.process_lot_run_id = plr.id
      and pb.supply_batch_id is null
      and plr.supply_batch_id is not null;

    -- Drop any single-column unique constraint on process_lot_run_id
    -- so multiple per-lot rows can exist for one run.
    if exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'production_batches'
        and c.contype = 'u'
        and pg_get_constraintdef(c.oid) like '%(process_lot_run_id)%'
        and pg_get_constraintdef(c.oid) not like '%(process_lot_run_id, supply_batch_id)%'
    ) then
      execute (
        select format('alter table public.production_batches drop constraint %I', c.conname)
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'production_batches'
          and c.contype = 'u'
          and pg_get_constraintdef(c.oid) like '%(process_lot_run_id)%'
          and pg_get_constraintdef(c.oid) not like '%(process_lot_run_id, supply_batch_id)%'
        limit 1
      );
    end if;

    alter table public.production_batches
      add constraint production_batches_run_batch_unique
      unique (process_lot_run_id, supply_batch_id);
  end if;
end $$;

-- 4) Global metal detector start/stop session state (shared across users/pages)
create table if not exists public.metal_detector_check_sessions (
  id bigserial primary key,
  status text not null default 'ACTIVE'
    check (status = any (array['ACTIVE'::text, 'STOPPED'::text, 'EXPIRED'::text])),
  started_at timestamp with time zone not null default now(),
  ends_at timestamp with time zone not null,
  stopped_at timestamp with time zone null,
  started_by uuid null references auth.users(id) on delete set null,
  stopped_by uuid null references auth.users(id) on delete set null,
  started_from_process_lot_run_id bigint null references public.process_lot_runs(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists metal_detector_check_sessions_status_idx
  on public.metal_detector_check_sessions(status);

create unique index if not exists metal_detector_check_sessions_single_active_idx
  on public.metal_detector_check_sessions(status)
  where status = 'ACTIVE';

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'metal_detector_check_sessions_set_updated_at'
  ) then
    create trigger metal_detector_check_sessions_set_updated_at
      before update on public.metal_detector_check_sessions
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end $$;

commit;
