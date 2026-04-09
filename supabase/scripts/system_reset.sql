-- Resets all public data except the configured keep tables.
-- The migration default preserves master data and settings tables.
select public.system_reset_database();
