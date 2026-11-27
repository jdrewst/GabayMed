import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MessageCircle, Bell } from 'lucide-react-native';
import ProfileAPI from '../services/profileApi';
import NotificationsAPI, { notificationCategories } from '../services/notificationsApi';
import MessagesAPI from '../services/messagesApi';
import { PatientAvatar } from './patient-avatar';
import { useTheme } from '../context/ThemeContext';

function buildHeaderUserData(profile) {
  if (!profile) {
    return {
      firstName: '',
      lastName: '',
      initials: '',
      avatar: '',
      gender: '',
    };
  }
  const first = profile.firstName || (profile.name || 'Guest').split(' ')[0] || 'Guest';
  const last = profile.lastName || '';
  const initials = `${first.charAt(0) || ''}${last.charAt(0) || ''}`.toUpperCase() || 'G';
  return {
    firstName: first,
    lastName: last,
    initials,
    avatar: profile.avatar || '',
    gender: profile.gender || '',
  };
}

function computeGreeting(t) {
  const hour = new Date().getHours();
  if (hour < 12) return t?.greetingMorning || 'Good morning';
  if (hour < 18) return t?.greetingAfternoon || 'Good afternoon';
  return t?.greetingEvening || 'Good evening';
}

export function AppHeader({ onOpenMessages, onOpenNotifications, onOpenProfile }) {
  const { display, isDark, t, fs } = useTheme();
  const [userData, setUserData] = useState(() =>
    buildHeaderUserData(ProfileAPI.getCachedProfile())
  );
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const greeting = computeGreeting(t);

  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      try {
        const count = await MessagesAPI.getUnreadCount();
        if (active && current === request) setUnreadMessages(count);
      } catch {
        // Keep the last count while reconnecting.
      }
    };
    const stop = MessagesAPI.subscribeToMessages(refresh, { includeReadUpdates: true });
    return () => { active = false; stop(); };
  }, []);

  useEffect(() => {
    fetchUserData();
    const unsub = ProfileAPI.subscribe(profile => {
      if (profile) setUserData(buildHeaderUserData(profile));
    });
    return unsub;
  }, []);

  const fetchUserData = async () => {
    try {
      const profile = await ProfileAPI.getProfile();
      if (profile) {
        setUserData(buildHeaderUserData(profile));
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    let active = true;
    let request = 0;
    let permissions = ProfileAPI.getCachedPermissions();
    const refresh = async () => {
      const current = ++request;
      try {
        const count = await NotificationsAPI.unreadCount(notificationCategories(permissions));
        if (active && current === request) setUnreadNotifications(count);
      } catch {
        // Keep the last count and retry on the next refresh.
      }
    };
    const unsubscribe = ProfileAPI.subscribePermissions(next => {
      permissions = next;
      refresh();
    });
    refresh();
    const stop = NotificationsAPI.watch(refresh);
    return () => {
      active = false;
      unsubscribe();
      stop();
    };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: display.cardBg, borderBottomColor: display.border }]}>
      <TouchableOpacity
        style={styles.leftSection}
        onPress={onOpenProfile}
        activeOpacity={onOpenProfile ? 0.75 : 1}
        disabled={!onOpenProfile}
      >
        <View style={styles.avatarContainer}>
          <PatientAvatar avatar={userData.avatar} gender={userData.gender} size={42} />
        </View>
        <View style={styles.greetingContainer}>
          <Text style={[styles.greeting, { fontSize: fs(18) }]} numberOfLines={1} ellipsizeMode="tail">
            <Text style={[styles.helloText, { color: display.textSecondary, fontSize: fs(18) }]}>{greeting}, </Text>
            <Text style={[styles.nameText, { color: display.textPrimary, fontSize: fs(18) }]}>{userData.firstName || t?.guest || 'Guest'}</Text>
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.rightSection}>
        <TouchableOpacity
          onPress={onOpenMessages}
          style={[styles.iconButton, { backgroundColor: display.subCardBg }]}
          accessibilityRole="button"
          accessibilityLabel={`${t?.messages || 'Messages'}, ${unreadMessages} unread`}
        >
          <MessageCircle
            size={24}
            color={isDark ? '#cbd5e1' : '#4b5563'}
            fill={isDark ? '#475569' : '#3A4D51'}
          />
          {unreadMessages > 0 && (
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { fontSize: fs(11) }]}>{unreadMessages > 9 ? '9+' : unreadMessages}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenNotifications}
          style={[styles.iconButton, { backgroundColor: display.subCardBg }]}
          accessibilityRole="button"
          accessibilityLabel={unreadNotifications ? `${t?.notifications || 'Notifications'}, ${unreadNotifications} unread` : (t?.notifications || 'Notifications')}
        >
          <Bell
            size={24}
            color={isDark ? '#cbd5e1' : '#4b5563'}
            fill={isDark ? '#475569' : '#3A4D51'}
          />
          {unreadNotifications > 0 && (
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { fontSize: fs(11) }]}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 12,
  },
  greetingContainer: {
    flex: 1,
    minWidth: 0,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    borderWidth: 2,
    borderColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarText: {
    color: '#0ea5e9',
    fontSize: 16,
    fontWeight: '600',
  },
  greeting: {
    fontSize: 18,
    fontWeight: '600',
  },
  helloText: {
    color: '#3A4D51',
  },
  nameText: {
    color: '#3A4D51',
    fontWeight: '800',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
