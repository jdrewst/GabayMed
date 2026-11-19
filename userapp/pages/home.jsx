import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Calendar, Clock, Plus, ChevronRight, FolderLock } from 'lucide-react-native';
import GeoAltFill from 'react-native-bootstrap-icons/icons/geo-alt-fill';
import { AppHeader } from '../components/app-header';
import { MapViewSection } from '../components/map-view-section';
import { BrowseServices } from '../components/browse-services';
import HomeAPI from '../services/homeApi';
import HealthRecordsAPI, { formatDate } from '../services/healthRecordsApi';

export function HomePage({
  isActive = true,
  onOpenMessages,
  onOpenNotifications,
  onOpenProfile,
  onOpenAppointmentBooking,
  onNavigateToCases,
  onOpenMyAppointments,
  onOpenRecordVault,
  vaultRefreshTrigger,
  refreshTrigger,
}) {
  const [upcomingAppointment, setUpcomingAppointment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vaultSummary, setVaultSummary] = useState(null);

  useEffect(() => {
    fetchAppointmentData();
  }, [refreshTrigger]);

  useEffect(() => {
    let active = true;
    HealthRecordsAPI.list()
      .then(data => {
        if (!active) return;
        const records = Array.isArray(data.records) ? data.records : [];
        setVaultSummary({ total: records.length, latest: records[0] || null });
      })
      .catch(() => active && setVaultSummary(null));
    return () => { active = false; };
  }, [vaultRefreshTrigger]);

  const fetchAppointmentData = async () => {
    try {
      setLoading(true);
      const data = await HomeAPI.getHomeData();
      setUpcomingAppointment(data.upcomingAppointment);
    } catch (error) {
      console.error('Error fetching home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleServiceSelect = (service) => {
    if (onOpenAppointmentBooking) {
      onOpenAppointmentBooking(service?.label || null);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* App Header */}
      <AppHeader
        onOpenMessages={onOpenMessages}
        onOpenNotifications={onOpenNotifications}
        onOpenProfile={onOpenProfile}
      />

      {/* Upcoming Appointment Section */}
      <View style={[styles.section, styles.firstSection]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <View style={styles.redDot} />
            <Text style={styles.sectionTitle} numberOfLines={1}>
              Upcoming Appointment
            </Text>
          </View>
          <TouchableOpacity onPress={() => onOpenAppointmentBooking && onOpenAppointmentBooking(null)} style={styles.scheduleButton}>
            <Plus size={16} color="#0ea5e9" />
            <Text style={styles.scheduleButtonText}>Schedule</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={[styles.card, styles.loadingCard]}>
            <ActivityIndicator size="large" color="#60a5fa" />
          </View>
        ) : upcomingAppointment ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <GeoAltFill color="#60a5fa" size={32} top={12} />
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{upcomingAppointment.hospital}</Text>
                <Text style={styles.cardSubtitle}>{upcomingAppointment.type}</Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <View style={styles.badge}>
                <Calendar size={18} color="#60a5fa" />
                <Text style={styles.badgeText}>{upcomingAppointment.date}</Text>
              </View>
              <View style={styles.badgeSeparator} />
              <View style={styles.badge}>
                <Clock size={18} color="#60a5fa" />
                <Text style={styles.badgeText}>{upcomingAppointment.time}</Text>
              </View>
            </View>
            {onOpenMyAppointments && (
              <TouchableOpacity onPress={onOpenMyAppointments} style={styles.manageCardButton}>
                <Calendar size={15} color="#0284c7" />
                <Text style={styles.manageCardButtonText}>View / Cancel Appointment</Text>
                <ChevronRight size={16} color="#0284c7" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[styles.card, styles.emptyCard]}>
            <Text style={styles.emptyText}>No upcoming appointments</Text>
            <View style={styles.emptyActionsRow}>
              <TouchableOpacity onPress={() => onOpenAppointmentBooking && onOpenAppointmentBooking(null)} style={styles.emptyButton}>
                <Text style={styles.emptyButtonText}>Schedule an appointment</Text>
              </TouchableOpacity>
              {onOpenMyAppointments && (
                <TouchableOpacity onPress={onOpenMyAppointments} style={styles.secondaryOutlineButton}>
                  <Text style={styles.secondaryOutlineButtonText}>My Appointments</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Health Record Vault shortcut (US-3.7) */}
      {onOpenRecordVault && (
        <View style={styles.section}>
          <TouchableOpacity style={[styles.card, styles.vaultCard]} onPress={onOpenRecordVault} activeOpacity={0.85}>
            <View style={styles.vaultIcon}>
              <FolderLock size={24} color="#0284c7" />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Health Record Vault</Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {vaultSummary?.total
                  ? `${vaultSummary.total} ${vaultSummary.total === 1 ? 'file' : 'files'} · Latest: ${vaultSummary.latest?.title || ''}`
                  : 'Keep lab results, prescriptions and scans in one place'}
              </Text>
              {!!vaultSummary?.latest && (
                <Text style={styles.vaultMeta}>Updated {formatDate(vaultSummary.latest.createdAt)}</Text>
              )}
            </View>
            <ChevronRight size={20} color="#0ea5e9" />
          </TouchableOpacity>
        </View>
      )}

      {/* Seek Medical Care Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Seek Medical Care</Text>
        <MapViewSection isActive={isActive} />
      </View>

      {/* Browse by Services */}
      <View style={[styles.section, styles.lastSection]}>
        <BrowseServices
          showTitle={true}
          initialShowAll={false}
          onServiceSelect={handleServiceSelect}
          onSeeAll={onNavigateToCases}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  section: {
    padding: 12,
  },
  firstSection: {
    paddingTop: 24,
  },
  lastSection: {
    paddingBottom: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  redDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ef4444',
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: '600',
    color: '#1f2937',
    flexShrink: 1,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0ea5e9',
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  scheduleButtonText: {
    color: '#0ea5e9',
    fontWeight: '600',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: -4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  badgeSeparator: {
    width: 1,
    height: 16,
    backgroundColor: '#93c5fd',
    marginHorizontal: 12,
  },
  badgeText: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '500',
  },
  manageCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  manageCardButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0284c7',
  },
  loadingCard: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 120,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  emptyButton: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryOutlineButton: {
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  vaultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  vaultIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultMeta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  secondaryOutlineButtonText: {
    color: '#0284c7',
    fontWeight: '600',
    fontSize: 14,
  },
});
