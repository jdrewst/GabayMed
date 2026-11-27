import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert } from 'react-native';
import {
  Calendar,
  X,
  ChevronRight,
  CreditCard,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Stethoscope,
} from 'lucide-react-native';
import { AppHeader } from '../components/app-header';
import { AppointmentBooking } from '../components/appointment';
import { GradientButton, GradientText, GradientIcon } from '../components/ui/gradient-button';
import FacilitiesAPI from '../services/facilitiesApi';

const BILLING_FILTERS = [
  { key: 'all', label: 'All Charges' },
  { key: 'outstanding', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
];

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'gcash', label: 'GCash' },
  { id: 'cc', label: 'Credit Card' },
  { id: 'check', label: 'Check' },
];

function formatPeso(val) {
  const num = Number(val) || 0;
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MyFacilities({ onOpenMessages, onOpenNotifications, onOpenProfile, onOpenMyAppointments, refreshTrigger }) {
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [showAllBalances, setShowAllBalances] = useState(false);
  const [showAllSchedules, setShowAllSchedules] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);

  // Billing & Payments Filter & Expansion State
  const [billingFilter, setBillingFilter] = useState('all');
  const [expandedChargeId, setExpandedChargeId] = useState(null);

  // Payment State (Aligned with HIS Enter Payment logic)
  const [selectedProcedure, setSelectedProcedure] = useState('auto'); // 'auto' or specific charge ledger_id
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState(null);

  const [loading, setLoading] = useState(true);

  // Raw Data State
  const [facilities, setFacilities] = useState([]);
  const [allSchedules, setAllSchedules] = useState([]);
  const [allActivities, setAllActivities] = useState([]);
  const [allBalances, setAllBalances] = useState([]);
  const [allBillingCharges, setAllBillingCharges] = useState([]);
  const [distributionByFacility, setDistributionByFacility] = useState({});
  const [overallDistribution, setOverallDistribution] = useState({
    totalBalance: 0,
    insurancePortion: 0,
    patientPortion: 0,
  });
  const [totalPendingBalance, setTotalPendingBalance] = useState(0);

  // Derived Data (Filtered by Selected Facility)
  const schedules = selectedFacility ? allSchedules.filter(s => s.facilityId === selectedFacility) : [];
  const activities = selectedFacility ? allActivities.filter(a => a.facilityId === selectedFacility) : [];
  const balances = selectedFacility ? allBalances.filter(b => b.facilityId === selectedFacility) : [];
  const facilityCharges = selectedFacility
    ? allBillingCharges.filter(c => c.facilityId === selectedFacility)
    : allBillingCharges;
  const activeDistribution =
    (selectedFacility && distributionByFacility[selectedFacility]) || overallDistribution;

  const filteredBillingCharges = facilityCharges.filter(c => {
    if (billingFilter === 'outstanding') return c.remainingBalance > 0.01;
    if (billingFilter === 'paid') return c.paymentStatus === 'PAID';
    return true;
  });

  // Reusable ScheduleCard component
  const ScheduleCard = ({ schedule, isSmall }) => {
    const statusStyles = {
      Scheduled: { badge: styles.scheduledBadge, text: styles.scheduledText },
      Done: { badge: styles.doneBadge, text: styles.doneText },
      Cancelled: { badge: styles.cancelledBadge, text: styles.cancelledText },
    };
    const { badge, text } = statusStyles[schedule.status] || { badge: styles.scheduledBadge, text: styles.scheduledText };

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onOpenMyAppointments}
        style={isSmall ? styles.scheduleCardGrid : styles.scheduleCard}
      >
        <View style={styles.scheduleTopRow}>
          <GradientIcon style={[styles.scheduleCalendarIcon, isSmall && { width: 35, height: 35, marginTop: 12 }]}>
            <Calendar size={isSmall ? 18 : 24} color="#fff" />
          </GradientIcon>
          <View style={styles.scheduleDateContainer}>
            <GradientText style={[styles.scheduleMonthText, isSmall && { fontSize: 20, marginBottom: -4 }]}>
              {schedule.month}
            </GradientText>
            <GradientText style={[styles.scheduleDate, isSmall && { fontSize: 32, lineHeight: 36 }]}>
              {schedule.date}
            </GradientText>
          </View>
        </View>
        <View style={[styles.statusBadge, badge]}>
          <Text style={[styles.statusText, text]}>{schedule.status}</Text>
        </View>
        <View style={styles.scheduleDetails}>
          <GradientText style={[styles.scheduleProcedure, isSmall && { fontSize: 16 }]}>
            {schedule.procedure}
          </GradientText>
          <Text style={styles.scheduleDoctor}>{schedule.doctor}</Text>
          <Text style={styles.scheduleRoom}>{schedule.room}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  useEffect(() => {
    fetchFacilitiesData();
  }, [refreshTrigger]);

  const fetchFacilitiesData = async () => {
    try {
      setLoading(true);
      
      const data = await FacilitiesAPI.getFacilitiesPageData();
      
      setFacilities(data.facilities);
      setAllSchedules(data.schedules);
      setAllActivities(data.activities);
      setAllBalances(data.balances);
      setAllBillingCharges(data.billingCharges || []);
      setDistributionByFacility(data.distributionByFacility || {});
      setOverallDistribution(
        data.overallDistribution || { totalBalance: 0, insurancePortion: 0, patientPortion: 0 }
      );
      setTotalPendingBalance(data.totalPendingBalance || 0);

      if (data.facilities.length > 0 && !selectedFacility) {
        setSelectedFacility(data.facilities[0].id);
      }

    } catch (error) {
      console.error('Error fetching facilities data:', error);
      Alert.alert('Error', 'Failed to load facilities data');
    } finally {
      setLoading(false);
    }
  };

  const openMakePaymentModal = (preselectedCharge = null) => {
    setPaymentFeedback(null);
    if (preselectedCharge) {
      setSelectedProcedure(preselectedCharge.id);
      setPaymentAmount(String(preselectedCharge.remainingBalance));
    } else if (balances.length > 0) {
      setSelectedProcedure('auto');
      const totalUnpaid = balances.reduce((s, b) => s + Number(b.remainingBalance || b.amount || 0), 0);
      setPaymentAmount(totalUnpaid > 0 ? String(Number(totalUnpaid.toFixed(2))) : '');
    } else {
      setSelectedProcedure('auto');
      setPaymentAmount('');
    }
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    setPaymentFeedback(null);
    const enteredAmount = parseFloat(paymentAmount);
    if (!paymentAmount || isNaN(enteredAmount) || enteredAmount <= 0) {
      setPaymentFeedback({ type: 'error', message: 'Please enter a valid payment amount greater than ₱0.00.' });
      return;
    }

    if (balances.length === 0) {
      setPaymentFeedback({ type: 'error', message: 'There are no pending charges to pay.' });
      return;
    }

    setIsSubmittingPayment(true);
    try {
      // Same allocation logic as HIS PatientLedger (client/src/components/patient-ledger.jsx):
      // either allocate to a specific selected charge or auto-allocate oldest first across unpaid charges.
      let allocationsToPost = [];

      if (selectedProcedure && selectedProcedure !== 'auto') {
        const target = balances.find(b => String(b.id) === String(selectedProcedure));
        if (!target) {
          setPaymentFeedback({ type: 'error', message: 'Please select a valid procedure charge to pay.' });
          setIsSubmittingPayment(false);
          return;
        }
        allocationsToPost.push({
          charge: target,
          applyAmount: enteredAmount,
          remainingAfterPayment: Math.max(0, target.remainingBalance - enteredAmount),
        });
      } else {
        // Auto-allocate (Oldest First)
        const sortedUnpaid = [...balances].sort(
          (a, b) => new Date(a.rawDate || a.date) - new Date(b.rawDate || b.date)
        );
        let remaining = enteredAmount;
        for (const charge of sortedUnpaid) {
          if (remaining <= 0) break;
          const applyAmt = Math.min(charge.remainingBalance, remaining);
          if (applyAmt > 0) {
            allocationsToPost.push({
              charge,
              applyAmount: Number(applyAmt.toFixed(2)),
              remainingAfterPayment: Math.max(0, charge.remainingBalance - applyAmt),
            });
            remaining -= applyAmt;
          }
        }
        // If there is still leftover overpayment, attach it to the first charge's patient record
        if (remaining > 0.01 && sortedUnpaid[0]) {
          allocationsToPost.push({
            charge: { ...sortedUnpaid[0], id: null },
            applyAmount: Number(remaining.toFixed(2)),
            remainingAfterPayment: 0,
          });
        }
      }

      let allOk = true;
      let firstErr = '';

      for (const item of allocationsToPost) {
        const res = await FacilitiesAPI.addPayment({
          patientId: item.charge.patientId,
          chargeId: item.charge.id,
          appointmentId: item.charge.appointmentId || null,
          procedureId: item.charge.procedureId || null,
          providerId: item.charge.providerId || null,
          amount: item.applyAmount,
          method: selectedPaymentMethod,
          remainingAfterPayment: item.remainingAfterPayment,
        });
        if (!res.success) {
          allOk = false;
          if (!firstErr) firstErr = res.error || 'Payment failed.';
        }
      }

      if (allOk) {
        setShowPaymentModal(false);
        setPaymentAmount('');
        setSelectedProcedure('auto');
        await fetchFacilitiesData();
      } else {
        setPaymentFeedback({ type: 'error', message: firstErr || 'Could not process payment.' });
      }
    } catch (error) {
      setPaymentFeedback({ type: 'error', message: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const currentFacility = facilities.find((f) => f.id === selectedFacility);

  const renderActivityItem = (activity, index) => {
    const isCharge = activity.amount > 0;
    return (
      <View key={`act-${activity.id || index}-${index}`} style={styles.activityItem}>
        <View style={styles.activityLeft}>
          <View style={[
            styles.activityIcon,
            isCharge ? styles.chargeIcon : styles.paymentIcon
          ]}>
            {isCharge ? (
              <ArrowUpRight size={20} color="#fff" />
            ) : (
              <ArrowDownLeft size={20} color="#fff" />
            )}
          </View>
          <View>
            <Text style={styles.activityDescription}>{activity.description}</Text>
            <Text style={styles.activityTime}>{activity.time}</Text>
          </View>
        </View>
        <Text style={[
          styles.activityAmount,
          isCharge ? styles.chargeText : styles.paymentText
        ]}>
          {isCharge ? "-" : "+"}₱{Math.abs(activity.amount).toLocaleString()}
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader onOpenMessages={onOpenMessages} onOpenNotifications={onOpenNotifications} onOpenProfile={onOpenProfile} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loadingText}>Loading facilities...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader onOpenMessages={onOpenMessages} onOpenNotifications={onOpenNotifications} onOpenProfile={onOpenProfile} />

      <ScrollView style={styles.scrollContainer}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Current Provider</Text>

          {currentFacility && (
            <View style={styles.facilityCard}>
              <TouchableOpacity
                onPress={() => setSelectedFacility(null)}
                style={styles.closeButton}
              >
                <X size={16} color="#6b7280" />
              </TouchableOpacity>
              <View style={styles.facilityHeader}>
                <View style={styles.facilityIcon}>
                  <Building2 size={24} color="#0ea5e9" />
                </View>
                <Text style={styles.facilityName}>{currentFacility.name}</Text>
              </View>
              <View style={styles.facilityInfo}>
                <View style={styles.insuranceBadge}>
                  <Text style={styles.insuranceText}>{currentFacility.insurancePlan}</Text>
                </View>
                <Text style={styles.lastVisitText}>Last Visit {currentFacility.lastVisit}</Text>
              </View>
              <GradientButton 
                onPress={() => setShowAppointment(true)}
                style={styles.scheduleButton}
              >
                <Calendar size={22} color="#66BAFF" fill="#fff" />
                <Text style={styles.scheduleButtonText}>Schedule New Appointment</Text>
              </GradientButton>
            </View>
          )}

          {!selectedFacility && (
            <View style={styles.facilitySelectorContainer}>
              {facilities.length > 0 ? (
                facilities.map((facility, idx) => (
                  <TouchableOpacity
                    key={`fac-${facility.id}-${idx}`}
                    onPress={() => setSelectedFacility(facility.id)}
                    style={styles.facilitySelectorCard}
                  >
                    <View style={styles.facilitySelectorContent}>
                      <View style={styles.facilityIcon}>
                        <Building2 size={24} color="#0ea5e9" />
                      </View>
                      <View style={styles.facilitySelectorInfo}>
                        <Text style={styles.facilitySelectorName}>{facility.name}</Text>
                        <Text style={styles.facilitySelectorLastVisit}>Last Visit: {facility.lastVisit}</Text>
                      </View>
                    </View>
                    <ChevronRight size={20} color="#9ca3af" />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={{ alignItems: 'center', marginTop: 20 }}>
                  <Text style={{ textAlign: 'center', color: '#6b7280', marginBottom: 14 }}>
                    No facilities linked to your account yet.
                  </Text>
                  <GradientButton
                    onPress={() => setShowAppointment(true)}
                    style={[styles.scheduleButton, { paddingHorizontal: 24 }]}
                  >
                    <Calendar size={20} color="#66BAFF" fill="#fff" />
                    <Text style={styles.scheduleButtonText}>Schedule New Appointment</Text>
                  </GradientButton>
                </View>
              )}
            </View>
          )}
        </View>

        {selectedFacility !== null && (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Your Schedule</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {onOpenMyAppointments && (
                    <TouchableOpacity onPress={onOpenMyAppointments}>
                      <Text style={[styles.seeAllButton, { color: '#0ea5e9' }]}>Manage</Text>
                    </TouchableOpacity>
                  )}
                  {schedules.length > 2 && (
                    <TouchableOpacity onPress={() => setShowAllSchedules(!showAllSchedules)}>
                      <Text style={styles.seeAllButton}>{showAllSchedules ? 'Show Less' : 'See All'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {schedules.length === 0 ? (
                <Text style={{ color: '#9ca3af', marginTop: 12, fontStyle: 'italic' }}>No appointments scheduled.</Text>
              ) : showAllSchedules ? (
                <View style={styles.scheduleGrid}>
                  {schedules.map((schedule, idx) => (
                    <ScheduleCard key={`sched-grid-${schedule.id}-${idx}`} schedule={schedule} isSmall />
                  ))}
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scheduleScroll}>
                  {schedules.map((schedule, idx) => (
                    <ScheduleCard key={`sched-scroll-${schedule.id}-${idx}`} schedule={schedule} />
                  ))}
                </ScrollView>
              )}
            </View>

            {/* BILLING & PAYMENTS SECTION (Transferred from Settings + Balance Distribution + Make Payment) */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Receipt size={20} color="#0ea5e9" />
                  <Text style={styles.sectionTitle}>Billing & Payments</Text>
                </View>
                <Text style={styles.billingCountHint}>
                  {balances.length} pending · {facilityCharges.filter(c => c.paymentStatus === 'PAID').length} paid
                </Text>
              </View>

              {/* Balance Distribution Card (Mirrors HIS Payment Distribution) */}
              <View style={styles.distributionCard}>
                <Text style={styles.distributionHeaderTitle}>Balance Distribution</Text>
                <View style={styles.distributionGrid}>
                  <View style={styles.distributionCol}>
                    <Text style={styles.distributionLabel}>Total Balance</Text>
                    <Text style={[styles.distributionValue, { color: '#1d4ed8' }]}>
                      {formatPeso(activeDistribution.totalBalance)}
                    </Text>
                  </View>
                  <View style={styles.distributionCol}>
                    <Text style={styles.distributionLabel}>Insurance Portion</Text>
                    <Text style={[styles.distributionValue, { color: '#059669' }]}>
                      {formatPeso(activeDistribution.insurancePortion)}
                    </Text>
                  </View>
                  <View style={styles.distributionCol}>
                    <Text style={styles.distributionLabel}>Patient Portion</Text>
                    <Text style={[styles.distributionValue, { color: '#0f172a' }]}>
                      {formatPeso(activeDistribution.patientPortion)}
                    </Text>
                  </View>
                </View>

                {/* Make Payment button placed directly after Balance Distribution */}
                <GradientButton
                  onPress={() => openMakePaymentModal(null)}
                  disabled={balances.length === 0}
                  style={[
                    styles.inlineMakePaymentButton,
                    balances.length === 0 && { opacity: 0.55 },
                  ]}
                >
                  <CreditCard size={18} color="#fff" />
                  <Text style={styles.makePaymentButtonText}>
                    {balances.length > 0 ? 'Make Payment' : 'All Charges Paid'}
                  </Text>
                </GradientButton>
              </View>

              {/* Billing Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.billingTabsRow}
              >
                {BILLING_FILTERS.map(f => {
                  const active = billingFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      onPress={() => setBillingFilter(f.key)}
                      style={[styles.billingFilterChip, active && styles.billingFilterChipActive]}
                    >
                      <Text style={[styles.billingFilterText, active && styles.billingFilterTextActive]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Charge Breakdown Cards */}
              <View style={styles.billingChargesList}>
                {filteredBillingCharges.length === 0 ? (
                  <Text style={{ color: '#9ca3af', marginTop: 8, fontStyle: 'italic' }}>
                    {billingFilter === 'outstanding'
                      ? 'You have no pending balances.'
                      : 'No billing charges found for this facility.'}
                  </Text>
                ) : (
                  filteredBillingCharges.map(charge => {
                    const isPaid = charge.paymentStatus === 'PAID';
                    const isPartial = charge.paymentStatus === 'PARTIALLY_PAID';
                    const isExpanded = expandedChargeId === charge.id;
                    const badgeBg = isPaid ? '#dcfce7' : isPartial ? '#e0f2fe' : '#fef3c7';
                    const badgeColor = isPaid ? '#15803d' : isPartial ? '#0369a1' : '#92400e';
                    const badgeLabel = isPaid ? 'Paid' : isPartial ? 'Partially Paid' : 'Unpaid';

                    return (
                      <View key={`bill-charge-${charge.id}`} style={styles.billingChargeCard}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() =>
                            setExpandedChargeId(prev => (prev === charge.id ? null : charge.id))
                          }
                        >
                          <View style={styles.billingChargeTop}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={[styles.billingStatusPill, { backgroundColor: badgeBg }]}>
                                {isPaid ? (
                                  <CheckCircle2 size={12} color={badgeColor} />
                                ) : isPartial ? (
                                  <Clock size={12} color={badgeColor} />
                                ) : (
                                  <AlertCircle size={12} color={badgeColor} />
                                )}
                                <Text style={[styles.billingStatusPillText, { color: badgeColor }]}>
                                  {badgeLabel}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.billingStatusPill,
                                  {
                                    backgroundColor: charge.billToInsurance ? '#eff6ff' : '#f1f5f9',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.billingStatusPillText,
                                    { color: charge.billToInsurance ? '#1d4ed8' : '#475569' },
                                  ]}
                                >
                                  {charge.billToInsurance ? 'Bill to Insurance' : 'Self-Pay'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.billingChargeDate}>{charge.date}</Text>
                          </View>

                          <View style={styles.billingChargeMain}>
                            <Stethoscope size={17} color="#0ea5e9" style={{ marginTop: 2 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.billingChargeTitle}>
                                {charge.code && charge.code !== '-' ? `[${charge.code}] ` : ''}
                                {charge.procedureName}
                              </Text>
                              {!!charge.providerName && (
                                <Text style={styles.billingChargeSub}>{charge.providerName}</Text>
                              )}
                            </View>
                          </View>

                          <View style={styles.billingChargeAmountsRow}>
                            <View>
                              <Text style={styles.billingAmountCaption}>Total Charge</Text>
                              <Text style={styles.billingAmountNumber}>{formatPeso(charge.amount)}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={styles.billingAmountCaption}>Remaining Balance</Text>
                              <Text
                                style={[
                                  styles.billingAmountNumber,
                                  { color: charge.remainingBalance > 0 ? '#dc2626' : '#15803d' },
                                ]}
                              >
                                {formatPeso(charge.remainingBalance)}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.billingExpandRow}>
                            <Text style={styles.billingExpandText}>
                              {isExpanded ? 'Hide details' : 'View charge breakdown'}
                            </Text>
                            {isExpanded ? (
                              <ChevronUp size={15} color="#0ea5e9" />
                            ) : (
                              <ChevronDown size={15} color="#0ea5e9" />
                            )}
                          </View>
                        </TouchableOpacity>

                        {isExpanded && (
                          <View style={styles.billingBreakdownBox}>
                            <View style={styles.billingBreakdownLine}>
                              <Text style={styles.billingBreakdownLabel}>Procedure Charge</Text>
                              <Text style={styles.billingBreakdownValue}>{formatPeso(charge.amount)}</Text>
                            </View>
                            <View style={styles.billingBreakdownLine}>
                              <Text style={styles.billingBreakdownLabel}>Amount Paid</Text>
                              <Text style={[styles.billingBreakdownValue, { color: '#0369a1' }]}>
                                − {formatPeso(charge.amountPaid)}
                              </Text>
                            </View>
                            <View style={styles.billingBreakdownDivider} />
                            <View style={styles.billingBreakdownLine}>
                              <Text style={[styles.billingBreakdownLabel, { fontWeight: '700', color: '#0f172a' }]}>
                                Remaining Balance
                              </Text>
                              <Text
                                style={[
                                  styles.billingBreakdownValue,
                                  {
                                    fontWeight: '800',
                                    color: charge.remainingBalance > 0 ? '#dc2626' : '#15803d',
                                  },
                                ]}
                              >
                                {formatPeso(charge.remainingBalance)}
                              </Text>
                            </View>

                            {charge.payments?.length > 0 && (
                              <View style={{ marginTop: 10 }}>
                                <Text style={styles.billingPaymentsSubHeader}>Payments Applied</Text>
                                {charge.payments.map((p, idx) => (
                                  <View key={`pmt-${p.id}-${idx}`} style={styles.billingPaymentHistoryRow}>
                                    <CreditCard size={13} color="#64748b" />
                                    <Text style={styles.billingPaymentHistoryText}>
                                      {p.date} · {p.description}
                                    </Text>
                                    <Text style={styles.billingPaymentHistoryAmt}>{formatPeso(p.amount)}</Text>
                                  </View>
                                ))}
                              </View>
                            )}

                            {charge.remainingBalance > 0.01 && (
                              <TouchableOpacity
                                style={styles.paySingleChargeBtn}
                                onPress={() => openMakePaymentModal(charge)}
                              >
                                <CreditCard size={15} color="#0284c7" />
                                <Text style={styles.paySingleChargeBtnText}>Pay This Charge</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Account Activity</Text>
                {activities.length > 0 && (
                  <TouchableOpacity onPress={() => setShowAllBalances(true)}>
                    <Text style={styles.seeAllButton}>See All</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.activityContainer}>
                {activities.length === 0 ? (
                  <Text style={{ color: '#9ca3af', marginTop: 12, fontStyle: 'italic' }}>No recent activity.</Text>
                ) : (
                  activities.slice(0, 3).map(renderActivityItem)
                )} 
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Account Activity Modal (Make Payment button removed from here as requested) */}
      <Modal
        visible={showAllBalances}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAllBalances(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Account Activity</Text>
              <TouchableOpacity
                onPress={() => setShowAllBalances(false)}
                style={styles.modalCloseButton}
              >
                <X size={20} color="#4b5563" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.totalBalanceCard}>
                <Text style={styles.totalBalanceLabel}>Total Pending Balance</Text>
                <Text style={styles.totalBalanceAmount}>
                  {formatPeso(activeDistribution.totalBalance)}
                </Text>
              </View>

              <ScrollView style={{ maxHeight: 340 }}>
                <View style={styles.balancesList}>
                  {activities.length === 0 ? (
                     <Text style={{ textAlign: 'center', color: '#6b7280', padding: 20 }}>No activity history.</Text>
                  ) : (
                    activities.map(renderActivityItem)
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Make Payment Modal (Uses HIS Payment Allocation & Status Sync Logic) */}
      <Modal
        visible={showPaymentModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 440 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Make Payment</Text>
              <TouchableOpacity
                onPress={() => setShowPaymentModal(false)}
                style={styles.modalCloseButton}
              >
                <X size={20} color="#4b5563" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {paymentFeedback && (
                <View
                  style={[
                    styles.paymentFeedbackBox,
                    paymentFeedback.type === 'error'
                      ? { backgroundColor: '#fef2f2', borderColor: '#fecaca' }
                      : { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: paymentFeedback.type === 'error' ? '#b91c1c' : '#15803d',
                      fontWeight: '500',
                    }}
                  >
                    {paymentFeedback.message}
                  </Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Amount to Pay (₱) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor="#9ca3af"
                  value={paymentAmount}
                  onChangeText={val => {
                    setPaymentFeedback(null);
                    setPaymentAmount(val);
                  }}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Allocation Method / Procedure *</Text>
                <View style={styles.selectContainer}>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedProcedure('auto');
                      const totalUnpaid = balances.reduce(
                        (s, b) => s + Number(b.remainingBalance || b.amount || 0),
                        0
                      );
                      if (!paymentAmount && totalUnpaid > 0) {
                        setPaymentAmount(String(Number(totalUnpaid.toFixed(2))));
                      }
                    }}
                    style={[
                      styles.selectOption,
                      selectedProcedure === 'auto' && styles.selectOptionActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectOptionText,
                        selectedProcedure === 'auto' && styles.selectOptionTextActive,
                      ]}
                    >
                      Auto-allocate (Oldest First) — Total: {formatPeso(
                        balances.reduce((s, b) => s + Number(b.remainingBalance || b.amount || 0), 0)
                      )}
                    </Text>
                  </TouchableOpacity>

                  {balances.map(balance => (
                    <TouchableOpacity
                      key={balance.id}
                      onPress={() => {
                        setSelectedProcedure(balance.id);
                        setPaymentAmount(String(balance.remainingBalance ?? balance.amount));
                      }}
                      style={[
                        styles.selectOption,
                        selectedProcedure === balance.id && styles.selectOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.selectOptionText,
                          selectedProcedure === balance.id && styles.selectOptionTextActive,
                        ]}
                      >
                        {balance.date} · {balance.procedure} ({formatPeso(balance.remainingBalance ?? balance.amount)})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Payment Method *</Text>
                <View style={styles.paymentMethodGrid}>
                  {PAYMENT_METHODS.map(method => (
                    <TouchableOpacity
                      key={method.id}
                      style={[
                        styles.paymentMethodButton,
                        selectedPaymentMethod === method.id && styles.paymentMethodButtonActive,
                      ]}
                      onPress={() => setSelectedPaymentMethod(method.id)}
                    >
                      <Text
                        style={[
                          styles.paymentMethodText,
                          selectedPaymentMethod === method.id && styles.paymentMethodTextActive,
                        ]}
                      >
                        {method.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <GradientButton
                style={styles.confirmPaymentButton}
                onPress={handleConfirmPayment}
                disabled={isSubmittingPayment}
              >
                {isSubmittingPayment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmPaymentButtonText}>Post Payment</Text>
                )}
              </GradientButton>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <AppointmentBooking
        visible={showAppointment}
        onBooked={fetchFacilitiesData}
        onClose={() => {
          setShowAppointment(false);
          fetchFacilitiesData();
        }}
        facilityId={selectedFacility}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAllButton: {
    color: '#0ea5e9',
    fontSize: 14,
    fontWeight: '500',
  },
  facilityCard: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  facilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  facilityIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  facilityName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  facilityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  insuranceBadge: {
    backgroundColor: '#F4F4F4',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  insuranceText: {
    fontSize: 14,
    color: '#6b7280',
  },
  lastVisitText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 16,
  },
  scheduleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  facilitySelectorContainer: {
    marginTop: 12,
    gap: 8,
  },
  facilitySelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 12,
  },
  facilitySelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  facilitySelectorInfo: {
    flex: 1,
  },
  facilitySelectorName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1f2937',
  },
  facilitySelectorLastVisit: {
    fontSize: 14,
    color: '#1f2937',
    marginTop: 2,
  },
  scheduleScroll: {
    marginTop: 12,
  },
  scheduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  scheduleCard: {
    width: 180,
    height: 255,
    padding: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 12,
    marginRight: 12,
  },
  scheduleCardGrid: {
    width: '48%',
    padding: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 12,
  },
  scheduleTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  scheduleCalendarIcon: {
    width: 45,
    height: 45,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  scheduleDateContainer: {
    alignItems: 'flex-end',
  },
  scheduleMonthText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#66BAFF',
    marginBottom: -8,
  },
  scheduleDate: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#66BAFF',
    lineHeight: 52,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: -8,
  },
  scheduledBadge: {
    backgroundColor: '#66BAFF',
  },
  doneBadge: {
    backgroundColor: '#6FE2B2',
  },
  cancelledBadge: {
    backgroundColor: '#E26F6F',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scheduledText: {
    color: '#fff',
  },
  doneText: {
    color: '#fff',
  },
  cancelledText: {
    color: '#fff',
  },
  scheduleDetails: {
    marginTop: 16,
  },
  scheduleProcedure: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0ea5e9',
  },
  scheduleDoctor: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 4,
  },
  scheduleRoom: {
    fontSize: 12,
    color: '#9ca3af',
  },
  activityContainer: {
    marginTop: 12,
    gap: 12,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentIcon: {
    backgroundColor: '#6FE2B2', // Green
  },
  chargeIcon: {
    backgroundColor: '#E26F6F', // Red
  },
  activityDescription: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3A4D51',
  },
  activityTime: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  activityAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  paymentText: {
    color: '#6FE2B2', // Green
  },
  chargeText: {
    color: '#E26F6F', // Red
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    padding: 16,
  },
  totalBalanceCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  totalBalanceLabel: {
    fontSize: 14,
    color: '#4b5563',
  },
  totalBalanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0284c7',
    marginTop: 4,
  },
  balancesList: {
    gap: 12,
  },
  makePaymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  makePaymentButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
  },
  selectContainer: {
    gap: 8,
  },
  selectOption: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  selectOptionActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#0ea5e9',
  },
  selectOptionText: {
    fontSize: 14,
    color: '#4b5563',
  },
  selectOptionTextActive: {
    color: '#0284c7',
    fontWeight: '500',
  },
  paymentMethodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentMethodButton: {
    width: '48%',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    alignItems: 'center',
  },
  paymentMethodButtonActive: {
    borderColor: '#0ea5e9',
    backgroundColor: '#e0f2fe',
  },
  paymentMethodText: {
    fontSize: 14,
    color: '#374151',
  },
  paymentMethodTextActive: {
    color: '#0284c7',
    fontWeight: '600',
  },
  confirmPaymentButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmPaymentButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  billingCountHint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  distributionCard: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  distributionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  distributionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  distributionCol: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  distributionLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  distributionValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  inlineMakePaymentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  billingTabsRow: {
    gap: 8,
    paddingTop: 14,
    paddingBottom: 4,
  },
  billingFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  billingFilterChipActive: {
    backgroundColor: '#0ea5e9',
  },
  billingFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  billingFilterTextActive: {
    color: '#fff',
  },
  billingChargesList: {
    marginTop: 10,
    gap: 10,
  },
  billingChargeCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  billingChargeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  billingStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  billingStatusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  billingChargeDate: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  billingChargeMain: {
    flexDirection: 'row',
    gap: 8,
  },
  billingChargeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  billingChargeSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  billingChargeAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  billingAmountCaption: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  billingAmountNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
  },
  billingExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 10,
  },
  billingExpandText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  billingBreakdownBox: {
    marginTop: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
  },
  billingBreakdownLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  billingBreakdownLabel: {
    fontSize: 12,
    color: '#475569',
  },
  billingBreakdownValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  billingBreakdownDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 6,
  },
  billingPaymentsSubHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  billingPaymentHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  billingPaymentHistoryText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
  },
  billingPaymentHistoryAmt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
  paySingleChargeBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
  },
  paySingleChargeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
  },
  paymentFeedbackBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
});
