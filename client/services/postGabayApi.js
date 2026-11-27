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
      //full_name,
      first_name,
      middle_name,
      last_name,
      phone_number,
      street_address,
      barangay,
      city_municipality,
      province,
      zip_code,
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

      const address = [
        street_address,
        barangay,
        city_municipality,
        province,
        zip_code
      ]
        .filter(value => value && value.trim())
        .join(", ");


      // 1. Insert into Profiles
      // no trigger
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .insert([{
          first_name: first_name?.trim(),
          middle_name: middle_name || null,
          last_name: last_name?.trim(),
          phone_number,
          street_address: street_address?.trim() || null,
          barangay: barangay?.trim() || null,
          city_municipality: city_municipality?.trim() || null,
          province: province?.trim() || null,
          zip_code: zip_code?.trim() || null,
          email,
          address
        }])
        .select('id, first_name, middle_name, last_name, phone_number, address,  street_address, barangay, city_municipality, province, zip_code')
        .single();

      if (profileError) throw profileError;

      if (!profile) throw new Error("Profile creation failed");

      // 2. Insert into Patients
      // We use INSERT, not UPDATE, because there's no trigger
      const { data: newPatient, error: patientError } = await supabase
        .from('patients')
        .insert({
          //full_name: full_name || profile.full_name,
          first_name: profile.first_name,
          middle_name: profile.middle_name,
          last_name: profile.last_name,
          phone_number: profile.phone_number,
          address: profile.address,
          profile_id: profile.id,
          date_of_birth,
          gender,
          age: date_of_birth ? Math.abs(new Date(Date.now() - new Date(date_of_birth).getTime()).getUTCFullYear() - 1970) : null,
          insurance_id,
          created_at: new Date().toISOString(),
          facility_id: facilityId // Add facility_id here
        })
        .select('patient_id, profile_id')
        .single();;

      if (patientError) throw patientError;
      if (!newPatient) {
        throw new Error("Patient creation failed.");
      }
      return {
        success: true,
        id: newPatient.patient_id,
        profileId: newPatient.profile_id
      };
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

  // Update Carrier
  async updateInsuranceCarrier(carrierId, carrierData) {
    try {
      const { data: rows, error: carrierError } = await supabase
        .from('carrier')
        .update({
          name: carrierData.carrierName,
          street_address: carrierData.streetAddress,
          city: carrierData.city,
          province: carrierData.province,
          zip_code: carrierData.zipCode,
          payer_id: carrierData.payerId,
          accreditation_number: carrierData.accreditationNumber,
          accreditation_expiration: carrierData.expirationDate,
          type: carrierData.planName
        })
        .eq('carrier_id', carrierId)
        .select();

      if (carrierError) throw carrierError;

      if (Array.isArray(rows) && rows.length > 0) {
        return { success: true, data: rows[0] };
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch(`${getEnv('VITE_API_BASE_URL') || '/api'}/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: 'update_insurance_carrier', carrierId, carrierData })
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success) return result;
        if (result.error) throw new Error(result.error);
      }

      return { success: true, data: null };
    } catch (error) {
      console.error("Update Carrier Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Delete Carrier
  async deleteInsuranceCarrier(carrierId) {
    try {
      // Remove child plans first where allowed
      await supabase.from('insurance_plans').delete().eq('carrier_id', carrierId);

      const { data: rows, error: delError } = await supabase
        .from('carrier')
        .delete()
        .eq('carrier_id', carrierId)
        .select('carrier_id');

      if (delError) {
        if (delError.code === '23503') {
          throw new Error('This carrier has plans linked to patient insurance records or fee schedules and cannot be deleted.');
        }
        throw delError;
      }

      if (Array.isArray(rows) && rows.length > 0) {
        return { success: true, id: rows[0].carrier_id };
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch(`${getEnv('VITE_API_BASE_URL') || '/api'}/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: 'delete_insurance_carrier', carrierId })
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success) return result;
        if (result.error) throw new Error(result.error);
      }

      return { success: true, id: carrierId };
    } catch (error) {
      console.error("Delete Carrier Error:", error.message);
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
        .select();

      if (error) throw error;
      return { success: true, data: Array.isArray(data) ? data[0] : data };
    } catch (error) {
      console.error("Create Plan Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Update Insurance Plan
  async updateInsurancePlan(planId, planData) {
    try {
      const { data: rows, error } = await supabase
        .from('insurance_plans')
        .update({
          plan_name: planData.planName,
          type: planData.type,
          renewal_month: planData.renewalMonth,
          deductible: planData.deductible,
          max_limit: planData.maxLimit,
          copay_amount: planData.coPayAmount,
          copay_type: planData.coPayType
        })
        .eq('insurance_id', planId)
        .select();

      if (error) throw error;

      if (Array.isArray(rows) && rows.length > 0) {
        return { success: true, data: rows[0] };
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch(`${getEnv('VITE_API_BASE_URL') || '/api'}/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: 'update_insurance_plan', planId, planData })
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success) return result;
        if (result.error) throw new Error(result.error);
      }

      return { success: true, data: null };
    } catch (error) {
      console.error("Update Plan Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // Delete Insurance Plan
  async deleteInsurancePlan(planId) {
    try {
      const { data: rows, error } = await supabase
        .from('insurance_plans')
        .delete()
        .eq('insurance_id', planId)
        .select('insurance_id');

      if (error) {
        if (error.code === '23503') {
          throw new Error('This plan is linked to patient insurance records or fee schedules and cannot be deleted.');
        }
        throw error;
      }

      if (Array.isArray(rows) && rows.length > 0) {
        return { success: true, id: rows[0].insurance_id };
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const res = await fetch(`${getEnv('VITE_API_BASE_URL') || '/api'}/providers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: 'delete_insurance_plan', planId })
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && result.success) return result;
        if (result.error) throw new Error(result.error);
      }

      return { success: true, id: planId };
    } catch (error) {
      console.error("Delete Plan Error:", error.message);
      return { success: false, error: error.message };
    }
  }
};