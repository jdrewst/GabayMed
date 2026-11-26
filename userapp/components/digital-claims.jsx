import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import {
  X,
  FileCheck2,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  Stethoscope,
  Send,
  RotateCcw,
  FileText,
} from 'lucide-react-native';
import ClaimsAPI, { CLAIM_STATUS_LABELS, formatPeso } from '../services/claimsApi';

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'DENIED', label: 'Denied' },
];

function statusStyle(status) {
  switch ((status || '').toUpperCase()) {
    case 'APPROVED':
    case 'PAID':
      return { bg: '#dcfce7', color: '#15803d', icon: CheckCircle2 };
    case 'IN_REVIEW':
      return { bg: '#e0f2fe', color: '#0369a1', icon: Clock };
    case 'DENIED':
      return { bg: '#fee2e2', color: '#b91c1c', icon: XCircle };
    default:
      return { bg: '#fef3c7', color: '#92400e', icon: FileCheck2 };
  }
}

function StatusBadge({ status }) {
  const s = statusStyle(status);
  const Icon = s.icon;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Icon size={12} color={s.color} />
      <Text style={[styles.badgeText, { color: s.color }]}>
        {CLAIM_STATUS_LABELS[status] || status || 'Submitted'}
      </Text>
    </View>
  );
}

function DetailRow({ label, value, strong, color }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.detailStrong, color && { color }]}>
        {value || '—'}
      </Text>
    </View>
  );
}

