-- Run once in Supabase SQL Editor after the fee schedule migration.
-- Saves the header and all prices in a single transaction under existing RLS.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_fee_schedule(
  p_schedule_id bigint,
  p_schedule_name text,
  p_insurance_id bigint,
  p_effective_from date,
  p_effective_to date,
  p_items jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  clinic_id uuid := public.fee_current_facility_id();
  saved_id bigint;
BEGIN
  IF auth.uid() IS NULL OR clinic_id IS NULL THEN
    RAISE EXCEPTION 'Sign in with an account assigned to a clinic.';
  END IF;
  IF p_schedule_name IS NULL OR btrim(p_schedule_name) = '' THEN
    RAISE EXCEPTION 'Schedule name is required.';
  END IF;
  IF p_effective_from IS NULL OR p_effective_to <= p_effective_from THEN
    RAISE EXCEPTION 'End date must be later than the required start date.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Procedure prices must be an array.';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Include at least one procedure.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items)
      AS i(procedure_id bigint, custom_price numeric)
    WHERE i.procedure_id IS NULL OR i.custom_price IS NULL
      OR i.custom_price < 0 OR i.custom_price > 9999999999.99
      OR i.custom_price::text IN ('NaN', 'Infinity', '-Infinity')
      OR i.custom_price <> round(i.custom_price, 2)
  ) THEN
    RAISE EXCEPTION 'Each procedure needs a non-negative price with at most two decimal places.';
  END IF;
  IF EXISTS (
    SELECT i.procedure_id FROM jsonb_to_recordset(p_items)
      AS i(procedure_id bigint, custom_price numeric)
    GROUP BY i.procedure_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A procedure may appear only once in a schedule.';
  END IF;

  IF p_schedule_id IS NULL THEN
    INSERT INTO public.fee_schedules (
      facility_id, schedule_name, insurance_id, effective_from, effective_to
    ) VALUES (
      clinic_id, btrim(p_schedule_name), p_insurance_id, p_effective_from, p_effective_to
    ) RETURNING schedule_id INTO saved_id;
  ELSE
    -- Lock the parent before replacing its items; concurrent saves serialize.
    PERFORM 1 FROM public.fee_schedules
      WHERE schedule_id = p_schedule_id AND facility_id = clinic_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Schedule not found or access denied.';
    END IF;
    UPDATE public.fee_schedules SET
      schedule_name = btrim(p_schedule_name), insurance_id = p_insurance_id,
      effective_from = p_effective_from, effective_to = p_effective_to
    WHERE schedule_id = p_schedule_id AND facility_id = clinic_id
    RETURNING schedule_id INTO saved_id;
    IF saved_id IS NULL THEN
      RAISE EXCEPTION 'Schedule update was denied.';
    END IF;
    DELETE FROM public.fee_schedule_items WHERE schedule_id = saved_id;
  END IF;

  INSERT INTO public.fee_schedule_items (schedule_id, procedure_id, custom_price)
  SELECT saved_id, i.procedure_id, i.custom_price
  FROM jsonb_to_recordset(p_items) AS i(procedure_id bigint, custom_price numeric);
  RETURN saved_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fee_schedule(bigint, text, bigint, date, date, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fee_schedule(bigint, text, bigint, date, date, jsonb)
TO authenticated;

COMMIT;
