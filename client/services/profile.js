import { createClient } from '@supabase/supabase-js';
import { Session } from './session'; // Import the session helper

// Helper to get env vars in both Vite (Frontend) and Node (Test Script)
const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key]; // Vite
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key]; // Node.js / Jest
  }
  return '';
};

// Initialize Supabase
// NOTE: In Vite, variables must start with VITE_
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL');
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error("🚨 Supabase keys are missing! Check your .env file.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// TODO: Replace with your Vercel URL (e.g., 'https://gabay-backend.vercel.app/api')
// Use 'http://localhost:3000/api' if testing locally with 'vercel dev'
const API_BASE_URL = 'http://localhost:3000/api'; 

export const profileAPI = {

  // 1. Get Full Patient Details
  async getPatientDetails(id) {
    try {
      // We join 'patients' with 'profiles' to get all info
      // Assuming 'patient_id' in patients table is the FK to 'profiles.id'
      const { data, error } = await supabase
        .from('patients')
        .select(`
          patient_id,
          date_of_birth,
          gender,
          profiles!inner (
            full_name,
            email,
            phone_number,
            address
          )
        `)
        .eq('patient_id', id)
        .single();

      if (error) throw error;

      // Flatten the structure for the UI
      return {
        id: data.patient_id,
        patientId: data.patient_id,
        name: data.profiles.full_name,
        email: data.profiles.email,
        phone: data.profiles.phone_number,
        address: data.profiles.address,
        birthDate: data.date_of_birth,
        sex: data.gender,
        age: calculateAge(data.date_of_birth)
      };
    } catch (error) {
      console.error("Get Patient Details Error:", error.message);
      return null;
    }
  },

  // 2. Get Insurance Plans
  async getInsurancePlans(patientId) {
    try {
      // Fetch from patient_insurance table (linking table)
      const { data, error } = await supabase
        .from('patient_insurance')
        .select(`
          insurance_id,
          subscriber_id,
          coverage_start_date,
          coverage_end_date,
          coverage_type,
          notes,
          insurance_plans (
            plan_name,
            type,
            carrier ( name )
          )
        `)
        .eq('patient_id', patientId);

      if (error) throw error;

      // Transform for UI
      return data.map(item => ({
        id: item.patient_id,
        carrier: item.insurance_plans?.carrier?.name || 'Unknown Carrier',
        coverageType: item.insurance_plans?.plan_name || 'Unknown Plan',
        subscriberId: item.subscriber_id,
        coverageStartDate: item.coverage_start_date,
        coverageEndDate: item.coverage_end_date,
        status: item.status,
        notes: item.notes,
        verificationDate: null // Add column if exists in DB
      }));

    } catch (error) {
      console.error("Get Insurance Plans Error:", error.message);
      return [];
    }
  },

  // 3. Update Patient Profile
  async updatePatient(id, updates) {
    try {
      // Update Profile (Contact Info)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: updates.name,
          email: updates.email,
          phone_number: updates.phone,
          address: updates.address
        })
        .eq('id', id);

      if (profileError) throw profileError;

      // Update Patient (Demographics)
      const { error: patientError } = await supabase
        .from('patients')
        .update({
          date_of_birth: updates.birthDate,
          gender: updates.sex
        })
        .eq('patient_id', id);

      if (patientError) throw patientError;

      return { success: true };
    } catch (error) {
      console.error("Update Patient Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // 4. Get Patient Ledger
  async getPatientLedger(patientId) {
    try {
      const { data, error } = await supabase
        .from('ledger')
        .select(`
          ledger_id,
          created_at,
          description,
          amount,
          status,
          code,
          appointments (
            appointment_date,
            procedures ( name )
          )
        `)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(item => ({
        id: item.ledger_id,
        date: item.created_at,
        description: item.description || item.appointments?.procedures?.name || 'Medical Service',
        amount: item.amount,
        status: item.payment_status,
        method: item.payment_method
      }));

    } catch (error) {
      console.error("Get Ledger Error:", error.message);
      return [];
    }
  },

  // 5. Get Clinical Notes (from Appointments)
  async getClinicalNotes(patientId) {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          appointment_id,
          appointment_date,
          notes,
          providers ( name )
        `)
        .eq('patient_id', patientId)
        .not('notes', 'is', null) // Only fetch if notes exist
        .neq('notes', '')
        .order('appointment_date', { ascending: false });

      if (error) throw error;

      return data.map(item => ({
        id: item.appointment_id,
        date: item.appointment_date,
        note: item.notes,
        provider: item.providers?.name || 'Unknown Provider'
      }));
    } catch (error) {
      console.error("Get Notes Error:", error.message);
      return [];
    }
  },

  // 6. Get Facility/Location Profile
  async getFacilityProfile() {
    const facilityId = Session.getFacilityId();
    if (!facilityId) return null;

    try {
      const { data, error } = await supabase
        .from('facilities')
        .select('name, address, contact_number, email') 
        .eq('facility_id', facilityId)
        .single();

      if (error) throw error;

      // Generate a simple abbreviation from the name (e.g., "City Hospital" -> "CH")
      const abbreviation = data.name 
        ? data.name.split(' ').map(w => w[0]).join('').substring(0, 4).toUpperCase() 
        : 'CLINIC';

      return {
        clinicName: data.name,
        abbreviation: abbreviation,
        address: data.address,
        phone: data.contact_number,
        email: data.email || 'admin@gabaymed.com', // Fallback if null
        timezone: 'Asia/Manila' // Default for PH context
      };
    } catch (error) {
      console.error("Get Facility Profile Error:", error.message);
      return null;
    }
  }
};

// Helper
function calculateAge(dob) {
  if (!dob) return 'N/A';
  const birthDate = new Date(dob);
  const ageDifMs = Date.now() - birthDate.getTime();
  const ageDate = new Date(ageDifMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}