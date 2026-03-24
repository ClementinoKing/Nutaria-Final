begin;

insert into public.roles (name, description)
values
  ('Super Admin', 'Full system-wide access'),
  ('Admin', 'Full access within an organization'),
  ('Production Administrator', 'Operational access for supply, shipment, and checklist workflows'),
  ('Production Manager', 'Operational access plus approvals and reporting'),
  ('Operator', 'Data capture only for production workflows')
on conflict (name) do update
set description = excluded.description;

commit;
