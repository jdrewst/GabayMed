BEGIN;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(patient_id),
  sender_type text NOT NULL CHECK (sender_type IN ('patient', 'staff')),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false
);

-- Preserve existing conversations in Main. Each branch starts with its own history.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS branch_key text NOT NULL DEFAULT 'main';
CREATE INDEX IF NOT EXISTS messages_branch_patient_created_idx
  ON public.messages (branch_key, patient_id, created_at DESC, id);

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

CREATE OR REPLACE FUNCTION public.is_clinic_message_branch(target_patient uuid, target_branch text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (public.can_access_clinic_message(target_patient, 'patient')
       OR public.can_access_clinic_message(target_patient, 'staff'))
    AND (target_branch IN ('main', 'branch-katipunan', 'branch-qc') OR EXISTS (
    SELECT 1 FROM public.patients AS patient
    JOIN public.clinic_branches AS branch ON branch.facility_id = patient.facility_id
    WHERE patient.patient_id = target_patient AND branch.branch_id::text = target_branch
  ));
$$;

REVOKE ALL ON FUNCTION public.is_clinic_message_branch(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_clinic_message_branch(uuid, text) TO authenticated;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT (patient_id, sender_type, content, branch_key), UPDATE (is_read) ON public.messages TO authenticated;

DROP POLICY IF EXISTS messages_participant_select ON public.messages;
CREATE POLICY messages_participant_select ON public.messages FOR SELECT TO authenticated
  USING (public.can_access_clinic_message(patient_id, 'patient') OR public.can_access_clinic_message(patient_id, 'staff'));

DROP POLICY IF EXISTS messages_sender_insert ON public.messages;
CREATE POLICY messages_sender_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.can_access_clinic_message(patient_id, sender_type)
    AND public.is_clinic_message_branch(patient_id, branch_key));

DROP POLICY IF EXISTS messages_recipient_read_receipt ON public.messages;
CREATE POLICY messages_recipient_read_receipt ON public.messages FOR UPDATE TO authenticated
  USING (public.can_access_clinic_message(patient_id, CASE sender_type WHEN 'staff' THEN 'patient' ELSE 'staff' END))
  WITH CHECK (is_read AND public.can_access_clinic_message(patient_id, CASE sender_type WHEN 'staff' THEN 'patient' ELSE 'staff' END));

CREATE TABLE IF NOT EXISTS public.branch_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(facility_id),
  sender_branch text NOT NULL,
  recipient_branch text NOT NULL,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_branch <> recipient_branch)
);

CREATE INDEX IF NOT EXISTS branch_messages_thread_idx
  ON public.branch_messages (facility_id, sender_branch, recipient_branch, created_at, id);

CREATE OR REPLACE FUNCTION public.can_message_hospital_branches(hospital uuid, sender text, recipient text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users AS staff
    WHERE staff.id = (SELECT auth.uid()) AND staff.facility_id = hospital
      AND staff.role IN ('IT Admin', 'Hospital Staff')
  ) AND NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY[sender, recipient]) AS requested(branch_key)
    WHERE requested.branch_key NOT IN ('main', 'branch-katipunan', 'branch-qc')
      AND NOT EXISTS (
        SELECT 1 FROM public.clinic_branches AS branch
        WHERE branch.facility_id = hospital AND branch.branch_id::text = requested.branch_key
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_message_hospital_branches(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_message_hospital_branches(uuid, text, text) TO authenticated;

ALTER TABLE public.branch_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.branch_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT (facility_id, sender_branch, recipient_branch, content) ON public.branch_messages TO authenticated;

DROP POLICY IF EXISTS branch_messages_staff_select ON public.branch_messages;
CREATE POLICY branch_messages_staff_select ON public.branch_messages FOR SELECT TO authenticated
  USING (public.can_message_hospital_branches(facility_id, sender_branch, recipient_branch));

DROP POLICY IF EXISTS branch_messages_staff_insert ON public.branch_messages;
CREATE POLICY branch_messages_staff_insert ON public.branch_messages FOR INSERT TO authenticated
  WITH CHECK (public.can_message_hospital_branches(facility_id, sender_branch, recipient_branch));

COMMIT;

NOTIFY pgrst, 'reload schema';