function ClaimCard({ claim, expanded, onToggle }) {
  const coverageLabel = [claim.carrierName, claim.planName].filter(Boolean).join(' · ') || 'Linked Insurance Plan';
  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.8}>
        <View style={styles.cardTop}>
          <StatusBadge status={claim.status} />
          <Text style={styles.refText}>CLM-{String(claim.id).slice(0, 8).toUpperCase()}</Text>
        </View>

        <View style={styles.cardMain}>
          <Stethoscope size={18} color="#0ea5e9" style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{claim.procedureName}</Text>
            <View style={styles.iconLine}>
              <ShieldCheck size={13} color="#0284c7" />
              <Text style={styles.insuranceText} numberOfLines={1}>{coverageLabel}</Text>
            </View>
            <View style={styles.iconLine}>
              <Building2 size={13} color="#64748b" />
              <Text style={styles.cardSub} numberOfLines={1}>{claim.facilityName}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardAmounts}>
          <View>
            <Text style={styles.amountLabel}>Claimed Amount</Text>
            <Text style={styles.amountValue}>{formatPeso(claim.amount)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.amountLabel}>Submitted</Text>
            <Text style={styles.dateValue}>{claim.submissionDate || '—'}</Text>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleText}>{expanded ? 'Hide details' : 'View claim details'}</Text>
          {expanded ? <ChevronUp size={16} color="#0ea5e9" /> : <ChevronDown size={16} color="#0ea5e9" />}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.detailsBox}>
          <DetailRow label="Status" value={CLAIM_STATUS_LABELS[claim.status] || claim.rawStatus} strong />
          <DetailRow label="Service Date" value={claim.serviceDate} />
          <DetailRow label="Submission Date" value={claim.submissionDate} />
          {!!claim.providerName && <DetailRow label="Provider" value={claim.providerName} />}
          <DetailRow label="Insurance Carrier" value={claim.carrierName || 'Not specified'} />
          <DetailRow label="Plan" value={claim.planName || 'Not specified'} />
          <View style={styles.divider} />
          <DetailRow label="Claimed Amount" value={formatPeso(claim.amount)} strong />
          {claim.approvedAmount != null && (
            <DetailRow label="Approved Amount" value={formatPeso(claim.approvedAmount)} strong color="#15803d" />
          )}
          {!!claim.notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Notes / Remarks</Text>
              <Text style={styles.notesText}>{claim.notes}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function DigitalClaimsModal({ visible, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('track'); // 'track' | 'submit'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState(null);

  // Submission form state
  const [selectedLedgerId, setSelectedLedgerId] = useState(null);
  const [selectedInsuranceId, setSelectedInsuranceId] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const res = await ClaimsAPI.getMyClaims();
      setData(res);
    } catch (err) {
      setError(err.message || 'Unable to load your digital claims.');
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      load();
    } else {
      setSelectedLedgerId(null);
      setSelectedInsuranceId(null);
      setNotes('');
    }
  }, [visible, load]);

  const summary = data?.summary;
  const allClaims = data?.claims || [];
  const eligibleCharges = data?.eligibleCharges || [];
  const availablePlans = data?.insurancePlans || [];

  const visibleClaims = allClaims.filter(c => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'APPROVED') return c.status === 'APPROVED' || c.status === 'PAID';
    return c.status === statusFilter;
  });

  const selectedCharge = eligibleCharges.find(c => String(c.ledgerId) === String(selectedLedgerId)) || null;
  const effectiveInsuranceId = selectedCharge?.insuranceId ?? selectedInsuranceId;

  const handleSelectCharge = (charge) => {
    setSelectedLedgerId(charge.ledgerId);
    if (charge.insuranceId != null) {
      setSelectedInsuranceId(charge.insuranceId);
    }
  };

  const handleSubmitClaim = async () => {
    if (!selectedCharge) {
      Alert.alert('Select a Charge', 'Please choose an eligible healthcare charge to claim.');
      return;
    }
    if (effectiveInsuranceId == null) {
      Alert.alert('Insurance Plan Required', 'Please select an insurance plan to link with this claim.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await ClaimsAPI.submitClaim({
        ledgerId: selectedCharge.ledgerId,
        insuranceId: effectiveInsuranceId,
        notes: notes.trim(),
      });
      Alert.alert('Claim Submitted', result.message || 'Your digital claim has been submitted.');
      setSelectedLedgerId(null);
      setSelectedInsuranceId(null);
      setNotes('');
      setMode('track');
      setStatusFilter('ALL');
      await load();
    } catch (err) {
      Alert.alert('Submission Failed', err.message || 'Could not submit your claim.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <ShieldCheck size={22} color="#0ea5e9" />
              <Text style={styles.headerTitle}>Digital Claims</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close digital claims">
              <X size={20} color="#4b5563" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#0ea5e9" />
              <Text style={styles.mutedText}>Loading your digital claims...</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <AlertCircle size={44} color="#f87171" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
                <RotateCcw size={16} color="#fff" />
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.listInner}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#0ea5e9']} />}
            >
              {/* Summary Dashboard Card */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  <FileCheck2 size={18} color="#fff" />
                  <Text style={styles.summaryLabel}>Total Claimed Coverage</Text>
                </View>
                <Text style={styles.summaryAmount}>{formatPeso(summary?.totalClaimedAmount)}</Text>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryCellLabel}>Submitted</Text>
                    <Text style={styles.summaryCellValue}>{summary?.submitted || 0}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryCellLabel}>In Review</Text>
                    <Text style={styles.summaryCellValue}>{summary?.inReview || 0}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryCellLabel}>Approved</Text>
                    <Text style={styles.summaryCellValue}>{summary?.approved || 0}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryCellLabel}>Denied</Text>
                    <Text style={styles.summaryCellValue}>{summary?.denied || 0}</Text>
                  </View>
                </View>
              </View>

              {/* Mode Switcher */}
              <View style={styles.modeSwitch}>
                <TouchableOpacity
                  onPress={() => setMode('track')}
                  style={[styles.modeBtn, mode === 'track' && styles.modeBtnActive]}
                >
                  <Text style={[styles.modeBtnText, mode === 'track' && styles.modeBtnTextActive]}>
                    My Claims ({summary?.totalClaims || 0})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode('submit')}
                  style={[styles.modeBtn, mode === 'submit' && styles.modeBtnActive]}
                >
                  <Text style={[styles.modeBtnText, mode === 'submit' && styles.modeBtnTextActive]}>
                    Submit Claim ({summary?.eligibleCount || 0})
                  </Text>
                </TouchableOpacity>
              </View>

              {mode === 'track' ? (
                <>
                  {/* Status Filter Pills */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                    {STATUS_FILTERS.map(f => (
                      <TouchableOpacity
                        key={f.key}
                        onPress={() => setStatusFilter(f.key)}
                        style={[styles.tabBtn, statusFilter === f.key && styles.tabBtnActive]}
                      >
                        <Text style={[styles.tabText, statusFilter === f.key && styles.tabTextActive]}>{f.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {visibleClaims.length === 0 ? (
                    <View style={styles.empty}>
                      <FileText size={44} color="#cbd5e1" />
                      <Text style={styles.emptyTitle}>No claims found</Text>
                      <Text style={styles.mutedText}>
                        {statusFilter === 'ALL'
                          ? 'You have not submitted any digital claims yet.'
                          : `No claims with status "${CLAIM_STATUS_LABELS[statusFilter] || statusFilter}".`}
                      </Text>
                      {eligibleCharges.length > 0 && (
                        <TouchableOpacity style={styles.primaryCta} onPress={() => setMode('submit')}>
                          <Send size={15} color="#fff" />
                          <Text style={styles.primaryCtaText}>Submit a Claim</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    visibleClaims.map(claim => (
                      <ClaimCard
                        key={`claim-${claim.id}`}
                        claim={claim}
                        expanded={expandedId === claim.id}
                        onToggle={() => setExpandedId(prev => (prev === claim.id ? null : claim.id))}
                      />
                    ))
                  )}
                </>
              ) : (
                /* Submit Claim Form */
                <View style={styles.formSection}>
                  <Text style={styles.sectionTitle}>1. Select an Eligible Healthcare Charge</Text>
                  {eligibleCharges.length === 0 ? (
                    <View style={styles.empty}>
                      <CheckCircle2 size={44} color="#cbd5e1" />
                      <Text style={styles.emptyTitle}>No eligible charges available</Text>
                      <Text style={styles.mutedText}>
                        All of your recorded healthcare charges already have active claims, or you have no charges yet.
                      </Text>
                    </View>
                  ) : (
                    <>
                      {eligibleCharges.map(charge => {
                        const isSelected = String(charge.ledgerId) === String(selectedLedgerId);
                        const planText = [charge.carrierName, charge.planName].filter(Boolean).join(' · ');
                        return (
                          <TouchableOpacity
                            key={`eligible-${charge.ledgerId}`}
                            onPress={() => handleSelectCharge(charge)}
                            style={[styles.selectCard, isSelected && styles.selectCardActive]}
                            activeOpacity={0.8}
                          >
                            <View style={styles.selectCardHeader}>
                              <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
                                {isSelected && <View style={styles.radioInner} />}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.cardTitle}>{charge.procedureName}</Text>
                                <Text style={styles.cardSub}>
                                  {charge.date || '—'} · {charge.facilityName}
                                </Text>
                                {!!charge.providerName && (
                                  <Text style={styles.cardSub}>{charge.providerName}</Text>
                                )}
                              </View>
                              <Text style={styles.selectAmount}>{formatPeso(charge.amount)}</Text>
                            </View>
                            {!!planText && (
                              <View style={styles.linkedPlanChip}>
                                <ShieldCheck size={13} color="#0369a1" />
                                <Text style={styles.linkedPlanText}>Linked: {planText}</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}

                      {selectedCharge && (
                        <>
                          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>2. Insurance Coverage</Text>
                          {selectedCharge.insuranceId != null ? (
                            <View style={styles.insuranceBox}>
                              <ShieldCheck size={18} color="#0284c7" />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.insuranceBoxTitle}>
                                  {selectedCharge.carrierName || 'Linked Insurance Carrier'}
                                </Text>
                                <Text style={styles.insuranceBoxSub}>
                                  {selectedCharge.planName || `Plan #${selectedCharge.insuranceId}`}
                                </Text>
                              </View>
                            </View>
                          ) : availablePlans.length > 0 ? (
                            <View style={styles.planPicker}>
                              <Text style={styles.planPickerHint}>
                                Choose the insurance plan to link with this claim:
                              </Text>
                              {availablePlans.map(plan => {
                                const picked = String(selectedInsuranceId) === String(plan.insuranceId);
                                return (
                                  <TouchableOpacity
                                    key={`plan-${plan.insuranceId}`}
                                    onPress={() => setSelectedInsuranceId(plan.insuranceId)}
                                    style={[styles.planOption, picked && styles.planOptionActive]}
                                  >
                                    <Text style={[styles.planOptionText, picked && styles.planOptionTextActive]}>
                                      {plan.carrierName ? `${plan.carrierName} — ${plan.planName}` : plan.planName}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : (
                            <View style={styles.warningBox}>
                              <AlertCircle size={16} color="#b45309" />
                              <Text style={styles.warningText}>
                                No insurance plan is currently linked to your profile. Please contact your clinic to add your HMO or PhilHealth details.
                              </Text>
                            </View>
                          )}

                          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>3. Additional Notes (Optional)</Text>
                          <TextInput
                            style={styles.notesInput}
                            placeholder="Add reference numbers, LOA code, or supporting details..."
                            placeholderTextColor="#94a3b8"
                            multiline
                            numberOfLines={3}
                            maxLength={400}
                            value={notes}
                            onChangeText={setNotes}
                            editable={!submitting}
                          />

                          <TouchableOpacity
                            style={[
                              styles.submitBtn,
                              (submitting || effectiveInsuranceId == null) && styles.submitBtnDisabled,
                            ]}
                            disabled={submitting || effectiveInsuranceId == null}
                            onPress={handleSubmitClaim}
                          >
                            {submitting ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Send size={16} color="#fff" />
                                <Text style={styles.submitBtnText}>
                                  Submit Digital Claim ({formatPeso(selectedCharge.amount)})
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  )}
                </View>
              )}

              <Text style={styles.footnote}>
                Digital claims are transmitted to your clinic for insurance & PhilHealth verification. Status updates appear here automatically.
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#f8fafc', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '92%', overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  mutedText: { color: '#64748b', fontSize: 14, textAlign: 'center' },
  errorText: { color: '#b91c1c', fontSize: 14, textAlign: 'center' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0ea5e9', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  listInner: { padding: 16, gap: 14, paddingBottom: 40 },

  summaryCard: { backgroundColor: '#0284c7', borderRadius: 18, padding: 18 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLabel: { color: '#e0f2fe', fontSize: 13, fontWeight: '600' },
  summaryAmount: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 6 },
  summaryGrid: { flexDirection: 'row', marginTop: 14, gap: 6 },
  summaryCell: { flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' },
  summaryCellLabel: { color: '#e0f2fe', fontSize: 10, fontWeight: '600' },
  summaryCellValue: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 2 },

  modeSwitch: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4, gap: 4 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  modeBtnTextActive: { color: '#0284c7' },

  tabs: { gap: 8, paddingVertical: 2 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#e2e8f0' },
  tabBtnActive: { backgroundColor: '#0ea5e9' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  tabTextActive: { color: '#fff' },

  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  refText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  cardMain: { flexDirection: 'row', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  cardSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  insuranceText: { fontSize: 12, fontWeight: '600', color: '#0369a1', flex: 1 },
  cardAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  amountLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  amountValue: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  dateValue: { fontSize: 13, fontWeight: '600', color: '#334155', marginTop: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 },
  toggleText: { color: '#0ea5e9', fontSize: 13, fontWeight: '600' },

  detailsBox: { marginTop: 12, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  detailLabel: { fontSize: 13, color: '#64748b' },
  detailValue: { fontSize: 13, color: '#0f172a', fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  detailStrong: { fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },
  notesBox: { marginTop: 8, backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  notesLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  notesText: { fontSize: 13, color: '#334155', lineHeight: 18 },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  formSection: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  selectCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#e2e8f0', padding: 14 },
  selectCardActive: { borderColor: '#0ea5e9', backgroundColor: '#f0f9ff' },
  selectCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOuterActive: { borderColor: '#0ea5e9' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0ea5e9' },
  selectAmount: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  linkedPlanChip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#e0f2fe' },
  linkedPlanText: { fontSize: 12, fontWeight: '600', color: '#0369a1' },

  insuranceBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#bae6fd', padding: 14 },
  insuranceBoxTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  insuranceBoxSub: { fontSize: 12, color: '#0369a1', marginTop: 2 },
  planPicker: { gap: 8 },
  planPickerHint: { fontSize: 12, color: '#64748b' },
  planOption: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12 },
  planOptionActive: { borderColor: '#0ea5e9', backgroundColor: '#f0f9ff' },
  planOptionText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  planOptionTextActive: { color: '#0369a1' },
  warningBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#fde68a' },
  warningText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },

  notesInput: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1',
    padding: 12, fontSize: 14, color: '#0f172a', textAlignVertical: 'top', minHeight: 80,
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0ea5e9', borderRadius: 12, paddingVertical: 14, marginTop: 6,
  },
  submitBtnDisabled: { backgroundColor: '#94a3b8' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: 44, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  primaryCta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0ea5e9', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, marginTop: 6 },
  primaryCtaText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  footnote: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 4 },
});
