-- Login endpoint storage only. No changes to existing tables or policies.
-- Run before deploying /api/login. Functions are callable only by service_role.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mobile_login_private;
REVOKE ALL ON SCHEMA mobile_login_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA mobile_login_private TO service_role;

CREATE TABLE IF NOT EXISTS mobile_login_private.attempts (
  account_key text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  window_started timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mobile_login_private.attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mobile_login_private.attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_login_private.attempts TO service_role;

CREATE OR REPLACE FUNCTION public.mobile_begin_login(p_key text, p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  entry mobile_login_private.attempts;
  moment timestamptz := clock_timestamp();
BEGIN
  IF p_key IS NULL OR length(p_key) <> 64 OR p_lease IS NULL THEN
    RAISE EXCEPTION 'Invalid login request.';
  END IF;
  INSERT INTO mobile_login_private.attempts(account_key) VALUES (p_key)
  ON CONFLICT DO NOTHING;
  SELECT * INTO entry FROM mobile_login_private.attempts
    WHERE account_key = p_key FOR UPDATE;
  IF entry.locked_until > moment THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'locked',
      'retry_after', ceil(extract(epoch FROM entry.locked_until - moment)));
  END IF;
  IF entry.lease_until > moment THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'busy', 'retry_after', 2);
  END IF;
  IF entry.locked_until IS NOT NULL OR entry.window_started <= moment - interval '30 minutes' THEN
    entry.failures := 0;
    entry.window_started := moment;
  END IF;
  UPDATE mobile_login_private.attempts SET
    failures = entry.failures, window_started = entry.window_started,
    locked_until = NULL, lease_id = p_lease,
    lease_until = moment + interval '45 seconds', updated_at = moment
  WHERE account_key = p_key;
  RETURN jsonb_build_object('allowed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.mobile_finish_login(p_key text, p_lease uuid, p_outcome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  entry mobile_login_private.attempts;
  moment timestamptz := clock_timestamp();
BEGIN
  IF p_outcome NOT IN ('success', 'failure', 'unavailable') OR p_outcome IS NULL THEN
    RAISE EXCEPTION 'Invalid login outcome.';
  END IF;
  SELECT * INTO entry FROM mobile_login_private.attempts
    WHERE account_key = p_key FOR UPDATE;
  IF NOT FOUND OR entry.lease_id IS DISTINCT FROM p_lease OR entry.lease_until <= moment THEN
    RETURN jsonb_build_object('accepted', false);
  END IF;
  IF p_outcome = 'success' THEN
    entry.failures := 0;
    entry.window_started := moment;
  ELSIF p_outcome = 'failure' THEN
    entry.failures := entry.failures + 1;
  END IF;
  IF entry.failures >= 3 THEN entry.locked_until := moment + interval '30 minutes'; END IF;
  UPDATE mobile_login_private.attempts SET
    failures = entry.failures, window_started = entry.window_started,
    locked_until = entry.locked_until, lease_id = NULL, lease_until = NULL,
    updated_at = moment
  WHERE account_key = p_key;
  RETURN jsonb_build_object('accepted', true, 'locked', entry.locked_until > moment,
    'retry_after', CASE WHEN entry.locked_until > moment THEN 1800 ELSE 0 END);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_begin_login(text, uuid),
  public.mobile_finish_login(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_begin_login(text, uuid),
  public.mobile_finish_login(text, uuid, text) TO service_role;
COMMIT;
