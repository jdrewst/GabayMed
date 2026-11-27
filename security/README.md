# Login security follow-up

## Clinic messaging setup

Run `security/messaging.sql` in the Supabase SQL Editor for the project used by the staff website and patient app. It creates message storage and limits access to the linked patient and staff assigned to the patient's facility. After applying it, test a staff-to-patient message and a patient-to-staff reply using accounts linked to the same clinic.

Re-run the script on projects with an existing messages table to enable branch-specific threads. Existing messages stay in Main. Test using the same patient in Main and a branch, then confirm each reply appears in its original thread. The branch selector determines the staff thread. Staff authorization remains scoped to the assigned hospital.

Implemented: verified in-memory clinic context (no hardcoded clinic fallback), immediate screen lock on sign-out, 30-minute browser inactivity logout shared between tabs, account recheck when returning to the tab, and basic response security headers on Vercel.

The inactivity control is a browser convenience, not server-enforced session expiry. Existing access tokens may remain valid until expiry. RLS must protect every request.

## Required Supabase work

1. Run `security/audit.sql` in SQL Editor. It only reads metadata. Share its results so policies can be updated against the actual schema without breaking patient-app access. Never share keys or password hashes.
2. In Authentication settings, configure a strong password policy (at least 12 characters), leaked-password protection if available, and appropriate Auth rate limits. Verify changes using a test account.
3. Configure production Site URL and an exact allowlist of redirect URLs. Remove unused redirects.
4. Review existing public policies before using real patient records. A login screen does not protect tables that allow anonymous reads. Verify signed-out, other-clinic, staff, and admin requests independently.
5. Enable MFA for Supabase dashboard administrators. Website-user MFA is separate and still needs enrollment, recovery and challenge UI plus server/database AAL2 enforcement; it is not enabled by this change.
6. Newly provisioned providers now receive server-controlled app_metadata.must_change_password=true. The website requires a 12?128 character password (upper/lowercase, number, symbol). /api/first-password verifies the bearer identity and updates password plus flag together; users then sign in again. Existing accounts are not marked retroactively. This is a website gate: direct database access still depends on existing RLS. No SQL changes are included for this flow. Deploy both API and frontend, and restart the local backend.
7. Website failed-login protection is implemented in /api/login. Run security/login-attempts.sql before deploying the new login flow, then restart the backend. Three invalid-password attempts within 30 minutes for the same email across devices trigger a 30-minute endpoint cooldown; valid clinic login resets the counter. SQL row locks and a 45-second request lease serialize attempts across instances. Auth outages do not count as invalid passwords. The popup displays the retry countdown. No credentials are logged; storage contains an HMAC account key, counters and timestamps. HMAC uses the existing server key: rotating it resets which buckets are used.
8. This custom protection covers /api/login ONLY. Direct Supabase Auth requests bypass this counter and remain subject to Supabase rate limits. Existing sessions are not revoked. Do not describe it as a global Auth account ban. The Auth client on the server uses its own request-scoped instance, separate from the privileged database client. The account is identified by its trimmed, lowercased email. All browsers and devices share its counter; clearing cookies does not reset it. Another account has a separate counter. This does not revoke existing sessions, or ban direct Supabase sign-ins. Someone who knows an email can deliberately trigger its cooldown. Keep Supabase rate limits and consider CAPTCHA if this becomes an issue.
9. Login now requires the backend to be running locally (npm.cmd --prefix server run dev). Deploy the root api/login.js wrapper on Vercel with the existing server environment variables. No new secret is required. Missing storage fails closed. The patient application is not migrated to this endpoint.
10. For routine retention, a database administrator may delete rows in mobile_login_private.attempts whose updated_at is over 30 days old, locked_until is null or expired, and lease_until is null or expired. Do not expose this private schema through the Data API.
11. Use Supabase server-enforced session limits if supported by the project's plan. Verify idle expiry and logout across tabs. Do not treat browser timeout as token revocation.

## Manual checks

- Log in as each clinic role; navigate to each page, then refresh.
- Change `gabay_facility_id` in browser storage: it must not change the verified clinic context.
- Log out in another tab: protected screens must close.
- Leave all tabs idle for 30 minutes; resume a hidden tab and confirm login is required.
- Confirm staff cannot provision providers by calling the endpoint directly.
- After RLS changes, test both clinic and patient applications before production rollout.

## Patient authenticator MFA

Apply [patient-mfa.sql](patient-mfa.sql) on staging Supabase and enable TOTP enrollment and verification in Supabase Auth. Deploy the API and mobile app together.

Patients can set up and remove an authenticator under **Settings → Password, app PIN and MFA**. An enrolled patient enters a six-digit authenticator code after entering their password. The patient API and row-level policies require an MFA-verified session for protected data. The database policies also block anonymous access to the covered patient tables while retaining existing authenticated access grants.

Removing an authenticator from a session that still needs MFA prompts for a code before removing the factor. If the patient lost their only copy, a project admin can verify their identity, look up their enrolled factor, and use Supabase Auth's [admin factor removal](https://supabase.com/docs/reference/javascript/auth-admin-deletefactor). Removing a verified factor signs out active sessions. The patient can then sign in and enroll a replacement.

The same screen supports signed-in password changes and an optional six-digit, device-local app PIN. Password changes require the current password. The PIN is requested when GabayMed restores a saved session after an app restart. A fresh sign-in uses the account password and any enrolled MFA factor. To reset a forgotten PIN, the patient verifies their account with the same sign-in checks and sets a replacement PIN.

Verify enrollment, removal, and sign-in with a test patient. Check that a password-only token for an enrolled account cannot read or write protected data through the GabayMed API or Supabase Data API. Test an unenrolled account and an already verified session as well.
## Health Record Vault (US-3.7)

Run `security/health-records.sql` once in the SQL Editor, then restart the backend. It creates `public.health_records` (patients can only SELECT their own rows; all writes go through `/api/patient-health-records`) and a private `health-records` Storage bucket limited to PDF/JPG/PNG/HEIC/WEBP files up to 10 MB. Files are only reachable through 5-minute signed URLs. Records with `can_delete = false` (clinic-issued) cannot be deleted from the app. Deleting a patient account also removes their vault files.

## Cross-app Health Record sharing (US-4.0)

Run `security/health-record-sharing.sql` once after `health-records.sql`, then restart the backend. Clinic staff see a patient's vault files in the website's Patient Profile → Health Records tab, served only by `/api/provider-health-records`. Every list and every file open re-checks, on the server:

1. the caller is signed-in `IT Admin` / `Hospital Staff` assigned to a facility (and has changed any temporary password);
2. the patient (`patients.facility_id`) belongs to that same facility, otherwise "not found";
3. the patient's account-level **Hospital Data Sharing** (`profiles.data_sharing_consent`) is explicitly `true` (unset counts as restricted);
4. the file's **Share with my care providers** flag (`health_records.share_with_providers`) is `true`, filtered in the query itself.

Staff never receive `storage_path`; files open through 2-minute signed URLs, and each view/download is written to `health_record_access_log` (service role only). Turning sharing off in the app hides files on the next request without changing or deleting them. `health_records` still has no staff RLS policy, so direct Supabase reads from the website remain blocked.
