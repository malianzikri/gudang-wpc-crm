-- DEPRECATED: use crm_funnel_v2_patch_safe.sql before deploy, then
-- crm_funnel_v2_finalize.sql after V2 is live and verified.
--
-- The previous version updated rows to new statuses BEFORE dropping the old
-- leads_status_check constraint, which caused Postgres error 23514 on a live DB.

-- See:
--   1) supabase/crm_funnel_v2_patch_safe.sql
--   2) supabase/crm_funnel_v2_finalize.sql
