import { supabase } from '../lib/supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Session from './session';

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location?.origin &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin)
  ) {
    return window.location.origin;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;
  if (hostUri) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost && lanHost !== 'localhost' && lanHost !== '127.0.0.1') {
      return `http://${lanHost}:3000`;
    }
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

const API_URL = resolveApiUrl();

function cleanChargeDescription(raw) {
  return String(raw || '')
    .replace(/\s*\[(?:Bill to Insurance|Self-Pay)\]\s*$/i, '')
    .trim();
}

function isChargeBilledToInsurance(row) {
  if (typeof row.bill_to_insurance === 'boolean') return row.bill_to_insurance;
  const raw = String(row.description || '');
  if (/\[Self-Pay\]/i.test(raw)) return false;
  if (/\[Bill to Insurance\]/i.test(raw)) return true;
  return true;
}

function resolveProcedureLabel(apt) {
  if (apt?.procedures?.name) return apt.procedures.name;
  if (apt?.procedures?.description) return apt.procedures.description;
  if (typeof apt?.notes === 'string') {
    const match = /^Service:\s*([^.]+)\./i.exec(apt.notes.trim());
    if (match && match[1]) return match[1].trim();
  }
  if (apt?.procedure_id) return `Procedure #${apt.procedure_id}`;
  return 'Consultation';
}

