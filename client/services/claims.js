import { createClient } from '@supabase/supabase-js';

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

const ACTIVE_CLAIM_STATUSES = new Set([
  'SUBMITTED',
  'PENDING',
  'IN_REVIEW',
  'IN REVIEW',
  'PROCESSING',
  'APPROVED',
  'PAID'
]);

export function isClaimActiveStatus(status) {
  if (!status) return false;
  return ACTIVE_CLAIM_STATUSES.has(String(status).trim().toUpperCase());
}

function cleanChargeDescription(raw) {
  return String(raw || '')
    .replace(/\s*\[(?:Bill to Insurance|Self-Pay)\]\s*$/i, '')
    .trim();
}

function isChargeEligibleForInsuranceClaim(record) {
  // 1. Must be a positive CHARGE transaction
  if (String(record.type || '').toUpperCase() === 'PAYMENT') return false;
  if (parseFloat(record.total_bill_amount || 0) <= 0) return false;

  // 2. If already fully PAID by a non-insurance payment (no claim exists), exclude from Send Claims
  if (String(record.payment_status || '').toUpperCase() === 'PAID' && !record.hasExistingClaim) {
    return false;
  }

  // 3. Respect explicit "Bill to Insurance" toggle when adding a procedure charge
  if (typeof record.bill_to_insurance === 'boolean') {
    return record.bill_to_insurance;
  }
  const desc = String(record.description || '');
  if (/\[Self-Pay\]/i.test(desc)) return false;
  if (/\[Bill to Insurance\]/i.test(desc)) return true;

  // Legacy charges without explicit tag default to eligible unless marked Self-Pay
  return true;
}

