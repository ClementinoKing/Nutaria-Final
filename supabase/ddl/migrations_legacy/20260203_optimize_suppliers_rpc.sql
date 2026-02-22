-- Ensure supplier contact columns exist for RPC payloads
alter table if exists public.suppliers
  add column if not exists primary_contact_email text null,
  add column if not exists primary_contact_phone text null;

create or replace function public.get_suppliers_list(
  p_search text default null,
  p_type text default null,
  p_country text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id integer,
  name text,
  supplier_type text,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  phone text,
  email text,
  country text,
  address text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
as $$
  with filtered as (
    select s.*
    from public.suppliers s
    where
      (p_type is null or p_type = '' or s.supplier_type = p_type)
      and (p_country is null or p_country = '' or s.country = p_country)
      and (
        p_search is null or p_search = '' or (
          s.name ilike '%' || p_search || '%'
          or s.email ilike '%' || p_search || '%'
          or s.phone ilike '%' || p_search || '%'
          or s.primary_contact_name ilike '%' || p_search || '%'
          or s.primary_contact_email ilike '%' || p_search || '%'
          or s.primary_contact_phone ilike '%' || p_search || '%'
          or s.address ilike '%' || p_search || '%'
        )
      )
  )
  select
    id,
    name,
    supplier_type,
    primary_contact_name,
    primary_contact_email,
    primary_contact_phone,
    phone,
    email,
    country,
    address,
    created_at,
    count(*) over() as total_count
  from filtered
  order by created_at desc
  limit p_limit offset p_offset;
$$;

create or replace function public.get_supplier_detail(p_supplier_id integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'supplier', to_jsonb(s),
    'documents',
      coalesce(
        (
          select jsonb_agg(d order by d.uploaded_at desc)
          from public.documents d
          where d.owner_type = 'supplier' and d.owner_id = s.id
        ),
        '[]'::jsonb
      )
  )
  from public.suppliers s
  where s.id = p_supplier_id;
$$;

create or replace function public.get_supplier_countries()
returns table (country text)
language sql
stable
as $$
  select distinct s.country
  from public.suppliers s
  where s.country is not null and btrim(s.country) <> ''
  order by s.country;
$$;