const FacilitiesAPI = {
  async getFacilitiesPageData() {
    try {
      const patientIds = await Session.getAssociatedPatientIds();

      // Always fetch all registered healthcare facilities so the user can browse and book at any clinic
      const allFacilitiesPromise = supabase
        .from('facilities')
        .select('*')
        .order('name', { ascending: true });

      const [allFacilitiesResult, appointmentsResult, ledgerResult, patientsResult] = await Promise.all([
        allFacilitiesPromise,
        patientIds.length > 0
          ? supabase
              .from('appointments')
              .select(`
                *,
                procedures ( * ),
                providers (
                  *,
                  facilities ( * )
                )
              `)
              .in('patient_id', patientIds)
              .order('appointment_date', { ascending: false })
          : Promise.resolve({ data: [] }),
        patientIds.length > 0
          ? supabase
              .from('ledger')
              .select(`
                *,
                procedures ( * ),
                providers ( * ),
                appointments (
                  appointment_date,
                  notes,
                  procedures ( * ),
                  providers (
                    *,
                    facilities ( * )
                  )
                )
              `)
              .in('patient_id', patientIds)
              .order('date', { ascending: false })
          : Promise.resolve({ data: [] }),
        patientIds.length > 0
          ? supabase
              .from('patients')
              .select(`
                patient_id,
                facility_id,
                insurance_id,
                facilities ( * ),
                insurance_plans (
                  insurance_id,
                  plan_name,
                  max_limit,
                  deductible,
                  copay_amount,
                  copay_type
                )
              `)
              .in('patient_id', patientIds)
          : Promise.resolve({ data: [] }),
      ]);

      const allRegisteredFacilities = allFacilitiesResult.data || [];
      const appointments = appointmentsResult.data || [];
      const ledger = ledgerResult.data || [];
      const patientRows = patientsResult.data || [];

      // Map patient_id to facility_id
      const patientFacilityMap = {};
      const facilitiesMap = new Map();

      patientRows.forEach(p => {
        if (p.patient_id && p.facility_id) {
          patientFacilityMap[p.patient_id] = p.facility_id;
        }
        const fac = p.facilities;
        if (fac && fac.facility_id && !facilitiesMap.has(fac.facility_id)) {
          facilitiesMap.set(fac.facility_id, {
            id: fac.facility_id,
            name: fac.name || 'Healthcare Facility',
            address: fac.address || fac.location || '',
            insurancePlan: 'Maxicare',
            lastVisit: 'No visits yet',
          });
        }
      });

      appointments.forEach(apt => {
        const facility = apt.providers?.facilities;
        const fId = apt.facility_id || facility?.facility_id;
        if (apt.patient_id && fId) {
          patientFacilityMap[apt.patient_id] = fId;
        }
        if (facility && fId) {
          if (!facilitiesMap.has(fId)) {
            facilitiesMap.set(fId, {
              id: fId,
              name: facility.name || 'Healthcare Facility',
              address: facility.address || facility.location || '',
              insurancePlan: 'Maxicare',
              lastVisit: 'No visits yet',
            });
          }

          const existing = facilitiesMap.get(fId);
          if (apt.status === 'COMPLETED' && existing.lastVisit === 'No visits yet') {
            existing.lastVisit = new Date(apt.appointment_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
          }
        }
      });

      // Include all other registered healthcare facilities so all facilities are displayed
      allRegisteredFacilities.forEach(fac => {
        if (fac && fac.facility_id && !facilitiesMap.has(fac.facility_id)) {
          facilitiesMap.set(fac.facility_id, {
            id: fac.facility_id,
            name: fac.name || 'Healthcare Facility',
            address: fac.address || fac.location || '',
            insurancePlan: 'Maxicare',
            lastVisit: 'No visits yet',
          });
        }
      });
      const facilitiesData = Array.from(facilitiesMap.values());

      // --- PROCESS SCHEDULES ---
      const schedulesData = appointments.map(apt => {
        let dateObj = new Date(apt.appointment_date);
        if (apt.appointment_time && typeof apt.appointment_date === 'string' && !apt.appointment_date.includes('T')) {
          const [y, m, d] = apt.appointment_date.split('-').map(Number);
          const [hh, mm] = apt.appointment_time.split(':').map(Number);
          dateObj = new Date(y, m - 1, d, hh || 0, mm || 0, 0);
        }

        const timeLabel = dateObj.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        return {
          id: apt.appointment_id,
          facilityId: apt.facility_id || apt.providers?.facilities?.facility_id || patientFacilityMap[apt.patient_id],
          month: dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
          date: dateObj.getDate().toString(),
          fullDate: dateObj.toLocaleDateString(),
          status:
            apt.status === 'CONFIRMED' || apt.status === 'PENDING'
              ? 'Scheduled'
              : apt.status === 'COMPLETED'
              ? 'Done'
              : apt.status === 'CANCELLED'
              ? 'Cancelled'
              : apt.status,
          rawStatus: apt.status,
          procedure: resolveProcedureLabel(apt),
          doctor: apt.providers?.name || 'Unknown Provider',
          room: apt.operatory ? `${apt.operatory} • ${timeLabel}` : timeLabel,
        };
      });

      // --- PROCESS ACTIVITIES (All Ledger Entries) ---
      const activitiesData = ledger.map(entry => {
        const rawDate = entry.date || entry.appointments?.appointment_date || entry.created_at;
        const dateObj = new Date(rawDate);
        const description = cleanChargeDescription(
          entry.procedures?.description ||
          entry.procedures?.name ||
          entry.description ||
          'Transaction'
        );
        const facilityId = entry.appointments?.providers?.facilities?.facility_id || patientFacilityMap[entry.patient_id];

        return {
          id: entry.ledger_id,
          facilityId,
          description,
          time: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          amount: parseFloat(entry.total_bill_amount) || 0,
          type: parseFloat(entry.total_bill_amount) < 0 ? 'payment' : 'charge',
          code: entry.code || entry.procedure_id || entry.appointments?.procedures?.procedure_id || '-',
        };
      });

      // --- PROCESS BALANCES & BILLING ITEMS (Aligned with HIS Ledger Logic) ---
      const chargeEntries = ledger.filter(
        entry => String(entry.type || '').toUpperCase() === 'CHARGE' || parseFloat(entry.total_bill_amount) > 0
      );
      const paymentEntries = ledger.filter(
        entry => String(entry.type || '').toUpperCase() === 'PAYMENT' || parseFloat(entry.total_bill_amount) < 0
      );

      const getPaymentsForCharge = charge => {
        return paymentEntries.filter(p => {
          if (p.description && p.description.includes(`[Charge #${charge.ledger_id}]`)) return true;
          if (
            charge.appointment_id &&
            p.appointment_id &&
            String(p.appointment_id) === String(charge.appointment_id) &&
            (!charge.procedure_id || !p.procedure_id || String(p.procedure_id) === String(charge.procedure_id))
          ) {
            return true;
          }
          if (
            !charge.appointment_id &&
            charge.procedure_id &&
            p.procedure_id &&
            String(p.procedure_id) === String(charge.procedure_id) &&
            String(p.patient_id) === String(charge.patient_id)
          ) {
            return true;
          }
          return false;
        });
      };

      const billingCharges = chargeEntries.map(entry => {
        const facilityId = entry.appointments?.providers?.facilities?.facility_id || patientFacilityMap[entry.patient_id];
        const grossAmount = Math.abs(parseFloat(entry.total_bill_amount) || 0);
        const appliedPayments = getPaymentsForCharge(entry);
        const paidSum = appliedPayments.reduce((s, p) => s + Math.abs(parseFloat(p.total_bill_amount) || 0), 0);
        const storedPaid = String(entry.payment_status || '').toUpperCase() === 'PAID';
        const remainingBalance = storedPaid ? 0 : Math.max(0, grossAmount - paidSum);
        const amountPaid = storedPaid ? grossAmount : Math.min(grossAmount, paidSum);
        const paymentStatus =
          remainingBalance <= 0.01
            ? 'PAID'
            : amountPaid > 0.01
            ? 'PARTIALLY_PAID'
            : String(entry.payment_status || 'UNPAID').toUpperCase();

        const procName = cleanChargeDescription(
          entry.procedures?.description ||
          entry.procedures?.name ||
          entry.appointments?.procedures?.description ||
          entry.appointments?.procedures?.name ||
          entry.description ||
          (entry.procedure_id ? `Procedure #${entry.procedure_id}` : 'Service Charge')
        );
        const providerName = entry.providers?.name || entry.appointments?.providers?.name || '';
        const facilityName = facilitiesMap.get(facilityId)?.name || 'Healthcare Facility';

        return {
          id: entry.ledger_id,
          patientId: entry.patient_id,
          facilityId,
          facilityName,
          appointmentId: entry.appointment_id || null,
          procedureId: entry.procedure_id || null,
          providerId: entry.provider_id || entry.appointments?.providers?.provider_id || null,
          providerName,
          procedure: procName,
          procedureName: procName,
          code: entry.code || entry.procedure_id || entry.appointments?.procedures?.procedure_id || '-',
          date: new Date(entry.date || entry.created_at).toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
          rawDate: entry.date || entry.created_at,
          amount: grossAmount,
          amountPaid,
          remainingBalance,
          balance: remainingBalance,
          paymentStatus,
          billToInsurance: isChargeBilledToInsurance(entry),
          payments: appliedPayments.map(p => ({
            id: p.ledger_id,
            date: new Date(p.date || p.created_at).toLocaleDateString('en-PH', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            }),
            method: p.payment_method || p.code || 'Payment',
            description: p.description || 'Payment',
            amount: Math.abs(parseFloat(p.total_bill_amount) || 0),
          })),
        };
      });

      const balancesData = billingCharges.filter(c => c.remainingBalance > 0.01);

      // Compute Balance Distribution (Total Balance, Insurance Portion, Patient Portion) per facility & overall
      // matching client/services/ledger.js getPaymentDistribution
      const distributionByFacility = {};
      const allFacilityIds = new Set([
        ...facilitiesData.map(f => f.id),
        ...billingCharges.map(c => c.facilityId).filter(Boolean),
      ]);

      const planByFacility = {};
      patientRows.forEach(p => {
        if (p.facility_id && p.insurance_plans) {
          planByFacility[p.facility_id] = p.insurance_plans;
        }
      });

      const computeDistribution = (facilityFilter = null) => {
        const facCharges = facilityFilter
          ? billingCharges.filter(c => c.facilityId === facilityFilter)
          : billingCharges;
        const facLedger = facilityFilter
          ? ledger.filter(
              e =>
                (e.appointments?.providers?.facilities?.facility_id || patientFacilityMap[e.patient_id]) ===
                facilityFilter
            )
          : ledger;

        const totalBal = Math.max(
          0,
          facLedger.reduce((sum, item) => sum + (parseFloat(item.total_bill_amount) || 0), 0)
        );
        if (totalBal <= 0) {
          return { totalBalance: 0, insurancePortion: 0, patientPortion: 0 };
        }

        let insuranceEligibleBalance = 0;
        let selfPayBalance = 0;

        facCharges.forEach(c => {
          if (c.billToInsurance) {
            insuranceEligibleBalance += c.remainingBalance;
          } else {
            selfPayBalance += c.remainingBalance;
          }
        });

        const plan =
          (facilityFilter && planByFacility[facilityFilter]) ||
          patientRows.find(p => p.insurance_plans)?.insurance_plans ||
          null;

        let insurancePortion = 0;
        let patientPortion = totalBal;

        if (plan && insuranceEligibleBalance > 0) {
          const maxLimit = parseFloat(plan.max_limit || 0);
          const deductible = parseFloat(plan.deductible || 0);

          if (insuranceEligibleBalance <= deductible) {
            insurancePortion = 0;
          } else {
            const afterDeductible = insuranceEligibleBalance - deductible;
            insurancePortion = maxLimit > 0 ? Math.min(afterDeductible, maxLimit) : afterDeductible;
          }

          insurancePortion = Math.min(insurancePortion, insuranceEligibleBalance, totalBal);
          const insurancePatientShare = Math.max(0, insuranceEligibleBalance - insurancePortion);
          patientPortion = selfPayBalance + insurancePatientShare;
        } else {
          insurancePortion = 0;
          patientPortion = totalBal;
        }

        return {
          totalBalance: totalBal,
          insurancePortion,
          patientPortion,
        };
      };

      allFacilityIds.forEach(fId => {
        distributionByFacility[fId] = computeDistribution(fId);
      });
      const overallDistribution = computeDistribution(null);
      const totalPendingBalance = overallDistribution.totalBalance;

      return {
        facilities: facilitiesData,
        schedules: schedulesData,
        activities: activitiesData,
        balances: balancesData,
        billingCharges,
        distributionByFacility,
        overallDistribution,
        totalPendingBalance,
      };
    } catch (error) {
      console.error('FacilitiesAPI Error:', error);
      return {
        facilities: [],
        schedules: [],
        activities: [],
        balances: [],
        billingCharges: [],
        distributionByFacility: {},
        overallDistribution: { totalBalance: 0, insurancePortion: 0, patientPortion: 0 },
        totalPendingBalance: 0,
      };
    }
  },

  /**
   * Posts a payment using the exact same ledger structure and charge status update logic
   * as the HIS web portal (`client/services/ledger.js` -> `addPayment` + `updateChargeStatus`).
   */
  async addPayment(paymentData) {
    try {
      const amountVal = Math.abs(parseFloat(paymentData.amount));
      if (!Number.isFinite(amountVal) || amountVal <= 0) {
        return { success: false, error: 'Please enter a valid payment amount.' };
      }

      const rawMethod = String(paymentData.method || 'cash').trim().toLowerCase();
      const methodCodeMap = {
        cash: 'cash',
        'pay at counter': 'cash',
        check: 'check',
        cc: 'cc',
        'credit/debit card': 'cc',
        'credit card': 'cc',
        gcash: 'gcash',
        maya: 'maya',
        'online banking': 'cc',
      };
      const methodLabels = {
        cash: 'Cash',
        check: 'Check',
        cc: 'Credit Card',
        gcash: 'GCash',
        maya: 'Maya',
      };
      const methodCode = methodCodeMap[rawMethod] || rawMethod;
      const methodText = methodLabels[methodCode] || paymentData.method || 'Cash';

      const chargeId = paymentData.chargeId || null;
      const desc = chargeId
        ? `Payment - ${methodText} [Charge #${chargeId}]`
        : `Payment - ${methodText}`;

      const nowIso = new Date().toISOString();
      const dateStr = paymentData.date || nowIso.split('T')[0];

      // 1. Try authenticated backend endpoint first so RLS never blocks ledger/claim status updates
      try {
        const token = await Session.getAccessToken();
        if (token) {
          const res = await fetch(`${API_URL}/api/patient-billing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              patientId: paymentData.patientId,
              chargeId,
              appointmentId: paymentData.appointmentId || null,
              procedureId: paymentData.procedureId || null,
              providerId: paymentData.providerId || null,
              date: dateStr,
              amount: amountVal,
              method: methodCode,
            }),
          });
          if (res.ok) {
            return { success: true };
          }
        }
      } catch (_) {}

      // 2. Direct Supabase insert matching HIS client/services/ledger.js
      const { error } = await supabase
        .from('ledger')
        .insert([
          {
            patient_id: paymentData.patientId,
            appointment_id: paymentData.appointmentId || null,
            provider_id: paymentData.providerId || null,
            procedure_id: paymentData.procedureId || null,
            created_at: nowIso,
            date: dateStr,
            type: 'PAYMENT',
            payment_method: methodCode,
            description: desc,
            total_bill_amount: -amountVal,
            payment_status: 'PAID',
          },
        ]);

      if (error) throw error;

      // 3. If the payment settles the target charge, mark the charge PAID in ledger & Paid in claims
      if (chargeId && Number(paymentData.remainingAfterPayment ?? 0) <= 0.01) {
        await supabase
          .from('ledger')
          .update({ payment_status: 'PAID' })
          .eq('ledger_id', chargeId);

        try {
          await supabase
            .from('claims')
            .update({ status: 'Paid' })
            .eq('ledger_id', chargeId)
            .neq('status', 'Denied');
        } catch (_) {}
      }

      return { success: true };
    } catch (error) {
      console.error('Add Payment Error:', error.message);
      return { success: false, error: error.message };
    }
  },
};

export default FacilitiesAPI;
