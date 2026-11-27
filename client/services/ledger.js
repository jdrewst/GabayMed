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

      // If user has no appointments or we also want all facility providers available for editing/adding
      if (uniqueProviders.length === 0) {
        const facilityId = Session.getFacilityId();
        let query = supabase.from('providers').select('provider_id, name').order('name');
        if (facilityId) query = query.eq('facility_id', facilityId);
        const { data: facProvs } = await query;
        (facProvs || []).forEach(p => {
          if (!seen.has(p.provider_id)) {
            seen.add(p.provider_id);
            uniqueProviders.push({ id: p.provider_id, name: p.name });
          }
        });
      }

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

      const cleanChargeDesc = (raw) =>
        String(raw || '')
          .replace(/\s*\[(?:Bill to Insurance|Self-Pay)\]\s*$/i, '')
          .trim();

      const isChargeBilledToInsurance = (t) => {
        if (typeof t.bill_to_insurance === 'boolean') return t.bill_to_insurance;
        const raw = String(t.description || '');
        if (/\[Self-Pay\]/i.test(raw)) return false;
        if (/\[Bill to Insurance\]/i.test(raw)) return true;
        return true;
      };

      const transactions = data.map(t => {
        const claim = latestClaimByLedger.get(String(t.ledger_id)) || null;
        const claimStatus = claim?.status || null;
        const hasSubmittedClaim = claimStatus ? activeStatuses.has(String(claimStatus).trim().toUpperCase()) : false;
        const billToInsurance = t.type === 'CHARGE' ? isChargeBilledToInsurance(t) : false;
        const rawDateSource = t.date || t.appointments?.appointment_date || t.created_at || '';

        return {
          id: t.ledger_id, 
          rawDate: rawDateSource ? String(rawDateSource).slice(0, 10) : '',
          date: (t.date || t.appointments?.appointment_date) 
            ? new Date(t.date || t.appointments?.appointment_date).toLocaleDateString() 
            : '-',
          created: new Date(t.created_at).toLocaleDateString(),
          // Ensure it falls back to the direct procedure_id if code is empty
          code: t.code || t.procedure_id || t.appointments?.procedures?.procedure_id || '-',
          description: cleanChargeDesc(t.description) || t.appointments?.reason_for_visit || 'Visit Charge',
          providerId: t.provider_id || t.appointments?.providers?.provider_id || null,
          // Fetch name from the direct provider relation first
          provider: t.providers?.name || t.appointments?.providers?.name || '-',
          appointmentDate: t.appointments?.appointment_date || null,
          amount: parseFloat(t.total_bill_amount),
          type: t.type,
          appointmentId: t.appointment_id,
          procedureId: t.procedure_id,
          paymentStatus: t.payment_status,
          billToInsurance,
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
      // 1. Get all ledger transactions for this patient
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger')
        .select('*')
        .eq('patient_id', patientId);
        
      if (ledgerError) throw ledgerError;

      const rows = ledgerData || [];
      const totalBalance = rows.reduce((sum, item) => sum + parseFloat(item.total_bill_amount || 0), 0);

      if (totalBalance <= 0) {
        return { totalBalance: Math.max(0, totalBalance), insurancePortion: 0, patientPortion: 0 };
      }

      // Helper to determine if a charge is Bill to Insurance vs Self-Pay
      const isBilledToInsurance = (t) => {
        if (typeof t.bill_to_insurance === 'boolean') return t.bill_to_insurance;
        const raw = String(t.description || '');
        if (/\[Self-Pay\]/i.test(raw)) return false;
        if (/\[Bill to Insurance\]/i.test(raw)) return true;
        return true;
      };

      const charges = rows.filter(t => String(t.type || '').toUpperCase() === 'CHARGE' || parseFloat(t.total_bill_amount || 0) > 0);
      const payments = rows.filter(t => String(t.type || '').toUpperCase() === 'PAYMENT' || parseFloat(t.total_bill_amount || 0) < 0);

      // Calculate remaining unpaid balance per charge, separating Insurance-billed vs Self-Pay charges
      let insuranceEligibleBalance = 0;
      let selfPayBalance = 0;
      let allocatedPaymentsTotal = 0;

      for (const charge of charges) {
        const chargeAmt = Math.abs(parseFloat(charge.total_bill_amount || 0));
        const paidOnCharge = payments
          .filter(p => {
            if (p.description && p.description.includes(`[Charge #${charge.ledger_id}]`)) return true;
            if (charge.appointment_id && p.appointment_id && String(p.appointment_id) === String(charge.appointment_id) &&
                (!charge.procedure_id || !p.procedure_id || String(p.procedure_id) === String(charge.procedure_id))) return true;
            if (!charge.appointment_id && charge.procedure_id && p.procedure_id && String(p.procedure_id) === String(charge.procedure_id)) return true;
            return false;
          })
          .reduce((sum, p) => sum + Math.abs(parseFloat(p.total_bill_amount || 0)), 0);

        allocatedPaymentsTotal += Math.min(chargeAmt, paidOnCharge);
        const remaining = Math.max(0, chargeAmt - paidOnCharge);

        if (isBilledToInsurance(charge)) {
          insuranceEligibleBalance += remaining;
        } else {
          // Not "Bill to Insurance" -> goes directly to Patient Portion
          selfPayBalance += remaining;
        }
      }

      // Deduct any unallocated general payments from selfPayBalance first, then insuranceEligibleBalance
      const totalPayments = payments.reduce((sum, p) => sum + Math.abs(parseFloat(p.total_bill_amount || 0)), 0);
      let unallocatedPayment = Math.max(0, totalPayments - allocatedPaymentsTotal);
      if (unallocatedPayment > 0) {
        const deductSelf = Math.min(selfPayBalance, unallocatedPayment);
        selfPayBalance -= deductSelf;
        unallocatedPayment -= deductSelf;
        insuranceEligibleBalance = Math.max(0, insuranceEligibleBalance - unallocatedPayment);
      }

      // 2. Fetch the patient's insurance plan details
      let plan = null;
      const { data: patientData } = await supabase
        .from('patients')
        .select('insurance_id')
        .eq('patient_id', patientId)
        .maybeSingle();

      let activeInsuranceId = patientData?.insurance_id || null;
      if (!activeInsuranceId) {
        const { data: piRow } = await supabase
          .from('patient_insurance')
          .select('insurance_id')
          .eq('patient_id', patientId)
          .limit(1)
          .maybeSingle();
        activeInsuranceId = piRow?.insurance_id || null;
      }

      if (activeInsuranceId) {
        const { data: planRow } = await supabase
          .from('insurance_plans')
          .select('max_limit, deductible, copay_amount, copay_type')
          .eq('insurance_id', activeInsuranceId)
          .maybeSingle();
        plan = planRow || null;
      }

      let insurancePortion = 0;
      let patientPortion = totalBalance;

      // 3. Apply the distribution logic ONLY to insurance-billed charges; self-pay charges always go to patientPortion
      if (plan && insuranceEligibleBalance > 0) {
        const maxLimit = parseFloat(plan.max_limit || 0);
        const deductible = parseFloat(plan.deductible || 0);

        if (insuranceEligibleBalance <= deductible) {
          insurancePortion = 0;
        } else {
          const afterDeductible = insuranceEligibleBalance - deductible;
          insurancePortion = maxLimit > 0 ? Math.min(afterDeductible, maxLimit) : afterDeductible;
        }

        // Prevent insurance portion from exceeding eligible balance or total balance
        insurancePortion = Math.min(insurancePortion, insuranceEligibleBalance, totalBalance);
        const insurancePatientShare = Math.max(0, insuranceEligibleBalance - insurancePortion);
        patientPortion = selfPayBalance + insurancePatientShare;
      } else {
        insurancePortion = 0;
        patientPortion = totalBalance;
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
      const billToIns = Boolean(chargeData.billToInsurance);
      const baseDesc = (chargeData.description || '').replace(/\s*\[(?:Bill to Insurance|Self-Pay)\]\s*$/i, '').trim();
      const taggedDesc = billToIns
        ? `${baseDesc} [Bill to Insurance]`.trim()
        : `${baseDesc} [Self-Pay]`.trim();

      const basePayload = {
        patient_id: patientId,
        appointment_id: chargeData.appointmentId || null, // Link to appointment if provided
        date: chargeData.date,
        created_at: new Date().toISOString(),
        type: 'CHARGE',
        procedure_id: chargeData.code,
        description: taggedDesc,
        provider_id: chargeData.provider,
        total_bill_amount: Math.abs(parseFloat(chargeData.amount)), // Store as positive
        payment_status: 'UNPAID' // Logical default for new charge
      };

      // Try inserting with bill_to_insurance column if present, fallback to basePayload
      let { error } = await supabase
        .from('ledger')
        .insert([{ ...basePayload, bill_to_insurance: billToIns }]);

      if (error && (error.code === 'PGRST204' || /bill_to_insurance/i.test(error.message || ''))) {
        const retry = await supabase.from('ledger').insert([basePayload]);
        error = retry.error;
      }

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Add Charge Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Update an existing Ledger Transaction (Charge or Payment)
  async updateTransaction(ledgerId, updateData) {
    try {
      if (!ledgerId) throw new Error('Ledger ID is required.');
      const isPayment = updateData.type === 'PAYMENT' || Number(updateData.originalAmount) < 0;
      const numericAmount = Math.abs(parseFloat(updateData.amount || 0));

      let taggedDesc = (updateData.description || '').replace(/\s*\[(?:Bill to Insurance|Self-Pay)\]\s*$/i, '').trim();
      if (!isPayment) {
        const billToIns = Boolean(updateData.billToInsurance);
        taggedDesc = billToIns
          ? `${taggedDesc} [Bill to Insurance]`.trim()
          : `${taggedDesc} [Self-Pay]`.trim();
      }

      const procId = updateData.code && updateData.code !== '-' && updateData.code !== 'PMT'
        ? (/^\d+$/.test(String(updateData.code)) ? parseInt(updateData.code, 10) : updateData.code)
        : null;

      const provId = updateData.provider && updateData.provider !== '-'
        ? (/^\d+$/.test(String(updateData.provider)) ? parseInt(updateData.provider, 10) : updateData.provider)
        : null;

      const basePayload = {
        date: updateData.date,
        procedure_id: procId,
        description: taggedDesc,
        provider_id: provId,
        total_bill_amount: isPayment ? -numericAmount : numericAmount
      };

      let { error } = !isPayment
        ? await supabase
            .from('ledger')
            .update({ ...basePayload, bill_to_insurance: Boolean(updateData.billToInsurance) })
            .eq('ledger_id', ledgerId)
        : await supabase
            .from('ledger')
            .update(basePayload)
            .eq('ledger_id', ledgerId);

      if (error && (error.code === 'PGRST204' || /bill_to_insurance/i.test(error.message || ''))) {
        const retry = await supabase
          .from('ledger')
          .update(basePayload)
          .eq('ledger_id', ledgerId);
        error = retry.error;
      }

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Update Transaction Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Delete a Ledger Transaction (and any associated claim rows for that ledger_id)
  async deleteTransaction(ledgerId) {
    try {
      if (!ledgerId) throw new Error('Ledger ID is required.');

      // Remove linked claims first so FK constraints don't block deleting the charge
      try {
        await supabase.from('claims').delete().eq('ledger_id', ledgerId);
      } catch (_) {}

      const { error } = await supabase
        .from('ledger')
        .delete()
        .eq('ledger_id', ledgerId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Delete Transaction Error:", error.message);
      return { success: false, error: error.message };
    }
  }
};
