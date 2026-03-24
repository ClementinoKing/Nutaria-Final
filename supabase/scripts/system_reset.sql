-- Resets all public data except the configured keep tables.
-- By default this preserves process_step_names and the RBAC/profile tables.
select public.system_reset_database();
