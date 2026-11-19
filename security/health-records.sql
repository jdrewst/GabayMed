-- Health Record Vault (US-3.7). Run once in the Supabase SQL Editor before using /api/patient-health-records.
-- Creates the vault table, its Row Level Security policies, and a PRIVATE storage bucket.
-- Safe to re-run: nothing existing is dropped or overwritten.
BEGIN;

CREATE TABLE IF NOT EXISTS public.health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'lab_result', 'prescription', 'imaging', 'immunization', 'medical_certificate',
    'consultation', 'insurance', 'other'
  )),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  record_date date,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  storage_path text NOT NULL UNIQUE,
  -- 'patient' = uploaded by the patient; 'facility' = issued by a clinic.
  source text NOT NULL DEFAULT 'patient' CHECK (source IN ('patient', 'facility')),
  -- Permissions: facility-issued records are kept (not deletable by the patient).
  can_delete boolean NOT NULL DEFAULT true,
  -- Privacy control: whether the patient's care providers may view this file.
  share_with_providers boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_records_profile_idx
  ON public.health_records (profile_id, created_at DESC);

-- Patients may only read their own rows. All writes go through the API (service role),
-- which validates file type, size and ownership before touching the table.
ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "health_records_owner_select" ON public.health_records;
CREATE POLICY "health_records_owner_select" ON public.health_records
  FOR SELECT TO authenticated USING (profile_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.health_records FROM anon, authenticated;

-- Private bucket: no public URLs. Files are reached only through short-lived signed URLs
-- created by the API. Size and type limits are enforced by Storage itself.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'health-records', 'health-records', false, 10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;

-- No storage.objects policies are added on purpose: anon/authenticated users get no direct
-- access to the bucket. Uploads use one-time signed upload URLs issued by the API.

-- Check afterwards (read-only):
-- SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'health-records';
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'health_records';
