-- Email OTP storage for patient registration and password reset.
-- Isolated inside mobile_login_private; callable ONLY by service_role.
-- Run in Supabase SQL Editor.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mobile_login_private;
REVOKE ALL ON SCHEMA mobile_login_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA mobile_login_private TO service_role;

CREATE TABLE IF NOT EXISTS mobile_login_private.otp_challenges (
  challenge_key text PRIMARY KEY,
  purpose text NOT NULL,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  send_count integer NOT NULL DEFAULT 1,
  send_window_started timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  locked_until timestamptz,
  verified_token_hash text,
  verified_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mobile_login_private.otp_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mobile_login_private.otp_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mobile_login_private.otp_challenges TO service_role;

-- Atomically checks resend cooldown / hourly send cap and stores a new hashed OTP.
CREATE OR REPLACE FUNCTION public.mobile_issue_otp(
  p_key text,
  p_purpose text,
  p_email text,
  p_code_hash text,
  p_ttl_seconds integer DEFAULT 300
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  entry mobile_login_private.otp_challenges;
  moment timestamptz := clock_timestamp();
  wait_seconds integer;
BEGIN
  IF p_key IS NULL OR length(p_key) <> 64 OR p_code_hash IS NULL OR length(p_code_hash) <> 64 THEN
    RAISE EXCEPTION 'Invalid OTP challenge request.';
  END IF;
  IF p_purpose NOT IN ('register', 'reset') THEN
    RAISE EXCEPTION 'Invalid OTP purpose.';
  END IF;

  SELECT * INTO entry FROM mobile_login_private.otp_challenges
    WHERE challenge_key = p_key FOR UPDATE;

  IF FOUND THEN
    IF entry.locked_until > moment THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'locked',
        'retry_after', ceil(extract(epoch FROM entry.locked_until - moment))
      );
    END IF;

    -- 60-second cooldown between sends for the same account + purpose
    IF entry.last_sent_at + interval '60 seconds' > moment THEN
      wait_seconds := ceil(extract(epoch FROM (entry.last_sent_at + interval '60 seconds') - moment));
      RETURN jsonb_build_object('allowed', false, 'reason', 'cooldown', 'retry_after', GREATEST(1, wait_seconds));
    END IF;

    -- Max 5 OTP emails per 30-minute window
    IF entry.send_window_started <= moment - interval '30 minutes' THEN
      entry.send_count := 0;
      entry.send_window_started := moment;
    END IF;

    IF entry.send_count >= 5 THEN
      wait_seconds := ceil(extract(epoch FROM (entry.send_window_started + interval '30 minutes') - moment));
      RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limit', 'retry_after', GREATEST(60, wait_seconds));
    END IF;

    UPDATE mobile_login_private.otp_challenges SET
      purpose = p_purpose,
      email = p_email,
      code_hash = p_code_hash,
      attempts = 0,
      send_count = entry.send_count + 1,
      send_window_started = entry.send_window_started,
      last_sent_at = moment,
      expires_at = moment + make_interval(secs => p_ttl_seconds),
      locked_until = NULL,
      verified_token_hash = NULL,
      verified_until = NULL,
      updated_at = moment
    WHERE challenge_key = p_key;
  ELSE
    INSERT INTO mobile_login_private.otp_challenges (
      challenge_key, purpose, email, code_hash, attempts, send_count,
      send_window_started, last_sent_at, expires_at, updated_at
    ) VALUES (
      p_key, p_purpose, p_email, p_code_hash, 0, 1,
      moment, moment, moment + make_interval(secs => p_ttl_seconds), moment
    );
  END IF;

  RETURN jsonb_build_object('allowed', true, 'expires_in', p_ttl_seconds, 'resend_after', 60);
END;
$$;

-- Atomically verifies the submitted code hash, enforces 5-attempt lockout, and issues a single-use verification token hash.
CREATE OR REPLACE FUNCTION public.mobile_verify_otp(
  p_key text,
  p_code_hash text,
  p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  entry mobile_login_private.otp_challenges;
  moment timestamptz := clock_timestamp();
BEGIN
  IF p_key IS NULL OR length(p_key) <> 64 OR p_code_hash IS NULL OR length(p_code_hash) <> 64
     OR p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'Invalid OTP verification request.';
  END IF;

  SELECT * INTO entry FROM mobile_login_private.otp_challenges
    WHERE challenge_key = p_key FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('verified', false, 'reason', 'expired');
  END IF;

  IF entry.locked_until > moment THEN
    RETURN jsonb_build_object(
      'verified', false,
      'reason', 'locked',
      'retry_after', ceil(extract(epoch FROM entry.locked_until - moment))
    );
  END IF;

  IF entry.expires_at <= moment OR entry.code_hash = '' THEN
    RETURN jsonb_build_object('verified', false, 'reason', 'expired');
  END IF;

  IF entry.code_hash <> p_code_hash THEN
    entry.attempts := entry.attempts + 1;
    IF entry.attempts >= 5 THEN
      entry.locked_until := moment + interval '15 minutes';
    END IF;
    UPDATE mobile_login_private.otp_challenges SET
      attempts = entry.attempts,
      locked_until = entry.locked_until,
      updated_at = moment
    WHERE challenge_key = p_key;

    IF entry.locked_until IS NOT NULL THEN
      RETURN jsonb_build_object('verified', false, 'reason', 'locked', 'retry_after', 900);
    END IF;
    RETURN jsonb_build_object(
      'verified', false,
      'reason', 'invalid',
      'remaining', GREATEST(0, 5 - entry.attempts)
    );
  END IF;

  -- Code matched: invalidate the OTP code immediately and store the single-use token hash for 10 minutes.
  UPDATE mobile_login_private.otp_challenges SET
    code_hash = '',
    attempts = 0,
    verified_token_hash = p_token_hash,
    verified_until = moment + interval '10 minutes',
    updated_at = moment
  WHERE challenge_key = p_key;

  RETURN jsonb_build_object('verified', true, 'email', entry.email);
END;
$$;

-- Atomically consumes the single-use verification token when completing registration or password reset.
CREATE OR REPLACE FUNCTION public.mobile_consume_otp(
  p_key text,
  p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  entry mobile_login_private.otp_challenges;
  moment timestamptz := clock_timestamp();
BEGIN
  IF p_key IS NULL OR length(p_key) <> 64 OR p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT * INTO entry FROM mobile_login_private.otp_challenges
    WHERE challenge_key = p_key FOR UPDATE;

  IF NOT FOUND OR entry.verified_token_hash IS NULL
     OR entry.verified_token_hash <> p_token_hash
     OR entry.verified_until <= moment THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  DELETE FROM mobile_login_private.otp_challenges WHERE challenge_key = p_key;
  RETURN jsonb_build_object('valid', true, 'email', entry.email);
END;
$$;

REVOKE ALL ON FUNCTION
  public.mobile_issue_otp(text, text, text, text, integer),
  public.mobile_verify_otp(text, text, text),
  public.mobile_consume_otp(text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.mobile_issue_otp(text, text, text, text, integer),
  public.mobile_verify_otp(text, text, text),
  public.mobile_consume_otp(text, text)
TO service_role;

COMMIT;
