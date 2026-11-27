BEGIN;

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS branch_key text;

CREATE TABLE IF NOT EXISTS public.clinic_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(facility_id),
  branch_key text NOT NULL,
  category text NOT NULL CHECK (category IN ('appointment', 'fees', 'claim', 'billing')),
  title text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_read boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false
);

ALTER TABLE public.clinic_notifications ADD COLUMN IF NOT EXISTS appointment_date date;

-- Older appointment alerts already include their appointment ID in the message.
UPDATE public.clinic_notifications AS alert
SET appointment_date = appointment.appointment_date
FROM public.appointments AS appointment
WHERE alert.category = 'appointment' AND alert.appointment_date IS NULL
  AND alert.facility_id = appointment.facility_id
  AND alert.message LIKE 'Appointment %'
  AND split_part(alert.message, ' ', 2) = appointment.appointment_id::text;

CREATE INDEX IF NOT EXISTS clinic_notifications_inbox_idx
  ON public.clinic_notifications (facility_id, branch_key, created_at DESC, id)
  WHERE NOT is_dismissed;

CREATE OR REPLACE FUNCTION public.can_access_clinic_notifications(hospital uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users AS staff
    WHERE staff.id = (SELECT auth.uid()) AND staff.facility_id = hospital
      AND staff.role IN ('IT Admin', 'Hospital Staff')
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_clinic_notifications(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_clinic_notifications(uuid) TO authenticated;

ALTER TABLE public.clinic_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinic_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (is_read, is_dismissed) ON public.clinic_notifications TO authenticated;

DROP POLICY IF EXISTS clinic_notifications_select ON public.clinic_notifications;
CREATE POLICY clinic_notifications_select ON public.clinic_notifications FOR SELECT TO authenticated
  USING (public.can_access_clinic_notifications(facility_id));

DROP POLICY IF EXISTS clinic_notifications_update ON public.clinic_notifications;
CREATE POLICY clinic_notifications_update ON public.clinic_notifications FOR UPDATE TO authenticated
  USING (public.can_access_clinic_notifications(facility_id) AND NOT is_dismissed)
  WITH CHECK (public.can_access_clinic_notifications(facility_id) AND is_read);

CREATE OR REPLACE FUNCTION public.record_clinic_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  event_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  hospital uuid;
  branch text;
  category text;
  title text;
  details text;
  status_label text;
  calendar_date date;
  facility_name text;
  branch_name text;
  patient_name text;
  appointment_type text;
  appointment_when text;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;

  CASE TG_TABLE_NAME
    WHEN 'appointments' THEN
      hospital := NEW.facility_id;
      branch := coalesce(NEW.branch_key, 'main');
      IF (TG_OP = 'INSERT' OR NEW.branch_key IS DISTINCT FROM OLD.branch_key OR NEW.facility_id IS DISTINCT FROM OLD.facility_id)
        AND branch NOT IN ('main', 'branch-qc', 'branch-katipunan') AND NOT EXISTS (
        SELECT 1 FROM public.clinic_branches AS location
        WHERE location.branch_id::text = branch AND location.facility_id = hospital
      ) THEN
        RAISE EXCEPTION 'Appointment branch must belong to its hospital' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
      category := 'appointment';
      calendar_date := NEW.appointment_date;
      status_label := initcap(replace(NEW.status::text, '_', ' '));
      title := CASE WHEN TG_OP = 'INSERT' AND upper(NEW.status::text) = 'PENDING' THEN 'New appointment request'
                    WHEN TG_OP = 'INSERT' THEN 'Appointment created' ELSE 'Appointment status updated' END;
      SELECT facility.name, location.name, nullif(btrim(patient.full_name), '')
        INTO facility_name, branch_name, patient_name
      FROM public.facilities AS facility
      LEFT JOIN public.clinic_branches AS location
        ON location.facility_id = hospital AND location.branch_id::text = branch
      LEFT JOIN public.patients AS patient
        ON patient.facility_id = hospital AND patient.patient_id = NEW.patient_id
      WHERE facility.facility_id = hospital;

      branch_name := coalesce(branch_name, CASE branch
        WHEN 'main' THEN 'Main'
        WHEN 'branch-qc' THEN 'QC Branch'
        WHEN 'branch-katipunan' THEN 'Katipunan Branch'
        ELSE 'Clinic branch'
      END);

      -- Preserve the service selected during mobile booking if its procedure is a fallback.
      appointment_type := nullif(btrim(substring(NEW.notes from '(?i)^\s*Service:\s*([^.]+)\.')), '');
      IF appointment_type IS NULL THEN
        SELECT nullif(btrim(procedure.description), '') INTO appointment_type
        FROM public.procedures AS procedure WHERE procedure.procedure_id = NEW.procedure_id;
      END IF;

      IF calendar_date IS NOT NULL THEN
        appointment_when := to_char(calendar_date, 'FMMonth FMDD, YYYY');
        IF NEW.appointment_time IS NOT NULL THEN
          appointment_when := appointment_when || ' at ' || to_char(calendar_date + NEW.appointment_time::time, 'FMHH12:MI AM');
        END IF;
      END IF;

      details := concat_ws(chr(10),
        concat_ws(' | ', coalesce(appointment_type, 'General consultation'), patient_name),
        format('%s (%s)', coalesce(facility_name, 'Hospital'), branch_name),
        concat_ws(' | ', appointment_when, coalesce(status_label, 'Status unavailable')));
    WHEN 'fee_schedules' THEN
      hospital := (event_row ->> 'facility_id')::uuid;
      category := 'fees';
      title := CASE TG_OP WHEN 'INSERT' THEN 'Fee schedule created' WHEN 'DELETE' THEN 'Fee schedule removed' ELSE 'Fee schedule updated' END;
      details := coalesce(event_row ->> 'schedule_name', 'A fee schedule');
    WHEN 'fee_schedule_items' THEN
      SELECT schedule.facility_id, schedule.schedule_name INTO hospital, details
      FROM public.fee_schedules AS schedule
      WHERE schedule.schedule_id = coalesce(NEW.schedule_id, OLD.schedule_id);
      category := 'fees';
      title := 'Procedure fee updated';
      details := format('%s · procedure %s', details, event_row ->> 'procedure_id');
    WHEN 'claims' THEN
      IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
      SELECT patient.facility_id, coalesce(appointment.branch_key, 'main') INTO hospital, branch
      FROM public.patients AS patient
      LEFT JOIN public.ledger AS entry ON entry.ledger_id = NEW.ledger_id AND entry.patient_id = patient.patient_id
      LEFT JOIN public.appointments AS appointment ON appointment.appointment_id = entry.appointment_id AND appointment.facility_id = patient.facility_id
      WHERE patient.patient_id = NEW.patient_id;
      category := 'claim';
      title := CASE WHEN TG_OP = 'INSERT' THEN 'Digital claim submitted' ELSE 'Digital claim status updated' END;
      details := format('Claim %s (%s).', NEW.claim_id, coalesce(initcap(replace(NEW.status::text, '_', ' ')), 'status unavailable'));
    WHEN 'ledger' THEN
      SELECT patient.facility_id, coalesce(appointment.branch_key, 'main') INTO hospital, branch
      FROM public.patients AS patient
      LEFT JOIN public.appointments AS appointment ON appointment.appointment_id = NEW.appointment_id AND appointment.facility_id = patient.facility_id
      WHERE patient.patient_id = NEW.patient_id;
      category := 'billing';
      title := CASE WHEN upper(NEW.type::text) = 'PAYMENT' THEN 'Payment recorded' ELSE 'Ledger entry created' END;
      details := format('Ledger entry %s.', NEW.ledger_id);
  END CASE;

  IF hospital IS NULL THEN RETURN NULL; END IF;
  IF branch IS NOT NULL THEN
    INSERT INTO public.clinic_notifications (facility_id, branch_key, category, title, message, appointment_date)
    VALUES (hospital, branch, category, title, details, calendar_date);
  ELSE
    -- Fee schedules apply to the hospital. Give each inbox its own read state.
    INSERT INTO public.clinic_notifications (facility_id, branch_key, category, title, message)
    SELECT hospital, inbox.branch_key, category, title, details
    FROM (
      SELECT 'main' AS branch_key
      UNION SELECT location.branch_id::text FROM public.clinic_branches AS location
        WHERE location.facility_id = hospital AND location.is_active IS DISTINCT FROM false
      UNION SELECT defaults.branch_key FROM (VALUES ('branch-qc', 'QC'), ('branch-katipunan', 'KAT')) AS defaults(branch_key, abbreviation)
        WHERE NOT EXISTS (SELECT 1 FROM public.clinic_branches AS location
          WHERE location.facility_id = hospital AND upper(location.abbreviation) = defaults.abbreviation)
    ) AS inbox;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_clinic_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clinic_notification_appointment ON public.appointments;
CREATE TRIGGER clinic_notification_appointment AFTER INSERT OR UPDATE OF status, branch_key, facility_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.record_clinic_notification();

DROP TRIGGER IF EXISTS clinic_notification_fee_schedule ON public.fee_schedules;
CREATE TRIGGER clinic_notification_fee_schedule AFTER INSERT OR UPDATE OR DELETE ON public.fee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.record_clinic_notification();

DROP TRIGGER IF EXISTS clinic_notification_fee_item ON public.fee_schedule_items;
CREATE TRIGGER clinic_notification_fee_item AFTER INSERT OR UPDATE OR DELETE ON public.fee_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.record_clinic_notification();

DROP TRIGGER IF EXISTS clinic_notification_claim ON public.claims;
CREATE TRIGGER clinic_notification_claim AFTER INSERT OR UPDATE OF status ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.record_clinic_notification();

DROP TRIGGER IF EXISTS clinic_notification_ledger ON public.ledger;
CREATE TRIGGER clinic_notification_ledger AFTER INSERT ON public.ledger
  FOR EACH ROW EXECUTE FUNCTION public.record_clinic_notification();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'clinic_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clinic_notifications;
  END IF;
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
