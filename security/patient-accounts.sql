-- Patient accounts for the mobile app (US-3.0). Adds missing columns only; no data is removed.
-- Run in Supabase SQL Editor before using /api/patient-register and /api/patient-login.
-- Requires security/login-attempts.sql (patient login shares the failed-login cooldown).
BEGIN;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS name_suffix text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS blood_type text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS medical_history text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_consent boolean,
  ADD COLUMN IF NOT EXISTS data_sharing_consent boolean,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Existing patient profiles skip the first-login walkthrough.
UPDATE public.profiles SET onboarding_completed_at = now()
WHERE onboarding_completed_at IS NULL AND terms_accepted_at IS NULL;
COMMIT;

-- Check afterwards (read-only):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'profiles' ORDER BY ordinal_position;
