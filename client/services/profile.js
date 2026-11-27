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
    if (!patientId) return [];
    try {
      // 1. Fetch patient record (and any sibling patient records sharing the same profile_id)
      const { data: patientRow } = await supabase
        .from('patients')
        .select('patient_id, profile_id, insurance_id, created_at')
        .eq('patient_id', patientId)
        .maybeSingle();

      const allPatientIds = [patientId];
      const directInsuranceIds = new Set();

      if (patientRow?.insurance_id != null) {
        directInsuranceIds.add(String(patientRow.insurance_id));
      }

      if (patientRow?.profile_id) {
        const { data: siblingRows } = await supabase
          .from('patients')
          .select('patient_id, insurance_id')
          .eq('profile_id', patientRow.profile_id);
        for (const row of siblingRows || []) {
          if (row.patient_id && !allPatientIds.includes(row.patient_id)) {
            allPatientIds.push(row.patient_id);
          }
          if (row.insurance_id != null) {
            directInsuranceIds.add(String(row.insurance_id));
          }
        }
      }

      // 2. Fetch rows from patient_insurance linking table (if any exist)
      const { data: linkedRows } = await supabase
        .from('patient_insurance')
        .select('*')
        .in('patient_id', allPatientIds);

      const allPlanIds = new Set(directInsuranceIds);
      for (const item of linkedRows || []) {
        if (item.insurance_id != null) {
          allPlanIds.add(String(item.insurance_id));
        }
      }

      // Also check claims for this patient in case an insurance_id was linked via a submitted claim
      const { data: claimRows } = await supabase
        .from('claims')
        .select('insurance_id')
        .in('patient_id', allPatientIds);
      for (const c of claimRows || []) {
        if (c.insurance_id != null) {
          allPlanIds.add(String(c.insurance_id));
        }
      }

      if (allPlanIds.size === 0 && (!linkedRows || linkedRows.length === 0)) {
        return [];
      }

      // 3. Look up insurance_plans and carrier details directly
      let plansById = new Map();
      const planIdList = [...allPlanIds];
      if (planIdList.length > 0) {
        const { data: planRows } = await supabase
          .from('insurance_plans')
          .select('*')
          .in('insurance_id', planIdList);

        const carrierIds = [...new Set((planRows || []).map(p => p.carrier_id).filter(Boolean))];
        let carriersById = new Map();
        if (carrierIds.length > 0) {
          const { data: carrierRows } = await supabase
            .from('carrier')
            .select('carrier_id, name, status')
            .in('carrier_id', carrierIds);
          for (const c of carrierRows || []) {
            carriersById.set(String(c.carrier_id), c);
          }
        }

        for (const p of planRows || []) {
          const carrierObj = carriersById.get(String(p.carrier_id)) || null;
          plansById.set(String(p.insurance_id), {
            ...p,
            carrierName: carrierObj?.name || 'Insurance Carrier',
            carrierStatus: carrierObj?.status || 'ACTIVE'
          });
        }
      }

      const results = [];
      const seenPlanIds = new Set();

      // A. Add plans from patient_insurance linking table
      for (const item of linkedRows || []) {
        const planKey = item.insurance_id != null ? String(item.insurance_id) : null;
        if (planKey) seenPlanIds.add(planKey);
        const planInfo = planKey ? plansById.get(planKey) : null;

        results.push({
          id: item.id ?? item.patient_insurance_id ?? `pi-${item.patient_id}-${planKey}`,
          insuranceId: item.insurance_id ?? null,
          carrier: planInfo?.carrierName || 'Insurance Carrier',
          planName: planInfo?.plan_name || 'Standard Plan',
          coverageType: item.coverage_type || planInfo?.type || planInfo?.plan_name || 'Primary',
          subscriberId: item.subscriber_id || 'On File',
          coverageStartDate: item.coverage_start_date || patientRow?.created_at || null,
          coverageEndDate: item.coverage_end_date || null,
          status: item.status || 'Active',
          notes: item.notes || ''
        });
      }

      // B. Add plans assigned directly on patients.insurance_id (or claims.insurance_id) not yet in patient_insurance
      for (const planKey of allPlanIds) {
        if (seenPlanIds.has(planKey)) continue;
        const planInfo = plansById.get(planKey);
        if (!planInfo) continue;

        results.push({
          id: `direct-plan-${planKey}`,
          insuranceId: planInfo.insurance_id,
          carrier: planInfo.carrierName || 'Insurance Carrier',
          planName: planInfo.plan_name || `Plan #${planKey}`,
          coverageType: planInfo.type ? `${planInfo.plan_name} (${planInfo.type})` : (planInfo.plan_name || 'Primary'),
          subscriberId: 'Linked to Profile',
          coverageStartDate: patientRow?.created_at || null,
          coverageEndDate: null,
          status: 'Active',
          notes: planInfo.max_limit
            ? `Max Limit / LOA: ₱${Number(planInfo.max_limit).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
            : ''
        });
      }

      return results;
    } catch (error) {
      console.error("Get Insurance Plans Error:", error.message);
      return [];
    }
  },

  // 3. Update Patient Personal & Demographic Profile (independent of medical fields)
  // Reverse sync to linked Gabay 2.0 mobile profile; preserves mobile-only attributes; rolls back on failure
  async updatePatient(patientId, updates) {
    try {
      const { data: patient, error: fetchError } = await supabase
        .from("patients")
        .select("*")
        .eq("patient_id", patientId)
        .single();
      if (fetchError) throw fetchError;

      const prevPatient = { ...patient };
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

      // 1. Update clinic-side patient record first
      const { error: patientError } = await supabase
        .from("patients")
        .update(patientPatch)
        .eq("patient_id", patientId);

      if (patientError) throw patientError;

      let updatedProfile = null;

      // 2. Reverse synchronization to linked Gabay 2.0 mobile profile
      if (patient?.profile_id) {
        const { data: prevProfile } = await supabase
          .from("profiles")
          .select(
            "first_name, middle_name, last_name, name_suffix, full_name, email, phone_number, date_of_birth, gender, street_address, barangay, city_municipality, province, zip_code, address"
          )
          .eq("id", patient.profile_id)
          .maybeSingle();

        const profilePatch = {
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
        };

        const { data: savedProfile, error: profileError } = await supabase
          .from("profiles")
          .update(profilePatch)
          .eq("id", patient.profile_id)
          .select()
          .single();

        if (profileError || !savedProfile) {
          // Synchronization failed: rollback clinic patient record to preserve last valid saved record
          try {
            await supabase.from("patients").update(prevPatient).eq("patient_id", patientId);
          } catch {}
          throw new Error(
            "Synchronization failed: Could not update patient's linked mobile profile. The last valid saved record has been preserved."
          );
        }

        updatedProfile = savedProfile;

        // Synchronize across all other linked facility patient rows if multiple exist
        try {
          await supabase
            .from("patients")
            .update(patientPatch)
            .eq("profile_id", patient.profile_id);
        } catch {}
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
  // Reverse sync to linked Gabay 2.0 mobile profile; preserves mobile-only attributes; rolls back on failure
  async updatePatientMedical(patientId, { blood_type, allergies, medical_history }) {
    try {
      const { data: patient, error: fetchError } = await supabase
        .from("patients")
        .select("*")
        .eq("patient_id", patientId)
        .single();
      if (fetchError) throw fetchError;

      const prevPatient = { ...patient };
      const cleanBloodType = (blood_type || "").trim() || null;
      const cleanAllergies = (allergies || "").trim().slice(0, 500) || null;
      const cleanHistory = (medical_history || "").trim().slice(0, 1000) || null;

      // 1. Update clinic patient record
      const { error: patientError } = await supabase
        .from("patients")
        .update({ medical_history: cleanHistory })
        .eq("patient_id", patientId);

      if (patientError) throw patientError;

      // 2. Reverse synchronization to linked Gabay 2.0 mobile profile
      if (patient?.profile_id) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            blood_type: cleanBloodType,
            allergies: cleanAllergies,
            medical_history: cleanHistory,
          })
          .eq("id", patient.profile_id);

        if (profileError) {
          // Synchronization failed: rollback clinic patient record to preserve last valid saved record
          try {
            await supabase
              .from("patients")
              .update({ medical_history: prevPatient.medical_history })
              .eq("patient_id", patientId);
          } catch {}
          throw new Error(
            "Synchronization failed: Could not update patient's linked mobile medical records. The last valid saved record has been preserved."
          );
        }

        // Synchronize across all other linked facility patient rows if multiple exist
        try {
          await supabase
            .from("patients")
            .update({ medical_history: cleanHistory })
            .eq("profile_id", patient.profile_id);
        } catch {}
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
