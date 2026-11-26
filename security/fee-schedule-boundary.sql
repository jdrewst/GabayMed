-- Targeted fix based on the supplied live policy audit.
-- Changes fee_schedules policies only. Does not delete or alter stored data.
BEGIN;

ALTER TABLE public.fee_schedules ENABLE ROW LEVEL SECURITY;

-- These permissive policies bypass the intended clinic check on writes.
DROP POLICY IF EXISTS "Insert for authenticated" ON public.fee_schedules;
DROP POLICY IF EXISTS "Update for auth" ON public.fee_schedules;

-- Keep the existing fee_schedules_clinic_crud policy as the permission grant.
-- Require the current account to have a clinic role even if another permissive
-- policy is introduced later. settings_clinic_id checks role and auth.uid().
DROP POLICY IF EXISTS fee_schedules_account_boundary ON public.fee_schedules;
CREATE POLICY fee_schedules_account_boundary
ON public.fee_schedules AS RESTRICTIVE
FOR ALL TO authenticated
USING (facility_id = (SELECT public.settings_clinic_id()))
WITH CHECK (facility_id = (SELECT public.settings_clinic_id()));

-- Anonymous callers should get no schedule rows, without needing to execute
-- helper functions that intentionally have authenticated-only grants.
DROP POLICY IF EXISTS fee_schedules_no_anonymous ON public.fee_schedules;
CREATE POLICY fee_schedules_no_anonymous
ON public.fee_schedules AS RESTRICTIVE
FOR ALL TO anon USING (false) WITH CHECK (false);

COMMIT;

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'fee_schedules'
ORDER BY policyname;
