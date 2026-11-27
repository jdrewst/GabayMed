BEGIN;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(patient_id),
  sender_type text NOT NULL CHECK (sender_type IN ('patient', 'staff')),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS messages_patient_created_idx
  ON public.messages (patient_id, created_at DESC, id);

-- Resolve identity from the database so callers cannot choose their clinic or role.
CREATE OR REPLACE FUNCTION public.can_access_clinic_message(target_patient uuid, participant text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients AS patient
    WHERE patient.patient_id = target_patient
      AND CASE participant
        WHEN 'patient' THEN patient.profile_id = (SELECT auth.uid())
        WHEN 'staff' THEN EXISTS (
          SELECT 1 FROM public.users AS staff
          WHERE staff.id = (SELECT auth.uid())
            AND staff.facility_id = patient.facility_id
            AND staff.role IN ('IT Admin', 'Hospital Staff')
        )
        ELSE false
      END
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_clinic_message(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_clinic_message(uuid, text) TO authenticated;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT (patient_id, sender_type, content), UPDATE (is_read) ON public.messages TO authenticated;

DROP POLICY IF EXISTS messages_participant_select ON public.messages;
CREATE POLICY messages_participant_select ON public.messages FOR SELECT TO authenticated
  USING (public.can_access_clinic_message(patient_id, 'patient') OR public.can_access_clinic_message(patient_id, 'staff'));

DROP POLICY IF EXISTS messages_sender_insert ON public.messages;
CREATE POLICY messages_sender_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.can_access_clinic_message(patient_id, sender_type));

DROP POLICY IF EXISTS messages_recipient_read_receipt ON public.messages;
CREATE POLICY messages_recipient_read_receipt ON public.messages FOR UPDATE TO authenticated
  USING (public.can_access_clinic_message(patient_id, CASE sender_type WHEN 'staff' THEN 'patient' ELSE 'staff' END))
  WITH CHECK (is_read AND public.can_access_clinic_message(patient_id, CASE sender_type WHEN 'staff' THEN 'patient' ELSE 'staff' END));

COMMIT;

NOTIFY pgrst, 'reload schema';
