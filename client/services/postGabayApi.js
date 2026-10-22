import { createClient } from '@supabase/supabase-js';
import { Session } from './session'; // Import Session Service

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

export const POSTGabayAPI = {
  
  async createPatient(patientData) { 
    const facilityId = Session.getFacilityId(); 

    const {
      // Profile Fields
      full_name,
      phone_number,
      address,
      email,
      // Patient Fields
      date_of_birth,
      gender,
      insurance_id
    } = patientData;

    try {
      if (!facilityId) {
        throw new Error("Facility ID is required to create a patient.");
      }

      // 1. Insert into Profiles
      // no trigger
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .insert([{
          full_name,
          phone_number,
          address,
          email
        }])
        .select('id, full_name, phone_number, address')
        .single();

      if (profileError) throw profileError;

      if (!profile) throw new Error("Profile creation failed");

      // 2. Insert into Patients
      // We use INSERT, not UPDATE, because there's no trigger
      const { error: patientError } = await supabase
        .from('patients')
        .insert({
          full_name: full_name || profile.full_name,
          phone_number: phone_number || profile.phone_number,
          address: address || profile.address,
          profile_id: profile.id,
          date_of_birth,
          gender,
          age: date_of_birth ? Math.abs(new Date(Date.now() - new Date(date_of_birth).getTime()).getUTCFullYear() - 1970) : null,
          insurance_id,
          created_at: new Date().toISOString(),
          facility_id: facilityId // Add facility_id here
        });

      if (patientError) throw patientError;

      return { success: true, id: profile.id };

    } catch (error) {
      console.error("Create Patient Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Create Carrier (and optional default plan)
  async createInsuranceCarrier(carrierData) {
    try {
      // 1. Create Carrier
      const { data: carrier, error: carrierError } = await supabase
        .from('carrier')
        .insert([{
          name: carrierData.carrierName,
          street_address: carrierData.streetAddress,
          city: carrierData.city,
          province: carrierData.province,
          zip_code: carrierData.zipCode,
          payer_id: carrierData.payerId,
          accreditation_number: carrierData.accreditationNumber,
          accreditation_expiration: carrierData.expirationDate,
          status: 'ACTIVE',
          type: carrierData.planName 
        }])
        .select()
        .single();

      if (carrierError) throw carrierError;

      return { success: true, data: carrier };
    } catch (error) {
      console.error("Create Carrier Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Create Insurance Plan
  async createInsurancePlan(planData) {
    try {
      const { data, error } = await supabase
        .from('insurance_plans')
        .insert([{
          carrier_id: planData.carrierId,
          plan_name: planData.planName,
          type: planData.type,
          renewal_month: planData.renewalMonth,
          deductible: planData.deductible,
          max_limit: planData.maxLimit,
          copay_amount: planData.coPayAmount,
          copay_type: planData.coPayType
        }])
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Create Plan Error:", error.message);
      return { success: false, error: error.message };
    }
  }
};