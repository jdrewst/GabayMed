import { createClient } from '@supabase/supabase-js';
import { Session } from './session';

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) return import.meta.env[key];
  if (typeof process !== 'undefined' && process.env) return process.env[key];
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL');
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');
const supabase = createClient(supabaseUrl, supabaseKey);

const LOCAL_READ_KEY = 'gabay_read_notifs_v1';
const LOCAL_DISMISSED_KEY = 'gabay_dismissed_notifs_v1';

function readLocalSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function writeLocalSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set].slice(-200)));
  } catch {}
}

export function formatRelativeTime(isoOrMs) {
  const ts = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  if (!Number.isFinite(ts)) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} ${mins === 1 ? 'min' : 'mins'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const [hStr, mStr] = String(timeStr).split(':');
  const h = Number(hStr);
  const m = Number(mStr || 0);
  if (!Number.isFinite(h)) return timeStr;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function notifyBroadcast() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gabayNotificationsUpdated'));
  }
}

function parseAppointmentTargetFromText(text) {
  const result = {};
  if (!text) return result;
  // Match ISO date (YYYY-MM-DD)
  const isoMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
  if (isoMatch) {
    result.date = isoMatch[1];
  } else {
    // Match "Nov 26, 2026" or "December 1, 2025"
    const namedMatch = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(\d{4})\b/i.exec(text);
    if (namedMatch) {
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const mIdx = months.indexOf(namedMatch[1].slice(0, 3).toLowerCase());
      if (mIdx >= 0) {
        result.date = `${namedMatch[3]}-${String(mIdx + 1).padStart(2, '0')}-${String(Number(namedMatch[2])).padStart(2, '0')}`;
      }
    }
  }
  // Match 12-hour time like "2:00 PM" or "09:30 AM"
  const timeMatch = /\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i.exec(text);
  if (timeMatch) {
    let h = Number(timeMatch[1]);
    const meridiem = timeMatch[3].toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    result.hour = h;
  }
  // Match "Appointment #123"
  const idMatch = /#(\d+)\b/.exec(text);
  if (idMatch) result.appointmentId = idMatch[1];
  return result;
}

export function getNotificationRoute(notification) {
  if (!notification) return '/notifications';
  const type = String(notification.type || '').toLowerCase();
  const text = `${notification.title || ''} ${notification.message || ''}`;
  const lower = text.toLowerCase();

  if (type === 'appointment' || type === 'reminder' || lower.includes('appointment')) {
    const parsed = parseAppointmentTargetFromText(text);
    const meta = notification.meta || {};
    const date = meta.date || parsed.date || '';
    const appointmentId = meta.appointmentId || parsed.appointmentId || '';
    const providerId = meta.providerId || '';
    let hour = meta.hour ?? parsed.hour;
    if (hour == null && meta.time) {
      const h = Number(String(meta.time).split(':')[0]);
      if (Number.isFinite(h)) hour = h;
    }
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (appointmentId) params.set('appointmentId', String(appointmentId));
    if (providerId) params.set('providerId', String(providerId));
    if (hour != null && Number.isFinite(Number(hour))) params.set('hour', String(hour));
    const qs = params.toString();
    return qs ? `/appointments?${qs}` : '/appointments';
  }
  if (type === 'admin') {
    if (lower.includes('procedure')) return '/settings?tab=procedures';
    if (lower.includes('branch') || lower.includes('location')) return '/settings?tab=location';
    if (lower.includes('room') || lower.includes('operatory')) return '/settings?tab=rooms';
    if (lower.includes('fee')) return '/settings?tab=fees';
    return '/settings?tab=users';
  }
  if (type === 'alert' || type === 'claim' || lower.includes('insurance') || lower.includes('claim')) {
    return '/carriers';
  }
  if (type === 'patient' || type === 'payment') {
    return '/patients';
  }
  return '/notifications';
}

