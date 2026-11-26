-- Read-only. Run in Supabase SQL Editor and share results, never credentials.
-- RLS state and policies, including patient-app tables: no policies are changed.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'storage') AND c.relkind = 'r'
ORDER BY 1, 2;

SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual AS using_condition, with_check
FROM pg_policies WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public' AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY routine_name, grantee;
