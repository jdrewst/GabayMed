import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { ArrowLeft, Calendar, CreditCard, Gift, Bell, MessageCircle, ShieldCheck } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ProfileAPI, { getDisplayConfig } from '../services/profileApi';
import AppointmentAPI from '../services/appointmentApi';

const CATEGORY_MAP = [
  { key: 'notifyAppointments', type: 'reminder', label: 'Appointments', icon: Calendar },
  { key: 'notifyBilling', type: 'payment', label: 'Billing', icon: CreditCard },
  { key: 'notifyInsurance', type: 'news', label: 'Insurance', icon: ShieldCheck },
  { key: 'notifyMessages', type: 'message', label: 'Messages', icon: MessageCircle },
  { key: 'notifyPromos', type: 'promo', label: 'Promos', icon: Gift },
];

export function NotificationsPage({ onBack }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [perms, setPerms] = useState(() => ProfileAPI.getCachedPermissions() || {
    notificationsAllowed: true,
    notifyAppointments: true,
    notifyBilling: true,
    notifyInsurance: true,
    notifyMessages: true,
    notifyPromos: true,
    language: 'en',
    themeMode: 'light',
    textSize: 'medium',
    highContrast: false,
  });

  useEffect(() => {
    ProfileAPI.getPermissions()
      .then(loaded => {
        if (loaded) setPerms(loaded);
      })
      .catch(() => {});
    fetchNotifications();
    const unsub = ProfileAPI.subscribePermissions(next => {
      if (next) setPerms(next);
    });
    return unsub;
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      let realAppointmentNotifs = [];
      try {
        const schedule = await AppointmentAPI.getPatientSchedule();
        realAppointmentNotifs = (schedule || []).slice(0, 3).map((apt, idx) => ({
          id: `apt-notif-${apt.id || idx}`,
          type: 'reminder',
          icon: Calendar,
          title:
            (apt.status || '').toUpperCase() === 'CANCELLED'
              ? 'Appointment Cancelled'
              : 'Appointment Scheduled',
          message: `${apt.procedureName || 'Consultation'} with ${apt.providerName} at ${apt.facilityName} on ${apt.formattedDate} at ${apt.formattedTime}.`,
          timestamp: apt.createdAt ? new Date(apt.createdAt).getTime() : Date.now() - (idx + 1) * 1800000,
          unread: idx === 0,
        }));
      } catch {}

      const baseNotifications = [
        ...realAppointmentNotifs,
        {
          id: '1',
          type: 'reminder',
          icon: Calendar,
          title: 'Appointment Reminder',
          message: 'Your appointment at Philippine General Hospital is tomorrow at 10:30 AM.',
          timestamp: Date.now() - 2 * 60 * 60 * 1000,
          unread: true,
        },
        {
          id: '2',
          type: 'payment',
          icon: CreditCard,
          title: 'Payment Due',
          message: 'You have an outstanding balance of ₱2,500 for Laboratory Tests.',
          timestamp: Date.now() - 18 * 60 * 60 * 1000,
          unread: true,
        },
        {
          id: '5',
          type: 'message',
          icon: MessageCircle,
          title: 'Message from Clinic Staff',
          message: 'Please bring a valid ID and your latest lab results 15 minutes before your consultation.',
          timestamp: Date.now() - 26 * 60 * 60 * 1000,
          unread: true,
        },
        {
          id: '3',
          type: 'promo',
          icon: Gift,
          title: 'Special Offer',
          message: 'Get 20% off on your next general check-up at UERM Medical Center!',
          timestamp: Date.now() - 48 * 60 * 60 * 1000,
          unread: true,
        },
        {
          id: '4',
          type: 'news',
          icon: ShieldCheck,
          title: 'Insurance Update',
          message: 'Your PhilHealth & HMO insurance coverage has been verified and renewed.',
          timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
          unread: false,
        },
      ];

      setNotifications(baseNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const isCategoryEnabled = type => {
    if (perms?.notificationsAllowed === false) return false;
    if (type === 'reminder') return perms?.notifyAppointments !== false;
    if (type === 'payment') return perms?.notifyBilling !== false;
    if (type === 'news') return perms?.notifyInsurance !== false;
    if (type === 'message') return perms?.notifyMessages !== false;
    if (type === 'promo') return perms?.notifyPromos !== false;
    return true;
  };

  const visibleNotifications = notifications.filter(n => isCategoryEnabled(n.type));
  const unreadCount = visibleNotifications.filter(n => n.unread).length;
  const notificationsAllowed = perms?.notificationsAllowed !== false;
  const display = getDisplayConfig(perms);
  const fs = size => Math.round(size * display.fontScale * 10) / 10;

  const toggleCategoryChip = async key => {
    const current = perms?.[key] !== false;
    await ProfileAPI.setPermissions({
      notificationsAllowed: true,
      [key]: !current,
    });
  };

  const markAsRead = async notificationId => {
    setNotifications(prev =>
      prev.map(notif => (notif.id === notificationId ? { ...notif, unread: false } : notif))
    );
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, unread: false })));
  };

  const getRelativeTime = timestamp => {
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    return `${Math.floor(days / 7)} ${Math.floor(days / 7) === 1 ? 'week' : 'weeks'} ago`;
  };

  const getIconStyle = type => {
    switch (type) {
      case 'reminder':
        return { bg: '#dbeafe', color: '#3b82f6' };
      case 'payment':
        return { bg: '#fee2e2', color: '#ef4444' };
      case 'promo':
        return { bg: '#dcfce7', color: '#22c55e' };
      case 'message':
        return { bg: '#e0f2fe', color: '#0284c7' };
      default:
        return { bg: '#f3f4f6', color: '#6b7280' };
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: display.bg }]}>
      {/* Header */}
      <LinearGradient colors={['#66BAFF', '#83BFF0']} style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.headerTitle, { fontSize: fs(18) }]}>Notifications</Text>
          {notificationsAllowed && unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {notificationsAllowed && unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
            <Text style={styles.markAllText}>Mark all</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {/* Active Notification Category Filter / Preferences Bar */}
      {notificationsAllowed && (
        <View
          style={[
            styles.categoryBar,
            { backgroundColor: display.cardBg, borderBottomColor: display.border },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {CATEGORY_MAP.map(cat => {
              const enabled = perms?.[cat.key] !== false;
              const CatIcon = cat.icon;
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => toggleCategoryChip(cat.key)}
                  style={[
                    styles.categoryChip,
                    { backgroundColor: display.subCardBg, borderColor: display.border },
                    enabled && styles.categoryChipActive,
                  ]}
                >
                  <CatIcon size={13} color={enabled ? '#0284c7' : '#94a3b8'} />
                  <Text
                    style={[
                      styles.categoryChipText,
                      { fontSize: fs(12) },
                      enabled ? styles.categoryChipTextActive : styles.categoryChipTextMuted,
                    ]}
                  >
                    {cat.label} {enabled ? 'On' : 'Off'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Notifications List */}
      {!notificationsAllowed ? (
        <View style={styles.emptyContainer}>
          <Bell size={48} color="#94a3b8" />
          <Text style={[styles.emptyText, { color: display.textPrimary, fontSize: fs(18) }]}>
            Notifications are turned off
          </Text>
          <Text
            style={[
              styles.emptySubtext,
              { textAlign: 'center', color: display.textSecondary, fontSize: fs(14) },
            ]}
          >
            Enable notifications in Settings or tap below to receive appointment, billing, and coverage updates.
          </Text>
          <TouchableOpacity
            style={styles.turnOnBtn}
            onPress={() => ProfileAPI.setPermissions({ notificationsAllowed: true })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: fs(14) }}>
              Turn On Notifications
            </Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0ea5e9" />
        </View>
      ) : visibleNotifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Bell size={48} color="#d1d5db" />
          <Text style={[styles.emptyText, { color: display.textPrimary, fontSize: fs(18) }]}>
            No matching notifications
          </Text>
          <Text
            style={[
              styles.emptySubtext,
              { textAlign: 'center', color: display.textSecondary, fontSize: fs(14) },
            ]}
          >
            You have muted the active notification categories, or you're all caught up!
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0ea5e9']} />
          }
        >
          {visibleNotifications.map((notif, idx) => {
            const iconStyle = getIconStyle(notif.type);
            const IconComponent = notif.icon;

            return (
              <TouchableOpacity
                key={`${notif.id}-${idx}`}
                style={[
                  styles.notificationItem,
                  {
                    backgroundColor: notif.unread
                      ? display.isDark
                        ? '#1e293b'
                        : '#f0f9ff'
                      : display.cardBg,
                    borderBottomColor: display.border,
                  },
                ]}
                onPress={() => notif.unread && markAsRead(notif.id)}
              >
                <View style={[styles.iconContainer, { backgroundColor: iconStyle.bg }]}>
                  <IconComponent size={20} color={iconStyle.color} />
                </View>
                <View style={styles.contentContainer}>
                  <View style={styles.titleRow}>
                    <Text
                      style={[
                        styles.notificationTitle,
                        { color: display.textPrimary, fontSize: fs(15) },
                      ]}
                    >
                      {notif.title}
                    </Text>
                    {notif.unread && <View style={styles.unreadDot} />}
                  </View>
                  <Text
                    style={[
                      styles.notificationMessage,
                      { color: display.textSecondary, fontSize: fs(14) },
                    ]}
                  >
                    {notif.message}
                  </Text>
                  <Text style={[styles.notificationTime, { fontSize: fs(12) }]}>
                    {getRelativeTime(notif.timestamp)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerBadge: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  categoryBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 10,
  },
  categoryScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  categoryChipActive: {
    borderColor: '#7dd3fc',
    backgroundColor: '#e0f2fe',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#0284c7',
  },
  categoryChipTextMuted: {
    color: '#94a3b8',
  },
  turnOnBtn: {
    marginTop: 18,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
  },
  listContainer: {
    flex: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fff',
  },
  notificationItemUnread: {
    backgroundColor: '#f0f9ff',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1f2937',
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0ea5e9',
    marginTop: 6,
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 4,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
  },
});
