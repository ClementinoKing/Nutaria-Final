-- Add can_be_skipped column to process_steps table
alter table public.process_steps
  add column if not exists can_be_skipped boolean not null default false;

comment on column public.process_steps.can_be_skipped is 'Indicates whether this process step can be skipped during execution';
