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
} from 'react-native';
import {
  X,
  Receipt,
  Wallet,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  Stethoscope,
  CreditCard,
  RotateCcw,
} from 'lucide-react-native';
import BillingAPI, { PAYMENT_STATUS_LABELS, formatPeso } from '../services/billingApi';
import { useTheme } from '../context/ThemeContext';

const FILTERS = [
  { key: 'all', label: 'All Charges' },
  { key: 'outstanding', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'history', label: 'History' },
];

function statusStyle(status) {
  switch ((status || '').toUpperCase()) {
    case 'PAID':
    case 'WAIVED':
      return { bg: '#dcfce7', color: '#15803d', icon: CheckCircle2 };
    case 'PARTIALLY_PAID':
      return { bg: '#e0f2fe', color: '#0369a1', icon: Clock };
    case 'OVERDUE':
      return { bg: '#fee2e2', color: '#b91c1c', icon: XCircle };
    default:
      return { bg: '#fef3c7', color: '#92400e', icon: AlertCircle };
  }
}

function StatusBadge({ status }) {
  const s = statusStyle(status);
  const Icon = s.icon;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Icon size={12} color={s.color} />
      <Text style={[styles.badgeText, { color: s.color }]}>
        {PAYMENT_STATUS_LABELS[status] || status || 'Unpaid'}
      </Text>
    </View>
  );
}

function Row({ label, value, strong, negative, color }) {
  const { display } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: display.textSecondary }, strong && [styles.rowStrong, { color: display.textPrimary }]]}>{label}</Text>
      <Text style={[styles.rowValue, { color: display.textPrimary }, strong && [styles.rowStrong, { color: display.textPrimary }], color && { color }]}>
        {negative ? `− ${formatPeso(value)}` : formatPeso(value)}
      </Text>
    </View>
  );
}

