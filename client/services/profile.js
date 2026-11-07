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

  async getPatientDetails(patientId) {
  try {
    // 1. Retrieve the patient record
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("patient_id, profile_id, date_of_birth, gender")
      .eq("patient_id", patientId)
      .single();

    if (patientError) throw patientError;

    if (!patient?.profile_id) {
      throw new Error("Patient profile ID was not found.");
    }

    // 2. Retrieve the associated profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id,
        first_name,
        middle_name,
        last_name,
        full_name,
        email,
        phone_number,
        address,
        street_address,
        barangay,
        city_municipality,
        province,
        zip_code
      `)
      .eq("id", patient.profile_id)
      .single();

    if (profileError) throw profileError;

    const fullName = [
      profile.first_name,
      profile.middle_name,
      profile.last_name
    ].filter(Boolean).join(" ") || profile.full_name || "Unknown";

    return {
      // Keep the two IDs separate
      id: patient.patient_id,
      patientId: patient.patient_id,
      profileId: profile.id,

      name: fullName,
      first_name: profile.first_name,
      middle_name: profile.middle_name,
      last_name: profile.last_name,
      email: profile.email,
      phone: profile.phone_number,

      // Structured address
      street_address: profile.street_address || "",
      barangay: profile.barangay || "",
      city_municipality: profile.city_municipality || "",
      province: profile.province || "",
      zip_code: profile.zip_code || "",

      address: profile.address || "",

      birthDate: patient.date_of_birth,
      gender: patient.gender,
      sex: patient.gender,
      age: calculateAge(patient.date_of_birth)
    };

  } catch (error) {
    console.error("Get Patient Details Error:", error);
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
  async updatePatient(patientId, updates) {
    try {

      //Calculate Age
      const calculateAge = (dateOfBirth) => {
        if (!dateOfBirth) return null;
        const today = new Date();
        const birthDate = new Date(`${dateOfBirth}T00:00:00`);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDifference = today.getMonth() - birthDate.getMonth();
        if (monthDifference < 0 ||(monthDifference === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        return age;
      };

      const { data: patient, error: fetchError } = await supabase
        .from("patients")
        .select("patient_id, profile_id")
        .eq("patient_id", patientId)
        .single();
      if (fetchError) throw fetchError;
      if (!patient?.profile_id) {
        throw new Error("Associated profile was not found.");
      }
        
      const address = [ updates.street_address, updates.barangay, updates.city_municipality, updates.province,updates.zip_code]
        .filter(value => value && value.trim())
        .join(", ");

      const { data: updatedProfile, error: profileError } = await supabase
      .from("profiles")
      .update({
        first_name: updates.first_name,
        middle_name: updates.middle_name || null,
        last_name: updates.last_name,
        email: updates.email,
        phone_number: updates.phone,
        street_address: updates.street_address || null,
        barangay: updates.barangay || null,
        city_municipality: updates.city_municipality || null,
        province: updates.province || null,
        zip_code: updates.zip_code || null,
        address: address
      })
      .eq("id", patient.profile_id)
      .select()
      .single();

      if (profileError) throw profileError;

    const age = calculateAge(updates.birthDate);

    const { error: patientError } = await supabase
      .from("patients")
      .update({
      full_name: [
        updates.first_name,
        updates.middle_name,
        updates.last_name
      ].filter(Boolean).join(" "),
      first_name: updates.first_name,
      middle_name: updates.middle_name || null,
      last_name: updates.last_name,
      date_of_birth: updates.birthDate,
      gender: updates.sex,
      age: age
      })
      .eq("patient_id", patientId);

    if (patientError) throw patientError;

    return {
      success: true,
      age: age,
      data: updatedProfile
    };
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
            procedures ( procedure_id )
          )
        `)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(item => ({
        id: item.ledger_id,
        date: item.created_at,
        description: item.description || (item.appointments?.procedures?.procedure_id ? `Procedure #${item.appointments.procedures.procedure_id}` : 'Medical Service'),
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
  async getFacilityProfile(specificFacilityId = null) {
    let facilityId = specificFacilityId;

    // Check auth user association if not explicitly provided
    if (!facilityId && typeof window !== 'undefined') {
      try {
        const authRaw = localStorage.getItem('gabay_auth');
        if (authRaw) {
          const authData = JSON.parse(authRaw);
          const user = authData.user;
          const email = user?.email || authData.email;

          if (user?.user_metadata?.facility_id) {
            facilityId = user.user_metadata.facility_id;
          } else if (email) {
            // Check if provider has facility_id
            const { data: prov } = await supabase
              .from('providers')
              .select('facility_id')
              .eq('email', email)
              .maybeSingle();

            if (prov?.facility_id) {
              facilityId = prov.facility_id;
            }
          }
        }
      } catch (err) {
        console.warn("Could not resolve facility from auth user:", err);
      }
    }

    if (!facilityId) {
      facilityId = Session.getFacilityId();
    }

    if (!facilityId) return null;

    try {
      const { data, error } = await supabase
        .from('facilities')
        .select('facility_id, name, abbreviation, location, contact_num, email, regulatory_id') 
        .eq('facility_id', facilityId)
        .single();

      if (error) throw error;

      // Generate a simple abbreviation if not set in DB
      const abbreviation = data.abbreviation || (data.name 
        ? data.name.split(' ').map(w => w[0]).join('').substring(0, 4).toUpperCase() 
        : 'CLINIC');

      const facilityData = {
        facilityId: data.facility_id,
        clinicName: data.name,
        name: data.name,
        abbreviation: abbreviation,
        address: data.location || '',
        location: data.location || '',
        phone: data.contact_num || '',
        email: data.email || 'admin@gabaymed.com',
        regulatoryId: data.regulatory_id || '',
        timezone: 'Asia/Manila'
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('gabay_facility_data', JSON.stringify(facilityData));
      }

      return facilityData;
    } catch (error) {
      console.error("Get Facility Profile Error:", error.message);
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('gabay_facility_data');
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch (_) {}
        }
      }
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
