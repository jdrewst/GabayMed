/**
 * Best-effort helper for inserting live notifications into `public.notifications`.
 * Never throws so core actions succeed even before `security/live-notifications.sql` is applied.
 */
async function createNotification(admin, {
  facilityId = null,
  userId = null,
  profileId = null,
  recipientType = 'clinic',
  type = 'admin',
  title,
  message
}) {
  if (!admin || !title || !message) return false;
  try {
    const { error } = await admin.from('notifications').insert({
      facility_id: facilityId || null,
      user_id: userId || null,
      profile_id: profileId || null,
      recipient_type: recipientType,
      type,
      title,
      message,
      is_read: false
    });
    return !error;
  } catch {
    return false;
  }
}

module.exports = { createNotification };