export function navigateToNotification(notification) {
  const target = getNotificationRoute(notification);
  if (typeof window !== 'undefined') {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export const notificationsAPI = {
  /**
   * Inserts a live notification into `public.notifications` (best-effort, non-blocking).
   */
  async emit({ facilityId, userId = null, profileId = null, recipientType = 'clinic', type = 'admin', title, message }) {
    const facId = facilityId || Session.getFacilityId();
    if (!title || !message) return false;
    try {
      const { error } = await supabase.from('notifications').insert({
        facility_id: facId || null,
        user_id: userId || null,
        profile_id: profileId || null,
        recipient_type: recipientType,
        type,
        title,
        message,
        is_read: false,
      });
      if (!error) notifyBroadcast();
      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Loads live clinic notifications for the logged-in IT Admin or Hospital Staff:
   * 1) Persisted notifications from `public.notifications` (patient->provider, admin->provider, claims, etc.)
   * 2) Live upcoming appointment reminders for today / tomorrow from `public.appointments`
   * 3) Fallback live activity feed from recent appointments & patients if `public.notifications` isn't migrated yet
   */
  async getClinicNotifications() {
    const facilityId = Session.getFacilityId();
    if (!facilityId) return [];

    let currentUserId = null;
    try {
      const { data } = await supabase.auth.getUser();
      currentUserId = data?.user?.id || null;
    } catch {}

    const readLocal = readLocalSet(LOCAL_READ_KEY);
    const dismissedLocal = readLocalSet(LOCAL_DISMISSED_KEY);
    const items = [];

    // 1. Fetch persisted rows from `public.notifications`
    let hasNotifTable = false;
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('facility_id', facilityId)
        .eq('recipient_type', 'clinic')
        .order('created_at', { ascending: false })
        .limit(50);

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        hasNotifTable = true;
        for (const row of data) {
          if (row.user_id && currentUserId && row.user_id !== currentUserId) continue;
          items.push({
            id: row.notification_id,
            source: 'db',
            type: row.type || 'appointment',
            title: row.title,
            message: row.message,
            createdAt: row.created_at,
            time: formatRelativeTime(row.created_at),
            read: !!row.is_read,
          });
        }
      }
    } catch {}

    // 2. Live upcoming appointment reminders (today & tomorrow)
    try {
      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowIso = tomorrow.toISOString().slice(0, 10);

      const { data: upcoming } = await supabase
        .from('appointments')
        .select('appointment_id, appointment_date, appointment_time, status, reason_for_visit, patient_id, provider_id')
        .eq('facility_id', facilityId)
        .in('appointment_date', [todayIso, tomorrowIso])
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true })
        .limit(15);

      if (Array.isArray(upcoming) && upcoming.length > 0) {
        const patientIds = [...new Set(upcoming.map(a => a.patient_id).filter(Boolean))];
        const patientMap = {};
        if (patientIds.length > 0) {
          const { data: pts } = await supabase
            .from('patients')
            .select('patient_id, full_name, first_name, last_name')
            .in('patient_id', patientIds);
          for (const pt of pts || []) {
            patientMap[pt.patient_id] = pt.full_name || [pt.first_name, pt.last_name].filter(Boolean).join(' ') || 'A patient';
          }
        }

        for (const apt of upcoming) {
          const status = String(apt.status || '').toUpperCase();
          if (status === 'CANCELLED' || status === 'COMPLETED') continue;
          const remId = `reminder-${apt.appointment_id}-${apt.appointment_date}`;
          if (dismissedLocal.has(remId)) continue;

          const pName = patientMap[apt.patient_id] || 'A patient';
          const isToday = apt.appointment_date === todayIso;
          const timeLabel = formatTime12h(apt.appointment_time);

          let timingText = isToday
            ? `today${timeLabel ? ` at ${timeLabel}` : ''}`
            : `tomorrow${timeLabel ? ` at ${timeLabel}` : ''}`;

          if (isToday && apt.appointment_time) {
            const [hh, mm] = String(apt.appointment_time).split(':').map(Number);
            if (Number.isFinite(hh)) {
              const aptDt = new Date(now);
              aptDt.setHours(hh, mm || 0, 0, 0);
              const diffMins = Math.round((aptDt.getTime() - now.getTime()) / 60000);
              if (diffMins > 0 && diffMins <= 60) {
                timingText = `in ${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} (${timeLabel})`;
              }
            }
          }

          items.push({
            id: remId,
            source: 'computed',
            type: 'reminder',
            title: isToday ? 'Appointment Reminder (Today)' : 'Upcoming Appointment Tomorrow',
            message: `${pName} has an appointment scheduled ${timingText}${apt.reason_for_visit ? ` — ${apt.reason_for_visit}` : ''}.`,
            createdAt: now.toISOString(),
            time: isToday ? 'Upcoming today' : 'Tomorrow',
            read: readLocal.has(remId),
            meta: {
              appointmentId: apt.appointment_id,
              date: apt.appointment_date,
              time: apt.appointment_time,
              providerId: apt.provider_id,
            },
          });
        }
      }
    } catch {}

    // 3. If `public.notifications` table is not migrated yet, synthesize live feed from recent appointments & patients
    if (!hasNotifTable) {
      try {
        const { data: recentApts } = await supabase
          .from('appointments')
          .select('appointment_id, appointment_date, appointment_time, status, patient_id, provider_id')
          .eq('facility_id', facilityId)
          .order('appointment_id', { ascending: false })
          .limit(10);

        for (const apt of recentApts || []) {
          const synthId = `apt-live-${apt.appointment_id}`;
          if (dismissedLocal.has(synthId)) continue;
          items.push({
            id: synthId,
            source: 'computed',
            type: 'appointment',
            title: `Appointment ${apt.status || 'Scheduled'}`,
            message: `Appointment #${apt.appointment_id} scheduled for ${apt.appointment_date || 'upcoming date'}${apt.appointment_time ? ` at ${formatTime12h(apt.appointment_time)}` : ''}.`,
            createdAt: new Date().toISOString(),
            time: apt.appointment_date || 'Recent',
            read: readLocal.has(synthId),
            meta: {
              appointmentId: apt.appointment_id,
              date: apt.appointment_date,
              time: apt.appointment_time,
              providerId: apt.provider_id,
            },
          });
        }
      } catch {}
    }

    // Sort newest/unread reminders first
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async markAsRead(notification) {
    if (!notification?.id) return;
    if (notification.source === 'db') {
      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('notification_id', notification.id);
      } catch {}
    } else {
      const set = readLocalSet(LOCAL_READ_KEY);
      set.add(notification.id);
      writeLocalSet(LOCAL_READ_KEY, set);
    }
    notifyBroadcast();
  },

  async markAllAsRead(notifications = []) {
    const facilityId = Session.getFacilityId();
    const dbIds = notifications.filter(n => n.source === 'db' && !n.read).map(n => n.id);
    if (dbIds.length > 0 && facilityId) {
      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .in('notification_id', dbIds);
      } catch {}
    }
    const set = readLocalSet(LOCAL_READ_KEY);
    notifications.filter(n => n.source !== 'db').forEach(n => set.add(n.id));
    writeLocalSet(LOCAL_READ_KEY, set);
    notifyBroadcast();
  },

  async deleteNotification(notification) {
    if (!notification?.id) return;
    if (notification.source === 'db') {
      try {
        await supabase
          .from('notifications')
          .delete()
          .eq('notification_id', notification.id);
      } catch {}
    } else {
      const set = readLocalSet(LOCAL_DISMISSED_KEY);
      set.add(notification.id);
      writeLocalSet(LOCAL_DISMISSED_KEY, set);
    }
    notifyBroadcast();
  },

  /**
   * Subscribes to live Supabase Realtime changes on `notifications`, `appointments`, and `patients`
   * for the active facility, plus in-tab custom events so Header & Notifications page stay synced.
   */
  subscribeClinicNotifications(onChange) {
    const facilityId = Session.getFacilityId();
    const handleLocal = () => { if (onChange) onChange(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('gabayNotificationsUpdated', handleLocal);
    }

    let channel = null;
    if (facilityId) {
      channel = supabase
        .channel(`clinic-notifs-${facilityId}-${Math.random().toString(36).slice(2, 8)}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'notifications', filter: `facility_id=eq.${facilityId}`
        }, handleLocal)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'appointments', filter: `facility_id=eq.${facilityId}`
        }, handleLocal)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'patients', filter: `facility_id=eq.${facilityId}`
        }, handleLocal)
        .subscribe();
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('gabayNotificationsUpdated', handleLocal);
      }
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  },
};