export const claimsAPI = {
  // Fetch transactions (charges) from the ledger for a specific patient that are marked "Bill to Insurance"
  async getEligibleClaims(patientId) {
    try {
      const [{ data: allLedger, error: chargeError }, { data: claimsData }] = await Promise.all([
        supabase
          .from('ledger')
          .select(`
            *,
            procedures ( procedure_id, description ),
            providers ( name ),
            patients (
              patient_id,
              full_name,
              insurance_id,
              insurance_plans (
                plan_name,
                carrier ( carrier_id, name )
              )
            )
          `)
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('claims')
          .select('*')
          .eq('patient_id', patientId)
          .order('submission_date', { ascending: false })
      ]);

      if (chargeError) throw chargeError;

      const latestClaimByLedger = new Map();
      (claimsData || []).forEach(c => {
        const key = String(c.ledger_id);
        if (!latestClaimByLedger.has(key)) {
          latestClaimByLedger.set(key, c);
        }
      });

      // Track non-insurance payments applied to specific charges
      const nonInsPaidChargeIds = new Set();
      (allLedger || []).forEach(row => {
        const isPayment = String(row.type || '').toUpperCase() === 'PAYMENT' || parseFloat(row.total_bill_amount || 0) < 0;
        if (!isPayment) return;
        const method = String(row.payment_method || '').toLowerCase();
        const isInsMethod = method === 'ins_check' || method === 'ins_eft' || /Insurance (?:Check|EFT)/i.test(row.description || '');
        if (!isInsMethod) {
          const match = String(row.description || '').match(/\[Charge #(\d+)\]/i);
          if (match?.[1]) {
            nonInsPaidChargeIds.add(String(match[1]));
          }
        }
      });

      const charges = (allLedger || []).filter(r => String(r.type || '').toUpperCase() === 'CHARGE');

      return charges
        .map(record => {
          const claim = latestClaimByLedger.get(String(record.ledger_id)) || null;
          const claimStatus = claim?.status || null;
          return {
            ...record,
            description: cleanChargeDescription(record.description),
            rawDescription: record.description,
            hasExistingClaim: Boolean(claim),
            paidByNonInsurance: nonInsPaidChargeIds.has(String(record.ledger_id)) && String(record.payment_status || '').toUpperCase() === 'PAID',
            claim_id: claim?.claim_id ?? claim?.id ?? null,
            claimStatus,
            claimSubmissionDate: claim?.submission_date || null,
            hasActiveClaim: isClaimActiveStatus(claimStatus)
          };
        })
        .filter(record => {
          // Exclude charges paid via non-insurance payment or not marked "Bill to Insurance"
          if (record.paidByNonInsurance && !record.hasExistingClaim) return false;
          return isChargeEligibleForInsuranceClaim({
            ...record,
            description: record.rawDescription
          });
        });
    } catch (error) {
      console.error("Get Eligible Claims Error:", error.message);
      return [];
    }
  },

  // Fetch all submitted claims for a specific patient (includes claims submitted from mobile app or clinic web)
  async getPatientClaims(patientId) {
    if (!patientId) return [];
    try {
      const { data, error } = await supabase
        .from('claims')
        .select(`
          *,
          ledger (
            ledger_id,
            total_bill_amount,
            date,
            description,
            procedure_id,
            procedures ( procedure_id, description ),
            providers ( name )
          ),
          insurance_plans (
            insurance_id,
            plan_name,
            carrier ( carrier_id, name )
          )
        `)
        .eq('patient_id', patientId)
        .order('submission_date', { ascending: false });

      if (error) throw error;
      return (data || []).map(c => {
        const procDesc = cleanChargeDescription(
          c.ledger?.procedures?.description ||
          c.ledger?.description ||
          (c.ledger?.procedure_id ? `Procedure #${c.ledger.procedure_id}` : 'Healthcare Charge')
        );
        const procCode = c.ledger?.procedures?.procedure_id || c.ledger?.procedure_id || '';
        const provName = c.ledger?.providers?.name || '-';
        return {
          id: c.claim_id ?? c.id,
          ledgerId: c.ledger_id,
          patientId: c.patient_id,
          insuranceId: c.insurance_id,
          status: c.status || 'Submitted',
          submissionDate: c.submission_date,
          serviceDate: c.ledger?.date || null,
          amount: parseFloat(c.ledger?.total_bill_amount || 0),
          procedure: procDesc,
          procedureName: procDesc,
          procedureCode: procCode,
          provider: provName,
          providerName: provName,
          carrierName: c.insurance_plans?.carrier?.name || 'Insurance Carrier',
          planName: c.insurance_plans?.plan_name || (c.insurance_id ? `Plan #${c.insurance_id}` : '-')
        };
      });
    } catch (error) {
      console.error("Get Patient Claims Error:", error.message);
      return [];
    }
  },

  // Submit the selected claim to the claims table (prevents duplicates if already sent via mobile or web)
  async submitClaim(claimData) {
    try {
      if (!claimData?.ledger_id || !claimData?.patient_id) {
        return { success: false, error: 'Charge and patient information are required.' };
      }

      // 1. Check if an active claim already exists for this ledger charge
      const { data: existing, error: existErr } = await supabase
        .from('claims')
        .select('*')
        .eq('ledger_id', claimData.ledger_id);

      if (existErr) throw existErr;
      if ((existing || []).some(c => isClaimActiveStatus(c.status))) {
        return { success: false, error: 'A claim has already been submitted for this charge.' };
      }

      // 2. Resolve insurance_id from patient record or patient_insurance if not provided
      let insuranceId = claimData.insurance_id ?? null;
      if (!insuranceId) {
        const { data: pat } = await supabase
          .from('patients')
          .select('insurance_id')
          .eq('patient_id', claimData.patient_id)
          .maybeSingle();
        insuranceId = pat?.insurance_id ?? null;
      }
      if (!insuranceId) {
        const { data: pi } = await supabase
          .from('patient_insurance')
          .select('insurance_id')
          .eq('patient_id', claimData.patient_id)
          .limit(1)
          .maybeSingle();
        insuranceId = pi?.insurance_id ?? null;
      }

      if (!insuranceId) {
        return { success: false, error: 'This patient does not have an active insurance plan linked. Add an insurance plan before sending a claim.' };
      }

      const { error } = await supabase
        .from('claims')
        .insert([{
          ledger_id: claimData.ledger_id,
          patient_id: claimData.patient_id,
          insurance_id: insuranceId,
          submission_date: new Date().toISOString(),
          status: 'Submitted'
        }]);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Submit Claim Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Submit multiple selected claims in one batch
  async submitClaims(claimsList = []) {
    if (!Array.isArray(claimsList) || claimsList.length === 0) {
      return { success: false, error: 'Please select at least one procedure transaction to send.' };
    }

    let submittedCount = 0;
    let lastError = '';

    for (const item of claimsList) {
      const res = await this.submitClaim(item);
      if (res.success) {
        submittedCount += 1;
      } else if (!lastError && res.error) {
        lastError = res.error;
      }
    }

    if (submittedCount === 0) {
      return { success: false, error: lastError || 'Failed to submit selected claims.' };
    }

    return {
      success: true,
      submittedCount,
      warning: lastError ? `Submitted ${submittedCount} claim(s). Some could not be sent: ${lastError}` : ''
    };
  },

  // Update claim status from clinic web (syncs directly with patient's mobile app Digital Claims dashboard)
  async updateClaimStatus(claimId, status) {
    try {
      const { error } = await supabase
        .from('claims')
        .update({ status })
        .eq('claim_id', claimId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Update Claim Status Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  async getAllClaims() {
    const { data } = await supabase
      .from('claims')
      .select(`
        *,
        patients ( full_name ),
        ledger ( total_bill_amount, date ),
        insurance_plans ( carrier ( name ) )
      `)
      .order('submission_date', { ascending: false });
    return data || [];
  }
};
