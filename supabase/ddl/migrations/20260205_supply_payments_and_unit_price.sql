-- Add unit_price to supply_lines so each product line can have its own price
alter table public.supply_lines
  add column if not exists unit_price numeric;

comment on column public.supply_lines.unit_price is 'Price per unit for this supply line (same product can have different prices per supply).';

-- Supply payments: track payments linked to a supply (partial or full)
create table if not exists public.supply_payments (
  id bigserial primary key,
  supply_id bigint not null references public.supplies (id) on delete cascade,
  amount numeric not null check (amount > 0),
  paid_at timestamp with time zone not null default now(),
  reference text,
  created_at timestamp with time zone default now()
) tablespace pg_default;

create index if not exists supply_payments_supply_id_idx
  on public.supply_payments using btree (supply_id) tablespace pg_default;

create index if not exists supply_payments_paid_at_idx
  on public.supply_payments using btree (paid_at desc) tablespace pg_default;

comment on table public.supply_payments is 'Payments made against supplies; each payment is linked to one supply. Suppliers may be paid in full or in part.';