function ChargeCard({ charge, expanded, onToggle }) {
  const { display, isDark } = useTheme();
  const b = charge.breakdown || {};
  return (
    <View style={[styles.card, { backgroundColor: display.cardBg, borderColor: display.border }]}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.8}>
        <View style={styles.cardTop}>
          <StatusBadge status={charge.paymentStatus} />
          <Text style={[styles.cardDate, { color: display.placeholder }]}>{charge.date || '—'}</Text>
        </View>

        <View style={styles.cardMain}>
          <Stethoscope size={18} color="#0ea5e9" style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: display.textPrimary }]}>{charge.procedureName}</Text>
            {!!charge.providerName && <Text style={[styles.cardSub, { color: display.textSecondary }]}>{charge.providerName}</Text>}
            <View style={styles.facilityRow}>
              <Building2 size={13} color={display.textSecondary} />
              <Text style={[styles.cardSub, { color: display.textSecondary }]}>{charge.facilityName}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.cardAmounts, { borderTopColor: display.border }]}>
          <View>
            <Text style={[styles.amountLabel, { color: display.textSecondary }]}>Amount Due</Text>
            <Text style={[styles.amountValue, { color: display.textPrimary }]}>{formatPeso(b.patientPayable)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.amountLabel, { color: display.textSecondary }]}>Balance</Text>
            <Text style={[styles.amountValue, { color: charge.balance > 0 ? '#dc2626' : '#15803d' }]}>
              {formatPeso(charge.balance)}
            </Text>
          </View>
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleText}>{expanded ? 'Hide breakdown' : 'View charge breakdown'}</Text>
          {expanded ? <ChevronUp size={16} color="#0ea5e9" /> : <ChevronDown size={16} color="#0ea5e9" />}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.breakdown, { backgroundColor: isDark ? display.subCardBg : '#f8fafc' }]}>
          <Row label="Gross Charge" value={b.grossAmount} />
          {b.philhealthDeduction > 0 && <Row label="PhilHealth Coverage" value={b.philhealthDeduction} negative color="#15803d" />}
          {b.hmoDeduction > 0 && <Row label="HMO Coverage" value={b.hmoDeduction} negative color="#15803d" />}
          {b.discountAmount > 0 && <Row label="Discount (Senior/PWD/Other)" value={b.discountAmount} negative color="#15803d" />}
          <View style={[styles.divider, { backgroundColor: display.border }]} />
          <Row label="Patient Share" value={b.patientPayable} strong />
          <Row label="Amount Paid" value={charge.amountPaid} negative color="#0369a1" />
          <View style={[styles.divider, { backgroundColor: display.border }]} />
          <Row label="Remaining Balance" value={charge.balance} strong color={charge.balance > 0 ? '#dc2626' : '#15803d'} />

          {charge.payments?.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.subHeader, { color: display.textSecondary }]}>Payments applied</Text>
              {charge.payments.map((p, i) => (
                <View key={`${p.paymentId}-${i}`} style={styles.paymentLine}>
                  <CreditCard size={13} color={display.textSecondary} />
                  <Text style={[styles.paymentLineText, { color: display.textSecondary }]}>{p.date || '—'} · {p.method ? String(p.method).toUpperCase() : 'Payment'}</Text>
                  <Text style={styles.paymentLineAmount}>{formatPeso(p.amount)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function BillingPaymentsModal({ visible, onClose }) {
  const { display, isDark } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setData(await BillingAPI.getMyBilling());
    } catch (err) {
      setError(err.message || 'Unable to load your billing records.');
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const summary = data?.summary;
  const charges = (data?.charges || []).filter(c => {
    if (filter === 'outstanding') return c.balance > 0;
    if (filter === 'paid') return c.paymentStatus === 'PAID' || c.paymentStatus === 'WAIVED';
    return true;
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: display.bg }]}>
          <View style={[styles.header, { backgroundColor: display.cardBg, borderBottomColor: display.border }]}>
            <View style={styles.headerTitleGroup}>
              <Receipt size={22} color="#0ea5e9" />
              <Text style={[styles.headerTitle, { color: display.textPrimary }]}>Billing & Payments</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: display.subCardBg }]} accessibilityLabel="Close billing">
              <X size={20} color={display.textPrimary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#0ea5e9" />
              <Text style={[styles.mutedText, { color: display.textSecondary }]}>Loading your billing records...</Text>
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
              {/* Summary */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryTop}>
                  <Wallet size={20} color="#fff" />
                  <Text style={styles.summaryLabel}>Outstanding Balance</Text>
                </View>
                <Text style={styles.summaryAmount}>{formatPeso(summary?.outstandingBalance)}</Text>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryCellLabel}>Total Charges</Text>
                    <Text style={styles.summaryCellValue}>{formatPeso(summary?.totalCharges)}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryCellLabel}>Coverage</Text>
                    <Text style={styles.summaryCellValue}>{formatPeso(summary?.totalCoverage)}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryCellLabel}>Total Paid</Text>
                    <Text style={styles.summaryCellValue}>{formatPeso(summary?.totalPaid)}</Text>
                  </View>
                </View>
                <Text style={styles.summaryCounts}>
                  {summary?.counts?.unpaid || 0} unpaid · {summary?.counts?.partiallyPaid || 0} partially paid · {summary?.counts?.paid || 0} paid
                </Text>
              </View>

              {/* Filters */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {FILTERS.map(f => (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={[styles.tabBtn, { backgroundColor: display.subCardBg }, filter === f.key && styles.tabBtnActive]}
                  >
                    <Text style={[styles.tabText, { color: display.textSecondary }, filter === f.key && styles.tabTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {filter === 'history' ? (
                data.transactions.length === 0 ? (
                  <EmptyState text="No transactions yet." />
                ) : (
                  <View style={[styles.historyCard, { backgroundColor: display.cardBg, borderColor: display.border }]}>
                    {data.transactions.map((t, i) => (
                      <View key={`${t.type}-${t.id}-${i}`} style={[styles.historyRow, i > 0 && [styles.historyBorder, { borderTopColor: display.border }]]}>
                        <View style={[styles.historyIcon, { backgroundColor: t.type === 'PAYMENT' ? (isDark ? '#064e3b' : '#dcfce7') : (isDark ? '#0c4a6e' : '#e0f2fe') }]}>
                          {t.type === 'PAYMENT'
                            ? <CreditCard size={16} color={isDark ? '#4ade80' : '#15803d'} />
                            : <Receipt size={16} color={isDark ? '#38bdf8' : '#0369a1'} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.historyTitle, { color: display.textPrimary }]} numberOfLines={1}>{t.description}</Text>
                          <Text style={[styles.historySub, { color: display.textSecondary }]} numberOfLines={1}>
                            {t.date || '—'} · {t.facilityName}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={[styles.historyAmount, { color: t.amount < 0 ? '#15803d' : display.textPrimary }]}>
                            {t.amount < 0 ? `− ${formatPeso(Math.abs(t.amount))}` : formatPeso(t.amount)}
                          </Text>
                          {t.type === 'CHARGE' && <StatusBadge status={t.paymentStatus} />}
                        </View>
                      </View>
                    ))}
                  </View>
                )
              ) : charges.length === 0 ? (
                <EmptyState
                  text={filter === 'outstanding' ? 'You have no pending balances. 🎉' : 'No charges found.'}
                />
              ) : (
                charges.map(charge => (
                  <ChargeCard
                    key={`charge-${charge.id}`}
                    charge={charge}
                    expanded={expandedId === charge.id}
                    onToggle={() => setExpandedId(prev => (prev === charge.id ? null : charge.id))}
                  />
                ))
              )}

              <Text style={[styles.footnote, { color: display.textSecondary }]}>
                Amounts are based on your clinic ledger. For billing concerns, please contact the facility directly.
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function EmptyState({ text }) {
  const { display } = useTheme();
  return (
    <View style={styles.empty}>
      <Receipt size={44} color={display.placeholder} />
      <Text style={[styles.mutedText, { color: display.textSecondary }]}>{text}</Text>
    </View>
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

  summaryCard: { backgroundColor: '#0ea5e9', borderRadius: 18, padding: 18 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryLabel: { color: '#e0f2fe', fontSize: 13, fontWeight: '600' },
  summaryAmount: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 6 },
  summaryGrid: { flexDirection: 'row', marginTop: 14, gap: 8 },
  summaryCell: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 10 },
  summaryCellLabel: { color: '#e0f2fe', fontSize: 11 },
  summaryCellValue: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2 },
  summaryCounts: { color: '#e0f2fe', fontSize: 12, marginTop: 12 },

  tabs: { gap: 8, paddingVertical: 2 },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e2e8f0' },
  tabBtnActive: { backgroundColor: '#0ea5e9' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  tabTextActive: { color: '#fff' },

  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardDate: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  cardMain: { flexDirection: 'row', gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cardSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  facilityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardAmounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  amountLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  amountValue: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 },
  toggleText: { color: '#0ea5e9', fontSize: 13, fontWeight: '600' },

  breakdown: { marginTop: 12, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 13, color: '#475569' },
  rowValue: { fontSize: 13, color: '#0f172a', fontWeight: '600' },
  rowStrong: { fontWeight: '800', color: '#0f172a' },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },
  subHeader: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  paymentLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  paymentLineText: { flex: 1, fontSize: 12, color: '#475569' },
  paymentLineAmount: { fontSize: 12, fontWeight: '700', color: '#15803d' },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  historyCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  historyBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  historyIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  historySub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: 50, gap: 12 },
  footnote: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 4 },
});
