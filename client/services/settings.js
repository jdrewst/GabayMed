import { createClient } from '@supabase/supabase-js';
import { GabayAPI } from './gabayApi';
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

export const settingsAPI = {

  // --- PROVIDERS ---
  async getProviders() {
    const facilityID = Session.getFacilityId();

    if(!facilityID) {
      console.error("🚨 Facility ID is missing! Ensure the user is logged in and has a facility.");
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('providers')
        .select(`
          provider_id,
          facility_id,
          name,
          email,
          type,
          "NPI",
          working_hrs,
          specialization,
          schedule_details
        `)
        .eq('facility_id', facilityID)
        .order('provider_id');
      
      if (error) throw error;
      
      return (data ?? []).map(p => ({
        id: p.provider_id,
        name: p.name,
        email: p.email || '',
        type: p.type,
        role: p.type,
        licenseNo: p.NPI,
        workingHours: p.working_hrs,
        schedule: p.schedule_details || {},
        specialization: p.specialization
      }));
    } catch (error) {
      console.error("Get Providers Error:", error);
      throw error;
    }
  },

  async getAccessContext() {
    return GabayAPI.getClinicAccount();
  },

  async createProvider(providerData) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!session?.access_token) throw new Error('Please sign in before creating a provider.');
      const response = await fetch(`${getEnv('VITE_API_BASE_URL') || '/api'}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(providerData)
      });
      let result;
      try { result = await response.json(); }
      catch { throw new Error('Provider API is unavailable. Start the backend server and check its configuration.'); }
      if (!response.ok) throw new Error(result.error || 'Provider account creation failed.');
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async updateProvider(id, providerData) {
    try {
      const updates = {
        name: providerData.name,
        email: providerData.email || null,
        type: providerData.type || providerData.role,
        NPI: providerData.licenseNo,
        schedule_details: providerData.schedule,
        specialization: providerData.specialization
      };


      const { error } = await supabase
        .from('providers')
        .update(updates)
        .eq('provider_id', id);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // --- LOCATION ---
  async getLocation() {
    const facilityId = Session.getFacilityId();
    try {

      const {data, error} = await supabase
        .from('facilities')
        .select('facility_id, name, abbreviation, location, contact_num, email')
        .eq('facility_id', facilityId)
        .single();

        console.log('Matching facility:', data);
        console.log('Lookup error:', error);

      if(error) throw error;
      return {
        clinicName: data.name,
        abbreviation: data.abbreviation,
        // abbreviation: data.name 
        // ? data.name.split(' ').map(w => w[0]).join('').substring(0, 4).toUpperCase() : 'CLINIC',
        address: data.location,
        phone: data.contact_num,
        email: data.email,
        timezone: 'Asia/Manila'
      }
      
    } catch (error) {
      console.error("Get Location Error:", error);
      return null;
    }
  },

  async updateLocation(locationData) {
    const facilityId = Session.getFacilityId();

    if (!facilityId) {
    return {
      success: false,
      error: "Facility ID is missing."
    };
  }
    try {
      const { data, error } = await supabase
        .from('facilities')
        .update({
          name: locationData.clinicName.trim(),
          abbreviation: locationData.abbreviation.trim(),
          location: locationData.address.trim(),
          contact_num: locationData.phone.trim(),
          email: locationData.email.trim()
        })
        .eq('facility_id', facilityId)
        .select('facility_id, name, abbreviation, location, contact_num, email');

      console.log('Updated facility:', data);
      console.log('Supabase error:', error);
      
        // .from('facilities')
        // .update({
        //   name: locationData.clinicName,
        //   address: locationData.location,
        //   phone_number: locationData.contact_num,
        // })
        // .eq('facility_id', facilityId)
        // .select('facility_id')
        // .maybeSingle();

        // console.log('Updated facility:', data);
        // console.log('Supabase error:', error);
        
      if (error) throw error;
      if (!data || data.length === 0) {
        return{
          success: false,
          error: "Facility not found or update failed."
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // --- PROCEDURES ---
  async getProcedures() {
    const { data, error } = await supabase.from('procedures')
      .select('*').order('procedure_id');
    if (error) throw error;
    return data.map(mapProcedure);
  },

  async createProcedure(values) {
    try {
      const { data, error } = await supabase.from('procedures')
        .insert(procedureRecord(values)).select().single();
      if (error) throw error;
      return { success: true, procedure: mapProcedure(data) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async updateProcedure(id, values) {
    try {
      const { data, error } = await supabase.from('procedures')
        .update(procedureRecord(values)).eq('procedure_id', id).select().single();
      if (error) throw error;
      return { success: true, procedure: mapProcedure(data) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async deleteProcedure(id) {
    try {
      const { data, error } = await supabase.from('procedures')
        .delete().eq('procedure_id', id).select('procedure_id').single();
      if (error) throw error;
      return { success: true, id: data.procedure_id };
    } catch (error) {
      return { success: false, error: error.code === '23503'
        ? 'This procedure is used by other records and cannot be deleted.'
        : error.message };
    }
  },

  // --- FEE SCHEDULES ---
  async getFeeSchedules() {
    const { data: facilityId, error: facilityError } = await supabase.rpc('fee_current_facility_id');
    if (facilityError) throw facilityError;
    if (!facilityId) throw new Error('Your account has no clinic assignment. Sign in with a clinic account.');
    const { data, error } = await supabase.from('fee_schedules')
      .select(`schedule_id, facility_id, schedule_name, insurance_id, effective_from, effective_to,
        insurance_plans (plan_name), fee_schedule_items (procedure_id, custom_price)`)
      .eq('facility_id', facilityId).order('effective_from', { ascending: false }).order('schedule_id');
    if (error) throw error;
    return data.map(s => ({
      id: s.schedule_id, facilityId: s.facility_id, scheduleName: s.schedule_name,
      insuranceId: s.insurance_id == null ? '' : String(s.insurance_id),
      planName: s.insurance_plans?.plan_name || '',
      effectiveFrom: s.effective_from, effectiveTo: s.effective_to || '',
      procedureFees: (s.fee_schedule_items || []).map(i => ({ code: i.procedure_id, scheduleFee: i.custom_price }))
    }));
  },

  async getFeeSchedulePlans() {
    const { data, error } = await supabase.from('insurance_plans')
      .select('insurance_id, plan_name').order('plan_name');
    if (error) throw error;
    return data;
  },

  async saveFeeSchedule(id, form) {
    const { data, error } = await supabase.rpc('save_fee_schedule', {
      p_schedule_id: id,
      p_schedule_name: form.scheduleName.trim(),
      p_insurance_id: form.insuranceId || null,
      p_effective_from: form.effectiveFrom,
      p_effective_to: form.effectiveTo || null,
      p_items: form.procedureFees.map(p => ({ procedure_id: p.code, custom_price: p.scheduleFee }))
    });
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Fee schedule saving is not installed yet. Run database/fee-schedule-crud.sql in Supabase SQL Editor.');
      if (error.code === '23505') throw new Error('A schedule for this plan and start date already exists. Edit it or choose another date.');
      throw error;
    }
    return data;
  },

  async deleteFeeSchedule(id) {
    const { data, error } = await supabase.from('fee_schedules')
      .delete().eq('schedule_id', id).select('schedule_id').single();
    if (error) {
      if (error.code === '23503') throw new Error('This schedule is referenced by other records and cannot be deleted.');
      throw error;
    }
    return data.schedule_id;
  }

};
function mapProcedure(p) {
  return {
    id: p.procedure_id, code: p.procedure_id, description: p.name,
    category: p.category || 'General', price: p.price ?? 0,
    officeFee: p.office_fee ?? 0, phCaseRate: p.PHcase_rate ?? 0,
    duration: p.duration ?? 30
  };
}

function procedureRecord(values) {
  if (!values.description?.trim() || !values.category?.trim()) {
    throw new Error('Description and category are required.');
  }
  for (const key of ['price', 'officeFee', 'phCaseRate', 'duration']) {
    if (values[key] === '' || values[key] == null || !Number.isFinite(Number(values[key])) || Number(values[key]) < 0) {
      throw new Error('Enter valid non-negative prices and duration.');
    }
  }
  if (!Number.isInteger(Number(values.duration)) || Number(values.duration) < 1) {
    throw new Error('Duration must be a positive whole number of minutes.');
  }
  return {
    name: values.description.trim(), category: values.category.trim(),
    price: Number(values.price), office_fee: Number(values.officeFee),
    PHcase_rate: Number(values.phCaseRate), duration: Number(values.duration)
  };
}
