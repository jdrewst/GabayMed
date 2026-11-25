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

export const claimsAPI = {
  // Fetch transactions (charges) from the ledger for a specific patient, joined with their current claim status
  async getEligibleClaims(patientId) {
    try {
      const [{ data: charges, error: chargeError }, { data: claimsData }] = await Promise.all([
        supabase
          .from('ledger')
          .select(`
            ledger_id,
            total_bill_amount,
            created_at,
            date,
            description,
            procedure_id,
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
          .eq('type', 'CHARGE')
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

      return (charges || []).map(record => {
        const claim = latestClaimByLedger.get(String(record.ledger_id)) || null;
        const claimStatus = claim?.status || null;
        return {
          ...record,
          claim_id: claim?.claim_id ?? claim?.id ?? null,
          claimStatus,
          claimSubmissionDate: claim?.submission_date || null,
          hasActiveClaim: isClaimActiveStatus(claimStatus)
        };
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
      return (data || []).map(c => ({
        id: c.claim_id ?? c.id,
        ledgerId: c.ledger_id,
        patientId: c.patient_id,
        insuranceId: c.insurance_id,
        status: c.status || 'Submitted',
        submissionDate: c.submission_date,
        serviceDate: c.ledger?.date || null,
        amount: parseFloat(c.ledger?.total_bill_amount || 0),
        procedureName: c.ledger?.procedures?.description || c.ledger?.description || (c.ledger?.procedure_id ? `Procedure #${c.ledger.procedure_id}` : 'Healthcare Charge'),
        procedureCode: c.ledger?.procedures?.procedure_id || c.ledger?.procedure_id || '-',
        providerName: c.ledger?.providers?.name || '-',
        carrierName: c.insurance_plans?.carrier?.name || 'Insurance Carrier',
        planName: c.insurance_plans?.plan_name || (c.insurance_id ? `Plan #${c.insurance_id}` : '-')
      }));
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

      // 2. Resolve insurance_id from patient record if not provided
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
