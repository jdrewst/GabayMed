import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MessageCircle, Bell } from 'lucide-react-native';
import ProfileAPI from '../services/profileApi';
import Session from '../services/session';
import { supabase } from '../lib/supabase';
import { PatientAvatar } from './patient-avatar';

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

function computeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function AppHeader({ onOpenMessages, onOpenNotifications, onOpenProfile }) {
  const [userData, setUserData] = useState(() =>
    buildHeaderUserData(ProfileAPI.getCachedProfile())
  );
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [greeting, setGreeting] = useState(computeGreeting);

  useEffect(() => {
    fetchUserData();
    fetchUnreadCounts();
    setGreeting(computeGreeting());
    const unsubProfile = ProfileAPI.subscribe(profile => {
      if (profile) setUserData(buildHeaderUserData(profile));
    });
    const unsubPerms = ProfileAPI.subscribePermissions(() => {
      fetchUnreadCounts();
    });

    const userId = Session.getUserId();
    let channel = null;
    if (userId) {
      channel = supabase
        .channel(`header-notifs-${userId}-${Math.random().toString(36).slice(2, 7)}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${userId}`,
        }, () => {
          fetchUnreadCounts();
        })
        .subscribe();
    }

    return () => {
      unsubProfile();
      unsubPerms();
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
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

  const fetchUnreadCounts = async () => {
    try {
      const perms = await ProfileAPI.getPermissions().catch(() => null);
      if (perms && perms.notificationsAllowed === false) {
        setUnreadNotifications(0);
        return;
      }
      const userId = Session.getUserId();
      if (!userId) {
        setUnreadNotifications(0);
        return;
      }

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', userId)
        .eq('recipient_type', 'patient')
        .eq('is_read', false);

      if (!error && typeof count === 'number') {
        setUnreadNotifications(count);
        return;
      }

      // Fallback if `notifications` table hasn't been created yet
      const fallback = await Session.getUnreadCounts();
      setUnreadMessages(fallback?.messages || 0);
      setUnreadNotifications(fallback?.notifications || 0);
    } catch (error) {
      console.error('Error fetching unread counts:', error);
    }
  };

  const updateGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting('Good morning');
    } else if (hour < 18) {
      setGreeting('Good afternoon');
    } else {
      setGreeting('Good evening');
    }
  };

  return (
    <View style={styles.container}>
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
          <Text style={styles.greeting} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.helloText}>{greeting}, </Text>
            <Text style={styles.nameText}>{userData.firstName}</Text>
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.rightSection}>
        <TouchableOpacity onPress={onOpenMessages} style={styles.iconButton}>
          <MessageCircle size={24} color="#4b5563" fill={"#3A4D51"} />
          {unreadMessages > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadMessages > 9 ? '9+' : unreadMessages}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpenNotifications} style={styles.iconButton}>
          <Bell size={24} color="#4b5563" fill={"#3A4D51"} />
          {unreadNotifications > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
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
