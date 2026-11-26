import { createClient } from '@supabase/supabase-js';
import { Session } from './session';

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL');
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');
const supabase = createClient(supabaseUrl, supabaseKey);


export const ledgerAPI = {
  // Get unique procedure codes from a patient's appointments (with descriptions)
  async getPatientProcedures(patientId) {
    try {
      // 1. Fetch master procedures to resolve canonical descriptions
      const { data: allProcedures } = await supabase
        .from('procedures')
        .select('*');

      const procMap = new Map();
      if (allProcedures) {
        allProcedures.forEach(p => {
          const desc = p.description || p.name || p.procedure_name || `Procedure #${p.procedure_id}`;
          procMap.set(String(p.procedure_id), desc);
        });
      }

      // 2. Fetch appointments for this patient
      const { data, error } = await supabase
        .from('appointments')
        .select('appointment_id, procedure_id, notes')
        .eq('patient_id', patientId);

      if (error) throw error;

      // Filter out duplicate procedure codes
      const uniqueCodes = [];
      const seen = new Set();
      
      (data || []).forEach(apt => {
        if (apt.procedure_id && !seen.has(String(apt.procedure_id))) {
          seen.add(String(apt.procedure_id));
          const desc = procMap.get(String(apt.procedure_id)) || apt.notes || `Procedure #${apt.procedure_id}`;
          uniqueCodes.push({
            code: String(apt.procedure_id),
            appointmentId: apt.appointment_id,
            description: desc
          });
        }
      });

      // If patient has no prior appointment procedures, allow picking from master procedures
      if (uniqueCodes.length === 0 && allProcedures) {
        allProcedures.forEach(p => {
          const desc = p.description || p.name || p.procedure_name || `Procedure #${p.procedure_id}`;
          uniqueCodes.push({
            code: String(p.procedure_id),
            appointmentId: null,
            description: desc
          });
        });
      }

      return uniqueCodes;
    } catch (error) {
      console.error("Get Patient Procedures Error:", error.message);
      return [];
    }
  },
  
  // Get unique providers from a patient's appointments
  async getPatientProviders(patientId) {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          provider_id,
          providers (
            provider_id,
            name
          )
        `)
        .eq('patient_id', patientId);

      if (error) throw error;

      // Filter out duplicate providers
      const uniqueProviders = [];
      const seen = new Set();
      
      data.forEach(apt => {
        if (apt.providers && !seen.has(apt.providers.provider_id)) {
          seen.add(apt.providers.provider_id);
          uniqueProviders.push({ id: apt.providers.provider_id, name: apt.providers.name });
        }
      });

      return uniqueProviders;
    } catch (error) {
      console.error("Get Patient Providers Error:", error.message);
      return [];
    }
  },

  // Get Transactions and Financial Summary
  async getPatientLedger(patientId) {
    try {
      // Updated Query: Fetch provider, procedure id, and reason via appointments
      const { data, error } = await supabase
        .from('ledger')
        .select(`
          *,
          providers ( name ),
          appointments ( 
            appointment_date,
            reason_for_visit,
            procedures ( procedure_id )
          )
        `)
        .eq('patient_id', patientId)
        .order('date', { ascending: false });

      if (error) throw error;

      // Fetch submitted claims for this patient so ledger charges reflect mobile & web claim statuses
      let latestClaimByLedger = new Map();
      try {
        const { data: claimsData } = await supabase
          .from('claims')
          .select('*')
          .eq('patient_id', patientId)
          .order('submission_date', { ascending: false });

        (claimsData || []).forEach(c => {
          const key = String(c.ledger_id);
          if (!latestClaimByLedger.has(key)) {
            latestClaimByLedger.set(key, c);
          }
        });
      } catch (_) {}

      const activeStatuses = new Set(['SUBMITTED', 'PENDING', 'IN_REVIEW', 'IN REVIEW', 'PROCESSING', 'APPROVED', 'PAID']);

      const transactions = data.map(t => {
        const claim = latestClaimByLedger.get(String(t.ledger_id)) || null;
        const claimStatus = claim?.status || null;
        const hasSubmittedClaim = claimStatus ? activeStatuses.has(String(claimStatus).trim().toUpperCase()) : false;

        return {
          id: t.ledger_id, 
          date: (t.date || t.appointments?.appointment_date) 
            ? new Date(t.date || t.appointments?.appointment_date).toLocaleDateString() 
            : '-',
          created: new Date(t.created_at).toLocaleDateString(),
          // Ensure it falls back to the direct procedure_id if code is empty
          code: t.code || t.procedure_id || t.appointments?.procedures?.procedure_id || '-',
          description: t.description || t.appointments?.reason_for_visit || 'Visit Charge',
          providerId: t.provider_id || t.appointments?.providers?.provider_id || null,
          // Fetch name from the direct provider relation first
          provider: t.providers?.name || t.appointments?.providers?.name || '-',
          appointmentDate: t.appointments?.appointment_date || null,
          amount: parseFloat(t.total_bill_amount),
          type: t.type,
          appointmentId: t.appointment_id,
          procedureId: t.procedure_id,
          paymentStatus: t.payment_status,
          claimId: claim?.claim_id ?? claim?.id ?? null,
          claimStatus,
          claimSubmissionDate: claim?.submission_date || null,
          hasSubmittedClaim
        };
      });

      // Calculate Financials
      const totalBalance = transactions.reduce((sum, t) => sum + t.amount, 0);
      
      // Simple aging calculation (based on Charges only usually, but simplified here)
      const today = new Date();
      const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 };
      
      transactions.filter(t => t.amount > 0).forEach(t => {
        const transDate = new Date(t.date);
        const diffTime = Math.abs(today - transDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) aging['0-30'] += t.amount;
        else if (diffDays <= 60) aging['31-60'] += t.amount;
        else if (diffDays <= 90) aging['61-90'] += t.amount;
        else aging['91+'] += t.amount;
      });

      return {
        transactions,
        financial: {
          aging,
          balance: {
            total: totalBalance,
            insurance: totalBalance * 0.8, // Mock split
            adjust: 0,
            patient: totalBalance * 0.2  // Mock split
          }
        }
      };

    } catch (error) {
      console.error("Get Ledger Error:", error.message);
      return { transactions: [], financial: { aging: {}, balance: {} } };
    }
  },

  // Add Payment
  async addPayment(patientId, paymentData) {
    try {
      const isInsurancePayment = paymentData.method === 'ins_check' || paymentData.method === 'ins_eft';

      // Guard: Insurance payments require a submitted claim on the target charge
      if (isInsurancePayment) {
        if (!paymentData.chargeId) {
          return {
            success: false,
            error: 'Insurance payments must be allocated to a specific charge that has a submitted claim.'
          };
        }

        const { data: claimRows, error: claimErr } = await supabase
          .from('claims')
          .select('*')
          .eq('patient_id', patientId)
          .eq('ledger_id', paymentData.chargeId)
          .order('submission_date', { ascending: false });

        if (claimErr) throw claimErr;

        const activeStatuses = new Set(['SUBMITTED', 'PENDING', 'IN_REVIEW', 'IN REVIEW', 'PROCESSING', 'APPROVED', 'PAID']);
        const activeClaim = (claimRows || []).find(
          c => c.status && activeStatuses.has(String(c.status).trim().toUpperCase())
        );

        if (!activeClaim) {
          return {
            success: false,
            error: `Insurance payment cannot proceed: The claim for Charge #${paymentData.chargeId} has not been submitted yet. Please send the claim first.`
          };
        }
      }

      const methodLabels = {
        'cash': 'Cash',
        'check': 'Check',
        'cc': 'Credit Card',
        'ins_check': 'Insurance Check',
        'ins_eft': 'Insurance EFT'
      };
      const methodText = methodLabels[paymentData.method] || paymentData.method;
      const desc = paymentData.chargeId
        ? `Payment - ${methodText} [Charge #${paymentData.chargeId}]`
        : `Payment - ${methodText}`;

      const { error } = await supabase
        .from('ledger')
        .insert([{
          patient_id: patientId,
          appointment_id: paymentData.appointmentId || null,
          provider_id: paymentData.provider_id || null,
          procedure_id: paymentData.procedureId || null,
          created_at: new Date().toISOString(),
          date: paymentData.date,
          type: 'PAYMENT',
          payment_method: paymentData.method,
          description: desc,
          total_bill_amount: -Math.abs(parseFloat(paymentData.amount)),
          payment_status: 'PAID'
        }]);

      if (error) throw error;

      // Sync claim status to 'Approved' when an insurance payment is posted against it
      if (isInsurancePayment && paymentData.chargeId) {
        try {
          await supabase
            .from('claims')
            .update({ status: 'Approved' })
            .eq('patient_id', patientId)
            .eq('ledger_id', paymentData.chargeId);
        } catch (_) {}
      }

      return { success: true };
    } catch (error) {
      console.error("Add Payment Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Update a charge's payment_status (and sync claim status to 'Paid' when settled)
  async updateChargeStatus(ledgerId, status) {
    try {
      const { error } = await supabase
        .from('ledger')
        .update({ payment_status: status })
        .eq('ledger_id', ledgerId);

      if (error) throw error;

      if (String(status).toUpperCase() === 'PAID') {
        try {
          await supabase
            .from('claims')
            .update({ status: 'Paid' })
            .eq('ledger_id', ledgerId)
            .neq('status', 'Denied');
        } catch (_) {}
      }

      return { success: true };
    } catch (error) {
      console.error("Update Charge Status Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Get Payment Distribution
  async getPaymentDistribution(patientId) {
    try {
      // 1. Get sum of all charges (where type is not PMT/PAYMENT)
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger')
        .select('total_bill_amount, type')
        .eq('patient_id', patientId);
        
      if (ledgerError) throw ledgerError;

      const totalBalance = ledgerData.reduce((sum, item) => sum + parseFloat(item.total_bill_amount || 0), 0);

      // 2. Fetch the patient's insurance plan details
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select(`
          insurance_id,
          insurance_plans (
            max_limit,
            deductible,
            copay_amount
          )
        `)
        .eq('patient_id', patientId)
        .single();

      if (patientError && patientError.code !== 'PGRST116') throw patientError;

      let insurancePortion = 0;
      let patientPortion = totalBalance;

      // 3. Apply the distribution logic
      const plan = patientData?.insurance_plans;
      if (plan && totalBalance > 0) {
        const maxLimit = parseFloat(plan.max_limit || 0);
        const deductible = parseFloat(plan.deductible || 0);
        const copay = parseFloat(plan.copay_amount || 0);

        if (totalBalance <= deductible) {
          insurancePortion = 0;
        } else if (totalBalance > deductible) {
          insurancePortion = totalBalance - deductible;
          patientPortion = deductible;
        }
        else if (totalBalance > maxLimit) {
          insurancePortion = maxLimit;
          patientPortion = totalBalance - insurancePortion;
        }
        
        // Prevent negative patient portion if insurance portion exceeds balance
        patientPortion = Math.max(0, totalBalance - insurancePortion);
      }

      return {
        totalBalance,
        insurancePortion,
        patientPortion
      };
    } catch (error) {
      console.error("Get Payment Distribution Error:", error.message);
      return { totalBalance: 0, insurancePortion: 0, patientPortion: 0 };
    }
  },
  // Get specific procedure fee based on provider's fee schedule (fee_schedule_items.current_fee)
  async getProcedureFee(providerId, procedureCode) {
    if (!providerId || !procedureCode) {
      return { amount: null, scheduleName: null, source: 'none' };
    }

    try {
      const normalizedProcId = !isNaN(Number(procedureCode))
        ? Number(procedureCode)
        : procedureCode;

      // Helper to fetch current_fee from fee_schedule_items for a given schedule_id
      const fetchFeeForSchedule = async (scheduleId) => {
        if (scheduleId == null) return null;
        const { data: items, error: feeError } = await supabase
          .from('fee_schedule_items')
          .select('*')
          .eq('schedule_id', scheduleId)
          .eq('procedure_id', normalizedProcId)
          .limit(1);

        if (feeError) throw feeError;
        const item = Array.isArray(items) ? items[0] : null;
        if (!item) return null;

        const rawFee = item.current_fee ?? item.custom_price ?? null;
        return rawFee != null && rawFee !== '' && Number.isFinite(Number(rawFee))
          ? Number(rawFee)
          : null;
      };

      // 1. Get the provider's assigned fee schedule and facility
      const { data: provider, error: providerError } = await supabase
        .from('providers')
        .select('*')
        .eq('provider_id', providerId)
        .maybeSingle();

      if (providerError) throw providerError;

      const providerScheduleId = provider?.schedule_id ?? provider?.fee_schedule_id ?? null;

      // 2. Check the provider's assigned fee schedule first
      if (providerScheduleId != null) {
        const fee = await fetchFeeForSchedule(providerScheduleId);
        if (fee !== null) {
          let scheduleName = null;
          try {
            const { data: sched } = await supabase
              .from('fee_schedules')
              .select('schedule_name')
              .eq('schedule_id', providerScheduleId)
              .maybeSingle();
            scheduleName = sched?.schedule_name || null;
          } catch {}
          return { amount: fee, scheduleName, source: 'provider_schedule' };
        }
      }

      // 3. Fallback: check the facility's active Standard fee schedule
      const facilityId = provider?.facility_id || Session.getFacilityId();
      if (facilityId) {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        const { data: schedules, error: schedErr } = await supabase
          .from('fee_schedules')
          .select('schedule_id, schedule_name, insurance_id, effective_from, effective_to')
          .eq('facility_id', facilityId)
          .order('effective_from', { ascending: false });

        if (!schedErr && Array.isArray(schedules) && schedules.length > 0) {
          const activeStandard = schedules.find(
            s => !s.insurance_id &&
              (!s.effective_from || s.effective_from <= today) &&
              (!s.effective_to || today < s.effective_to)
          );
          const candidateSchedules = [
            ...(activeStandard ? [activeStandard] : []),
            ...schedules.filter(s => s.schedule_id !== activeStandard?.schedule_id && s.schedule_id !== providerScheduleId)
          ];

          for (const sched of candidateSchedules) {
            const fee = await fetchFeeForSchedule(sched.schedule_id);
            if (fee !== null) {
              return {
                amount: fee,
                scheduleName: sched.schedule_name || null,
                source: 'standard_schedule'
              };
            }
          }
        }
      }

      return { amount: null, scheduleName: null, source: 'none' };
    } catch (error) {
      console.error("Get Procedure Fee Error:", error.message);
      return { amount: null, scheduleName: null, source: 'none' };
    }
  },
  // Add Charge (Procedure)
  async addCharge(patientId, chargeData) {
    try {
      const { error } = await supabase
        .from('ledger')
        .insert([{
          patient_id: patientId,
          appointment_id: chargeData.appointmentId || null, // Link to appointment if provided
          date: chargeData.date,
          created_at: new Date().toISOString(),
          type: 'CHARGE',
          procedure_id: chargeData.code,
          description: chargeData.description,
          provider_id: chargeData.provider,
          total_bill_amount: Math.abs(parseFloat(chargeData.amount)), // Store as positive
          payment_status: 'UNPAID' // Logical default for new charge
        }]);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Add Charge Error:", error.message);
      return { success: false, error: error.message };
    }
  }
};
