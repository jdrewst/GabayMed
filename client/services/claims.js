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

export const claimsAPI = {
  // Fetch transactions (charges) from the ledger for a specific patient
  async getEligibleClaims(patientId) {
    try {
      const { data, error } = await supabase
        .from('ledger')
        .select(`
          ledger_id,
          total_bill_amount,
          created_at,
          date,
          procedures ( procedure_id, description ),
          providers ( name ),
          patients (
            patient_id,
            full_name,
            insurance_id,
            insurance_plans (
              carrier ( carrier_id, name )
            )
          )
        `)
        .eq('patient_id', patientId)
        .eq('type', 'CHARGE') // Fetching charges only, not payments
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Get Eligible Claims Error:", error.message);
      return [];
    }
  },

  // Submit the selected claim to the claims table
  async submitClaim(claimData) {
    try {
      const { error } = await supabase
        .from('claims')
        .insert([{
          ledger_id: claimData.ledger_id,
          patient_id: claimData.patient_id,
          insurance_id: claimData.insurance_id,
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

  async getAllClaims() {
    const { data, error } = await supabase
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