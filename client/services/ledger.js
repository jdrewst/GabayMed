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
  // Get unique procedure codes from a patient's appointments
  async getPatientProcedures(patientId) {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('appointment_id, procedure_id')
        .eq('patient_id', patientId);

      if (error) throw error;

      // Filter out duplicate procedure codes
      const uniqueCodes = [];
      const seen = new Set();
      
      data.forEach(apt => {
        if (apt.procedure_id && !seen.has(apt.procedure_id)) {
          seen.add(apt.procedure_id);
          uniqueCodes.push({
            code: apt.procedure_id,
            appointmentId: apt.appointment_id
          });
        }
      });

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
    // Removed facilityId check as column does not exist
    
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

      const transactions = data.map(t => ({
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
        paymentStatus: t.payment_status
      }));

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
      const { error } = await supabase
        .from('ledger')
        .insert([{
          patient_id: patientId,
          appointment_id: paymentData.appointmentId || null,
          provider_id: paymentData.provider_id,
          procedure_id: paymentData.procedureId || null,
          created_at: new Date().toISOString(),
          date: paymentData.date,
          type: 'PAYMENT',
          payment_method: paymentData.method,
          description: `Payment - ${paymentData.method}`,
          total_bill_amount: -Math.abs(parseFloat(paymentData.amount)),
          payment_status: 'PAID'
        }]);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Add Payment Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Add Charge (Procedure)
  async addCharge(patientId, chargeData) {
    try {
      const { error } = await supabase
        .from('ledger')
        .insert([{
          // facility_id: facilityId, // REMOVED
          patient_id: patientId,
          appointment_id: chargeData.appointmentId || null, // Link to appointment if provided
          date: chargeData.date,
          created_at: new Date().toISOString(),
          type: 'CHARGE',
          procedure_id: chargeData.code,
          description: chargeData.description,
          provider_id: chargeData.provider,
          total_bill_amount: Math.abs(parseFloat(chargeData.amount)), // Store as positive
          payment_status: 'UNPAID' // Updated column name and set logical default for new charge
        }]);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Add Charge Error:", error.message);
      return { success: false, error: error.message };
    }
  }
};
