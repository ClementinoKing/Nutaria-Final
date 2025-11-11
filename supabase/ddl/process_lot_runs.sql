create table if not exists public.process_lot_runs (
  id bigserial primary key,
  supply_batch_id bigint not null references public.supply_batches (id) on delete cascade,
  process_id bigint not null references public.processes (id),
  status text not null default 'IN_PROGRESS',
  step_progress jsonb not null default '[]'::jsonb,
  started_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint process_lot_runs_status_check check (
    status = any (array['IN_PROGRESS'::text, 'COMPLETED'::text])
  ),
  constraint process_lot_runs_batch_unique unique (supply_batch_id)
) tablespace pg_default;

create index if not exists process_lot_runs_batch_idx
  on public.process_lot_runs using btree (supply_batch_id)
  tablespace pg_default;

create index if not exists process_lot_runs_process_idx
  on public.process_lot_runs using btree (process_id)
  tablespace pg_default;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'process_lot_runs_set_updated_at'
  ) then
    create trigger process_lot_runs_set_updated_at
      before update on public.process_lot_runs
      for each row
      execute function set_current_timestamp_updated_at();
  end if;
end
$$;

