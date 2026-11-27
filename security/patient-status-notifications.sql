BEGIN;

CREATE TABLE IF NOT EXISTS public.patient_status_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('appointment', 'claim')),
  title text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS patient_status_notifications_profile_idx
  ON public.patient_status_notifications (profile_id, created_at DESC, id);

ALTER TABLE public.patient_status_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_status_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (is_read) ON public.patient_status_notifications TO authenticated;

DROP POLICY IF EXISTS patient_status_notifications_read ON public.patient_status_notifications;
CREATE POLICY patient_status_notifications_read ON public.patient_status_notifications
  FOR SELECT TO authenticated USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS patient_status_notifications_mark_read ON public.patient_status_notifications;
CREATE POLICY patient_status_notifications_mark_read ON public.patient_status_notifications
  FOR UPDATE TO authenticated USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()) AND is_read);

CREATE OR REPLACE FUNCTION public.notify_patient_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  previous_status text := upper(btrim(OLD.status::text));
  next_status text := upper(btrim(NEW.status::text));
  recipient uuid;
  facility_name text;
  branch_key text;
  branch_name text;
  appointment_type text;
  appointment_when text;
BEGIN
  IF next_status IS NULL OR next_status = '' OR next_status IS NOT DISTINCT FROM previous_status THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'appointments' AND next_status NOT IN ('CONFIRMED', 'CANCELLED', 'CANCELED') THEN
    RETURN NEW;
  END IF;

  SELECT patient.profile_id, coalesce(facility.name, 'your clinic')
    INTO recipient, facility_name
  FROM public.patients AS patient
  JOIN public.users AS staff ON staff.facility_id = patient.facility_id
  LEFT JOIN public.facilities AS facility ON facility.facility_id = patient.facility_id
  WHERE patient.patient_id = NEW.patient_id AND staff.id = auth.uid()
    AND staff.role IN ('IT Admin', 'Hospital Staff');

  IF recipient IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'appointments' THEN
    branch_key := coalesce(to_jsonb(NEW) ->> 'branch_key', 'main');
    SELECT location.name INTO branch_name
    FROM public.clinic_branches AS location
    WHERE location.facility_id = NEW.facility_id AND location.branch_id::text = branch_key;

    branch_name := coalesce(branch_name, CASE branch_key
      WHEN 'main' THEN 'Main'
      WHEN 'branch-qc' THEN 'QC Branch'
      WHEN 'branch-katipunan' THEN 'Katipunan Branch'
      ELSE 'Clinic branch'
    END);

    -- Mobile bookings record the selected service even when the procedure is a generic fallback.
    appointment_type := nullif(btrim(substring(NEW.notes from '(?i)^\s*Service:\s*([^.]+)\.')), '');
    IF appointment_type IS NULL THEN
      SELECT nullif(btrim(procedure.description), '') INTO appointment_type
      FROM public.procedures AS procedure WHERE procedure.procedure_id = NEW.procedure_id;
    END IF;

    IF NEW.appointment_date IS NOT NULL THEN
      appointment_when := ' on ' || to_char(NEW.appointment_date, 'FMMonth FMDD, YYYY');
      IF NEW.appointment_time IS NOT NULL THEN
        appointment_when := appointment_when || ' at ' || to_char(NEW.appointment_date + NEW.appointment_time::time, 'FMHH12:MI AM');
      END IF;
    END IF;

    INSERT INTO public.patient_status_notifications (profile_id, category, title, message)
    VALUES (recipient, 'appointment',
      CASE WHEN next_status = 'CONFIRMED' THEN 'Appointment confirmed' ELSE 'Appointment cancelled' END,
      format('Your %s appointment at %s (%s)%s was %s.',
        coalesce(appointment_type, 'general consultation'), facility_name, branch_name, coalesce(appointment_when, ''),
        CASE WHEN next_status = 'CONFIRMED' THEN 'confirmed' ELSE 'cancelled' END));
  ELSE
    INSERT INTO public.patient_status_notifications (profile_id, category, title, message)
    VALUES (recipient, 'claim', 'Digital claim status updated',
      format('%s updated your digital claim status to %s.', facility_name, initcap(replace(next_status, '_', ' '))));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_patient_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_patient_appointment_status ON public.appointments;
CREATE TRIGGER notify_patient_appointment_status AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_patient_status_change();

DROP TRIGGER IF EXISTS notify_patient_claim_status ON public.claims;
CREATE TRIGGER notify_patient_claim_status AFTER UPDATE OF status ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.notify_patient_status_change();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public' AND tablename = 'patient_status_notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_status_notifications;
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
