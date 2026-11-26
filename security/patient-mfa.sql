BEGIN;

-- Restrictive policies supplement the project's existing permission grants.
-- Keep security-definer helpers outside the API's exposed schemas.
CREATE SCHEMA IF NOT EXISTS patient_mfa_private;
REVOKE ALL ON SCHEMA patient_mfa_private FROM PUBLIC;
GRANT USAGE ON SCHEMA patient_mfa_private TO authenticated;

CREATE OR REPLACE FUNCTION patient_mfa_private.has_required_mfa()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt()->>'aal' = 'aal2', false) OR NOT EXISTS (
    SELECT 1 FROM auth.mfa_factors
    WHERE user_id = auth.uid() AND status = 'verified'
  );
$$;

REVOKE ALL ON FUNCTION patient_mfa_private.has_required_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION patient_mfa_private.has_required_mfa() TO authenticated;

DO $$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['profiles', 'patients', 'appointments', 'messages', 'ledger', 'claims', 'patient_insurance']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('DROP POLICY IF EXISTS patient_mfa_no_anonymous ON public.%I', relation);
    EXECUTE format('CREATE POLICY patient_mfa_no_anonymous ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', relation);
    EXECUTE format('DROP POLICY IF EXISTS patient_mfa_required ON public.%I', relation);
    EXECUTE format('CREATE POLICY patient_mfa_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT patient_mfa_private.has_required_mfa())) WITH CHECK ((SELECT patient_mfa_private.has_required_mfa()))', relation);
  END LOOP;
END $$;

COMMIT;
