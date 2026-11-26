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
      // 1. Retrieve the facility patient record
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("patient_id", patientId)
        .single();

      if (patientError) throw patientError;

      // 2. Retrieve the linked Gabay 2.0 profile (when linked via profile_id)
      let profile = null;
      if (patient?.profile_id) {
        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select(`
            id,
            first_name,
            middle_name,
            last_name,
            name_suffix,
            full_name,
            email,
            phone_number,
            date_of_birth,
            gender,
            address,
            street_address,
            barangay,
            city_municipality,
            province,
            zip_code,
            blood_type,
            allergies,
            medical_history,
            avatar_url
          `)
          .eq("id", patient.profile_id)
          .maybeSingle();

        if (!profileError && profileRow) {
          profile = profileRow;
        }
      }

      const firstName = profile?.first_name ?? patient.first_name ?? "";
      const middleName = profile?.middle_name ?? patient.middle_name ?? "";
      const lastName = profile?.last_name ?? patient.last_name ?? "";
      const nameSuffix = profile?.name_suffix ?? "";
      const fullName =
        [firstName, middleName, lastName, nameSuffix].filter(Boolean).join(" ") ||
        profile?.full_name ||
        patient.full_name ||
        "Unknown";

      const streetAddress = profile?.street_address || "";
      const barangay = profile?.barangay || "";
      const cityMunicipality = profile?.city_municipality || "";
      const province = profile?.province || "";
      const zipCode = profile?.zip_code || "";
      const fullAddress =
        [streetAddress, barangay, cityMunicipality, province, zipCode].filter(Boolean).join(", ") ||
        profile?.address ||
        patient.address ||
        "";

      const birthDate = (profile?.date_of_birth || patient.date_of_birth || "").slice(0, 10);
      const gender = profile?.gender || patient.gender || "";
      const bloodType = profile?.blood_type || "";
      const allergiesRaw = profile?.allergies || "";
      const medicalHistoryRaw = profile?.medical_history ?? patient.medical_history ?? "";

      const splitList = (val) =>
        typeof val === "string"
          ? val
              .split(/[\n,;]+/)
              .map((s) => s.trim())
              .filter((s) => s && s.toLowerCase() !== "none")
          : [];

      return {
        id: patient.patient_id,
        patientId: patient.patient_id,
        profileId: profile?.id || patient.profile_id || null,
        isLinkedAccount: Boolean(patient.profile_id),

        name: fullName,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        name_suffix: nameSuffix,
        email: profile?.email || "",
        phone: profile?.phone_number || patient.phone_number || "",
        avatar_url: profile?.avatar_url || "",

        // Structured address
        street_address: streetAddress,
        barangay,
        city_municipality: cityMunicipality,
        province,
        zip_code: zipCode,
        address: fullAddress,

        birthDate,
        gender,
        sex: gender,
        age: birthDate ? calculateAge(birthDate) : (patient.age ?? "N/A"),

        // Synchronized Medical Chart Summary
        blood_type: bloodType,
        allergies: allergiesRaw,
        allergiesList: splitList(allergiesRaw),
        medical_history: medicalHistoryRaw,
        medicalHistoryList: splitList(medicalHistoryRaw),
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

  // 3. Update Patient Personal & Demographic Profile (independent of medical fields)
  async updatePatient(patientId, updates) {
    try {
      const { data: patient, error: fetchError } = await supabase
        .from("patients")
        .select("patient_id, profile_id")
        .eq("patient_id", patientId)
        .single();
      if (fetchError) throw fetchError;

      const firstName = (updates.first_name || "").trim();
      const middleName = (updates.middle_name || "").trim() || null;
      const lastName = (updates.last_name || "").trim();
      const nameSuffix = (updates.name_suffix || "").trim() || null;
      const fullName = [firstName, middleName, lastName, nameSuffix].filter(Boolean).join(" ");

      const streetAddress = (updates.street_address || "").trim() || null;
      const barangay = (updates.barangay || "").trim() || null;
      const cityMunicipality = (updates.city_municipality || "").trim() || null;
      const province = (updates.province || "").trim() || null;
      const zipCode = (updates.zip_code || "").trim() || null;
      const address =
        [streetAddress, barangay, cityMunicipality, province, zipCode].filter(Boolean).join(", ") ||
        null;

      const normalizedGender =
        updates.sex === "M" ? "Male" : updates.sex === "F" ? "Female" : (updates.sex || updates.gender || null);
      const age = updates.birthDate ? calculateAge(updates.birthDate) : null;
      const ageNum = typeof age === "number" && !Number.isNaN(age) ? age : null;

      let updatedProfile = null;
      let prevProfile = null;

      if (patient?.profile_id) {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select(
            "first_name, middle_name, last_name, name_suffix, full_name, email, phone_number, date_of_birth, gender, street_address, barangay, city_municipality, province, zip_code, address"
          )
          .eq("id", patient.profile_id)
          .maybeSingle();
        prevProfile = existingProfile || null;

        const { data: savedProfile, error: profileError } = await supabase
          .from("profiles")
          .update({
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            name_suffix: nameSuffix,
            full_name: fullName,
            email: (updates.email || "").trim() || prevProfile?.email || null,
            phone_number: (updates.phone || "").trim() || null,
            date_of_birth: updates.birthDate || null,
            gender: normalizedGender,
            street_address: streetAddress,
            barangay,
            city_municipality: cityMunicipality,
            province,
            zip_code: zipCode,
            address,
          })
          .eq("id", patient.profile_id)
          .select()
          .single();

        if (profileError) throw profileError;
        updatedProfile = savedProfile;
      }

      const patientPatch = {
        full_name: fullName,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        phone_number: (updates.phone || "").trim() || null,
        address,
        date_of_birth: updates.birthDate || null,
        gender: normalizedGender,
        age: ageNum,
      };

      // Sync across all linked facility patient rows when linked, or just this patient row for walk-ins
      const patientQuery = patient?.profile_id
        ? supabase.from("patients").update(patientPatch).eq("profile_id", patient.profile_id)
        : supabase.from("patients").update(patientPatch).eq("patient_id", patientId);

      const { error: patientError } = await patientQuery;
      if (patientError) {
        if (patient?.profile_id && prevProfile) {
          try {
            await supabase.from("profiles").update(prevProfile).eq("id", patient.profile_id);
          } catch {}
        }
        throw patientError;
      }

      return {
        success: true,
        age: ageNum ?? "N/A",
        data: updatedProfile,
      };
    } catch (error) {
      console.error("Update Patient Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // 3b. Update Patient Medical Chart (blood type, allergies, medical conditions — independent of personal details)
  async updatePatientMedical(patientId, { blood_type, allergies, medical_history }) {
    try {
      const { data: patient, error: fetchError } = await supabase
        .from("patients")
        .select("patient_id, profile_id")
        .eq("patient_id", patientId)
        .single();
      if (fetchError) throw fetchError;

      const cleanBloodType = (blood_type || "").trim() || null;
      const cleanAllergies = (allergies || "").trim().slice(0, 500) || null;
      const cleanHistory = (medical_history || "").trim().slice(0, 1000) || null;

      let prevProfile = null;
      if (patient?.profile_id) {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("blood_type, allergies, medical_history")
          .eq("id", patient.profile_id)
          .maybeSingle();
        prevProfile = existingProfile || null;

        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            blood_type: cleanBloodType,
            allergies: cleanAllergies,
            medical_history: cleanHistory,
          })
          .eq("id", patient.profile_id);

        if (profileError) throw profileError;
      }

      const patientQuery = patient?.profile_id
        ? supabase.from("patients").update({ medical_history: cleanHistory }).eq("profile_id", patient.profile_id)
        : supabase.from("patients").update({ medical_history: cleanHistory }).eq("patient_id", patientId);

      const { error: patientError } = await patientQuery;
      if (patientError) {
        if (patient?.profile_id && prevProfile) {
          try {
            await supabase.from("profiles").update(prevProfile).eq("id", patient.profile_id);
          } catch {}
        }
        throw patientError;
      }

      return {
        success: true,
        blood_type: cleanBloodType || "",
        allergies: cleanAllergies || "",
        medical_history: cleanHistory || "",
      };
    } catch (error) {
      console.error("Update Patient Medical Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // 3c. Update Patient Avatar (preset ID or custom image data URI / URL)
  async updatePatientAvatar(patientId, avatarUrl) {
    try {
      const { data: patient, error: fetchError } = await supabase
        .from("patients")
        .select("patient_id, profile_id")
        .eq("patient_id", patientId)
        .single();
      if (fetchError) throw fetchError;
      if (!patient?.profile_id) {
        return { success: false, error: "This patient does not have a linked profile account yet." };
      }

      const cleanAvatar =
        typeof avatarUrl === "string" && avatarUrl.trim()
          ? avatarUrl.trim().slice(0, 1500000)
          : null;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: cleanAvatar })
        .eq("id", patient.profile_id);

      if (profileError) throw profileError;
      return { success: true, avatar_url: cleanAvatar || "" };
    } catch (error) {
      console.error("Update Patient Avatar Error:", error.message);
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
