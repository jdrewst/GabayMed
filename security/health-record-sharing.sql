-- Cross-app Health Record sharing (US-4.0). Run once in the Supabase SQL Editor after health-records.sql.
-- Gabay 1.0 clinic staff reach shared vault files ONLY through /api/provider-health-records, which checks
-- staff role, same facility, profiles.data_sharing_consent = true and health_records.share_with_providers = true
-- on every request. No table or storage policy is added for staff: direct reads stay blocked by RLS.
-- Safe to re-run: nothing existing is dropped or overwritten.
BEGIN;

-- Fast lookup of a patient's shared files (the staff query filters on both columns).
CREATE INDEX IF NOT EXISTS health_records_shared_idx
  ON public.health_records (profile_id, created_at DESC)
  WHERE share_with_providers = true;

-- Audit trail of clinic access to shared files (view / download). Written by the API only.
CREATE TABLE IF NOT EXISTS public.health_record_access_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  patient_id text NOT NULL,
  facility_id text NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('view', 'download')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_record_access_log_profile_idx
  ON public.health_record_access_log (profile_id, created_at DESC);

-- No policies: only the service role (the API) can read or write the log.
ALTER TABLE public.health_record_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.health_record_access_log FROM anon, authenticated;

COMMIT;

-- Check afterwards (read-only):
-- SELECT indexname FROM pg_indexes WHERE tablename = 'health_records';
-- SELECT policyname FROM pg_policies WHERE tablename IN ('health_records', 'health_record_access_log');
