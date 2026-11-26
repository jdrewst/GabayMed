-- Optional: run AFTER login-attempts.sql in SQL Editor.
-- Exercises the real counter functions, then rolls back all test rows.
BEGIN;
DO $$
DECLARE
  account text := repeat('0', 64);
  lease uuid;
  result jsonb;
  attempt integer;
BEGIN
  DELETE FROM mobile_login_private.attempts WHERE account_key = account;
  FOR attempt IN 1..3 LOOP
    lease := gen_random_uuid();
    result := public.mobile_begin_login(account, lease);
    IF result->>'allowed' <> 'true' THEN RAISE EXCEPTION 'Unexpected initial lock'; END IF;
    result := public.mobile_begin_login(account, gen_random_uuid());
    IF result->>'reason' <> 'busy' THEN RAISE EXCEPTION 'Parallel attempt was allowed'; END IF;
    result := public.mobile_finish_login(account, lease, 'failure');
  END LOOP;
  result := public.mobile_begin_login(account, gen_random_uuid());
  IF result->>'reason' <> 'locked' THEN RAISE EXCEPTION 'Third failure did not lock'; END IF;
  UPDATE mobile_login_private.attempts SET locked_until = now() - interval '1 second'
    WHERE account_key = account;
  lease := gen_random_uuid();
  result := public.mobile_begin_login(account, lease);
  IF result->>'allowed' <> 'true' THEN RAISE EXCEPTION 'Expired lock did not clear'; END IF;
  PERFORM public.mobile_finish_login(account, lease, 'failure');
  lease := gen_random_uuid();
  PERFORM public.mobile_begin_login(account, lease);
  PERFORM public.mobile_finish_login(account, lease, 'success');
  IF (SELECT failures FROM mobile_login_private.attempts WHERE account_key = account) <> 0
    THEN RAISE EXCEPTION 'Successful login did not clear failures'; END IF;
END;
$$;
ROLLBACK;
