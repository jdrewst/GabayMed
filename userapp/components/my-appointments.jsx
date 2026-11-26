import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  User,
  Stethoscope,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Building2,
  CalendarDays,
} from 'lucide-react-native';
import AppointmentAPI from '../services/appointmentApi';

const CANCELLATION_REASONS = [
  'Schedule conflict',
  'Feeling better / Symptoms resolved',
  'Need to reschedule for another date',
  'Transportation / Travel issue',
  'Family or personal emergency',
  'Other reason',
];

export function MyAppointmentsModal({ visible, onClose, onScheduleNew, onChanged }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'completed' | 'cancelled' | 'all'

  // Cancellation State
  const [cancellingAppointment, setCancellingAppointment] = useState(null);
  const [selectedReason, setSelectedReason] = useState(CANCELLATION_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  useEffect(() => {
    if (visible) {
      loadAppointments();
    }
  }, [visible]);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const data = await AppointmentAPI.getPatientSchedule();
      setAppointments(data);
    } catch (error) {
      console.error('Failed to load appointments:', error);
      Alert.alert('Error', 'Unable to load appointments.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await AppointmentAPI.getPatientSchedule();
      setAppointments(data);
    } catch {
    } finally {
      setRefreshing(false);
    }
  };

  // Filter appointments based on active tab
  const filteredAppointments = appointments.filter(apt => {
    const status = (apt.status || '').toUpperCase();
    if (activeTab === 'upcoming') {
      return status === 'PENDING' || status === 'CONFIRMED' || status === 'SCHEDULED' || status === 'ONGOING';
    }
    if (activeTab === 'completed') {
      return status === 'COMPLETED' || status === 'DONE';
    }
    if (activeTab === 'cancelled') {
      return status === 'CANCELLED';
    }
    return true; // 'all'
  });

  const handleOpenCancel = (apt) => {
    const policy = apt.cancellationPolicy || AppointmentAPI.evaluateCancellationPolicy(apt.appointmentDate, apt.status);

    if (!policy.cancellable) {
      const facName = apt.facilityName || 'the clinic';
      const phoneMsg = apt.facilityPhone ? ` at ${apt.facilityPhone}` : '';
      Alert.alert(
        'Cancellation Policy Notice',
        `${policy.reason}\n\nPlease contact ${facName}${phoneMsg} directly to adjust or cancel this appointment.`,
        [{ text: 'OK' }]
      );
      return;
    }

    setCancellingAppointment(apt);
    setSelectedReason(CANCELLATION_REASONS[0]);
    setCustomReason('');
  };

  const handleConfirmCancel = async () => {
    if (!cancellingAppointment) return;

    const finalReason = selectedReason === 'Other reason'
      ? (customReason.trim() || 'Other reason')
      : selectedReason;

    setIsSubmittingCancel(true);
    try {
      const result = await AppointmentAPI.cancelAppointment(
        cancellingAppointment.id || cancellingAppointment.appointmentId,
        finalReason
      );

      if (result.success) {
        Alert.alert('Appointment Cancelled', 'Your appointment has been cancelled successfully.');
        setCancellingAppointment(null);
        await loadAppointments();
        if (onChanged) {
          try { onChanged(); } catch {}
        }
      } else {
        Alert.alert('Unable to Cancel', result.error || 'Failed to cancel appointment. Please check facility policy.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    if (s === 'CONFIRMED' || s === 'SCHEDULED') {
      return {
        bg: '#e0f2fe',
        color: '#0369a1',
        label: 'CONFIRMED',
        icon: CheckCircle2,
      };
    }
    if (s === 'PENDING') {
      return {
        bg: '#fef3c7',
        color: '#92400e',
        label: 'PENDING',
        icon: Clock,
      };
    }
    if (s === 'COMPLETED' || s === 'DONE') {
      return {
        bg: '#dcfce7',
        color: '#15803d',
        label: 'COMPLETED',
        icon: CheckCircle2,
      };
    }
    if (s === 'CANCELLED') {
      return {
        bg: '#fee2e2',
        color: '#b91c1c',
        label: 'CANCELLED',
        icon: XCircle,
      };
    }
    return {
      bg: '#f3f4f6',
      color: '#4b5563',
      label: s,
      icon: Clock,
    };
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <CalendarDays size={22} color="#0ea5e9" />
              <Text style={styles.headerTitle}>My Appointments</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#4b5563" />
            </TouchableOpacity>
          </View>

          {/* Filter Tabs */}
          <View style={styles.tabsContainer}>
            {[
              { key: 'upcoming', label: 'Upcoming' },
              { key: 'completed', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' },
              { key: 'all', label: 'All' },
            ].map(tab => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.tabBtn, active && styles.tabBtnActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Body */}
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#0ea5e9" />
              <Text style={styles.loadingText}>Loading your appointments...</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.listContent}
              contentContainerStyle={styles.listInner}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0ea5e9']} />
              }
            >
              {filteredAppointments.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Calendar size={48} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>No appointments found</Text>
                  <Text style={styles.emptySubtitle}>
                    {activeTab === 'upcoming'
                      ? 'You have no upcoming consultations scheduled.'
                      : `You have no ${activeTab} appointments.`}
                  </Text>
                  {onScheduleNew && (
                    <TouchableOpacity
                      onPress={() => {
                        onClose();
                        onScheduleNew();
                      }}
                      style={styles.emptyScheduleBtn}
                    >
                      <Text style={styles.emptyScheduleBtnText}>Book an Appointment</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                filteredAppointments.map((apt, index) => {
                  const badge = getStatusBadge(apt.status);
                  const BadgeIcon = badge.icon;
                  const isUpcoming = (apt.status || '').toUpperCase() === 'PENDING' ||
                    (apt.status || '').toUpperCase() === 'CONFIRMED' ||
                    (apt.status || '').toUpperCase() === 'SCHEDULED';
                  const policy = apt.cancellationPolicy ||
                    AppointmentAPI.evaluateCancellationPolicy(apt.appointmentDate, apt.status);

                  return (
                    <View key={`apt-${apt.id || apt.appointmentId || index}-${index}`} style={styles.appointmentCard}>
                      {/* Top row: Status & Reference */}
                      <View style={styles.cardTopRow}>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <BadgeIcon size={12} color={badge.color} />
                          <Text style={[styles.statusBadgeText, { color: badge.color }]}>
                            {badge.label}
                          </Text>
                        </View>
                        <Text style={styles.refText}>
                          #{String(apt.id || apt.appointmentId).slice(0, 8).toUpperCase()}
                        </Text>
                      </View>

                      {/* Main info */}
                      <View style={styles.cardMain}>
                        <View style={styles.infoRow}>
                          <Stethoscope size={18} color="#0ea5e9" style={styles.infoIcon} />
                          <View style={styles.infoTextContainer}>
                            <Text style={styles.procedureName}>
                              {apt.procedureName || 'Medical Consultation'}
                            </Text>
                            <Text style={styles.providerName}>
                              {apt.providerName} ({apt.providerSpecialty || 'Physician'})
                            </Text>
                          </View>
                        </View>

                        <View style={styles.infoRow}>
                          <Building2 size={16} color="#64748b" style={styles.infoIcon} />
                          <Text style={styles.facilityName}>
                            {apt.facilityName}
                          </Text>
                        </View>

                        <View style={styles.dateTimeRow}>
                          <View style={styles.dateTimeChip}>
                            <Calendar size={14} color="#0284c7" />
                            <Text style={styles.dateTimeText}>
                              {apt.formattedDate || new Date(apt.appointmentDate).toLocaleDateString()}
                            </Text>
                          </View>
                          <View style={styles.dateTimeChip}>
                            <Clock size={14} color="#0284c7" />
                            <Text style={styles.dateTimeText}>
                              {apt.formattedTime || new Date(apt.appointmentDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Policy indicator for upcoming appointments */}
                      {isUpcoming && (
                        <View style={[
                          styles.policyBox,
                          policy.cancellable ? styles.policyBoxOk : styles.policyBoxLocked
                        ]}>
                          {policy.cancellable ? (
                            <Clock size={14} color="#0284c7" />
                          ) : (
                            <AlertCircle size={14} color="#d97706" />
                          )}
                          <Text style={[
                            styles.policyText,
                            policy.cancellable ? styles.policyTextOk : styles.policyTextLocked
                          ]}>
                            {policy.cancellable
                              ? `Cancellable until 24 hours prior (${policy.hoursRemaining}h left)`
                              : 'Within 24h of appointment - cancellation requires contacting clinic'}
                          </Text>
                        </View>
                      )}

                      {/* Action buttons */}
                      {isUpcoming && (
                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            onPress={() => handleOpenCancel(apt)}
                            style={[
                              styles.cancelBtn,
                              !policy.cancellable && styles.cancelBtnDisabled
                            ]}
                          >
                            <X size={15} color={policy.cancellable ? '#ef4444' : '#94a3b8'} />
                            <Text style={[
                              styles.cancelBtnText,
                              !policy.cancellable && styles.cancelBtnTextDisabled
                            ]}>
                              {policy.cancellable ? 'Cancel Appointment' : 'Cancel (Call Clinic)'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          {/* Cancellation Confirmation Dialog Modal */}
          <Modal
            visible={cancellingAppointment !== null}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setCancellingAppointment(null)}
          >
            <View style={styles.dialogOverlay}>
              <View style={styles.dialogCard}>
                <View style={styles.dialogHeader}>
                  <View style={styles.dialogWarningIcon}>
                    <AlertTriangle size={24} color="#ef4444" />
                  </View>
                  <Text style={styles.dialogTitle}>Cancel Appointment</Text>
                  <TouchableOpacity
                    onPress={() => setCancellingAppointment(null)}
                    style={styles.dialogCloseBtn}
                  >
                    <X size={18} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                {cancellingAppointment && (
                  <ScrollView style={styles.dialogBody}>
                    <Text style={styles.dialogSubtitle}>
                      Are you sure you want to cancel your consultation with{' '}
                      <Text style={{ fontWeight: 'bold', color: '#1f2937' }}>
                        {cancellingAppointment.providerName}
                      </Text>{' '}
                      at{' '}
                      <Text style={{ fontWeight: 'bold', color: '#1f2937' }}>
                        {cancellingAppointment.facilityName}
                      </Text>
                      ?
                    </Text>

                    <View style={styles.dialogAppointmentDetails}>
                      <Text style={styles.dialogDetailItem}>
                        📅 {cancellingAppointment.formattedDate} at {cancellingAppointment.formattedTime}
                      </Text>
                      <Text style={styles.dialogDetailItem}>
                        🩺 {cancellingAppointment.procedureName}
                      </Text>
                    </View>

                    {/* Facility Policy Reminder */}
                    <View style={styles.dialogPolicyNotice}>
                      <AlertCircle size={16} color="#0284c7" />
                      <Text style={styles.dialogPolicyNoticeText}>
                        Facility Policy: Free cancellation is granted up to 24 hours prior. Your cancellation will free this slot for other patients.
                      </Text>
                    </View>

                    <Text style={styles.reasonLabel}>Reason for Cancellation:</Text>
                    <View style={styles.reasonOptions}>
                      {CANCELLATION_REASONS.map((reason) => {
                        const isSelected = selectedReason === reason;
                        return (
                          <TouchableOpacity
                            key={reason}
                            onPress={() => setSelectedReason(reason)}
                            style={[
                              styles.reasonChip,
                              isSelected && styles.reasonChipSelected
                            ]}
                          >
                            <Text style={[
                              styles.reasonChipText,
                              isSelected && styles.reasonChipTextSelected
                            ]}>
                              {reason}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {selectedReason === 'Other reason' && (
                      <TextInput
                        style={styles.customReasonInput}
                        placeholder="Please specify reason (optional)..."
                        placeholderTextColor="#9ca3af"
                        value={customReason}
                        onChangeText={setCustomReason}
                        maxLength={200}
                      />
                    )}
                  </ScrollView>
                )}

                <View style={styles.dialogActions}>
                  <TouchableOpacity
                    onPress={() => setCancellingAppointment(null)}
                    style={styles.keepBtn}
                    disabled={isSubmittingCancel}
                  >
                    <Text style={styles.keepBtnText}>Keep Appointment</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleConfirmCancel}
                    style={styles.confirmCancelBtn}
                    disabled={isSubmittingCancel}
                  >
                    {isSubmittingCancel ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmCancelBtnText}>Yes, Cancel</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '92%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  tabBtnActive: {
    backgroundColor: '#0ea5e9',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#fff',
  },
  listContent: {
    flex: 1,
  },
  listInner: {
    padding: 16,
    gap: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#334155',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  emptyScheduleBtn: {
    marginTop: 20,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyScheduleBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  refText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  cardMain: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoTextContainer: {
    flex: 1,
  },
  procedureName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  providerName: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  facilityName: {
    fontSize: 13,
    color: '#64748b',
    flex: 1,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  dateTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dateTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369a1',
  },
  policyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  policyBoxOk: {
    backgroundColor: '#f0f9ff',
  },
  policyBoxLocked: {
    backgroundColor: '#fffbeb',
  },
  policyText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  policyTextOk: {
    color: '#0369a1',
  },
  policyTextLocked: {
    color: '#92400e',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff',
  },
  cancelBtnDisabled: {
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  cancelBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  cancelBtnTextDisabled: {
    color: '#94a3b8',
  },

  // ─── Cancellation Dialog Styles ───
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  dialogWarningIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  dialogCloseBtn: {
    padding: 6,
  },
  dialogBody: {
    padding: 16,
  },
  dialogSubtitle: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 12,
  },
  dialogAppointmentDetails: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    gap: 4,
  },
  dialogDetailItem: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  dialogPolicyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  dialogPolicyNoticeText: {
    fontSize: 12,
    color: '#1e40af',
    flex: 1,
    lineHeight: 18,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8,
  },
  reasonOptions: {
    gap: 6,
    marginBottom: 12,
  },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  reasonChipSelected: {
    borderColor: '#0ea5e9',
    backgroundColor: '#f0f9ff',
  },
  reasonChipText: {
    fontSize: 13,
    color: '#475569',
  },
  reasonChipTextSelected: {
    color: '#0284c7',
    fontWeight: '600',
  },
  customReasonInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: '#1f2937',
    marginBottom: 12,
  },
  dialogActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  keepBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
