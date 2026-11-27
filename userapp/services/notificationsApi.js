import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import Session from './session';

let subscriptionId = 0;

export function notificationCategories(permissions) {
  if (permissions?.notificationsAllowed === false) return [];
  return [
    permissions?.notifyAppointments !== false && 'appointment',
    permissions?.notifyInsurance !== false && 'claim',
  ].filter(Boolean);
}

const NotificationsAPI = {
  async list(categories) {
    const profileId = Session.getUserId();
    if (!profileId || !categories.length) return [];
    const { data, error } = await supabase.from('patient_status_notifications')
      .select('id, category, title, message, created_at, is_read')
      .eq('profile_id', profileId).in('category', categories)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  },

  async unreadCount(categories) {
    const profileId = Session.getUserId();
    if (!profileId || !categories.length) return 0;
    const { count, error } = await supabase.from('patient_status_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId).eq('is_read', false).in('category', categories);
    if (error) throw error;
    return count ?? 0;
  },

  async markRead(categories, id) {
    const profileId = Session.getUserId();
    if (!profileId || !categories.length) return;
    let query = supabase.from('patient_status_notifications').update({ is_read: true })
      .eq('profile_id', profileId).eq('is_read', false).in('category', categories);
    if (id) query = query.eq('id', id);
    const { error } = await query;
    if (error) throw error;
  },

  watch(refresh) {
    const profileId = Session.getUserId();
    if (!profileId) return () => {};
    const channel = supabase.channel(`patient-status-notifications:${++subscriptionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'patient_status_notifications', filter: `profile_id=eq.${profileId}`,
      }, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const timer = setInterval(() => { if (AppState.currentState !== 'background') refresh(); }, 15000);
    return () => {
      clearInterval(timer);
      foreground.remove();
      void supabase.removeChannel(channel);
    };
  },
};

export default NotificationsAPI;
