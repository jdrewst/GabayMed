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

  async createProvider(providerData) {

    const facilityId = Session.getFacilityId();

    if (!facilityId) {
      console.error("🚨 Facility ID is missing! Ensure the user is logged in and has a facility.");
      return { success: false, error: "Facility ID is missing." };
    }

    const {data: authData, error: authError } = await supabase.auth.getUser();
    console.log("Session facility ID:", facilityId);
    console.log("Authenticated user ID:", authData?.user?.id);
    console.log("Auth error:", authError);

    try {
      // Validate required working hours
      const rawWorkingHrs = providerData.working_hrs;

      if (
        rawWorkingHrs === undefined ||
        rawWorkingHrs === null ||
        rawWorkingHrs === ""
      ) {
        return {
          success: false,
          error: "Working hours are required."
        };
      }

      const workingHrs = Number(rawWorkingHrs);

      if (
        !Number.isSafeInteger(workingHrs) ||
        workingHrs <= 0
      ) {
        return {
          success: false,
          error: "Please enter valid working hours."
        };
      }

      const providerRecord = {
        name: providerData.name.trim(),
        type: providerData.type || providerData.role,
        NPI: providerData.licenseNo.trim() || '',
        specialization: providerData.specialization || null,
        working_hrs: workingHrs,
        schedule_details: providerData.schedule || {},
        facility_id: facilityId
      };

      const {data, error} = await supabase
        .from('providers')
        .insert([providerRecord])
        .select('provider_id, name, type, NPI, specialization, working_hrs, schedule_details')
        .single();

      if (error) throw error;

      return {
        success: true,
        provider: {
          id: data.provider_id,
          name: data.name,
          type: data.type,
          role: data.type,
          licenseNo: data.NPI,
          specialization: data.specialization,
          working_hrs: data.working_hrs,
          schedule: data.schedule_details
        }
      };
    }  catch (error) {
      console.error("Create Provider Error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });

      return {
        success: false,
        error: error.message
      };
    }

    // try {
    //   const { data, error } = await supabase
    //     .from('providers')
    //     .insert([{
    //       name: providerData.name,
    //       email: providerData.email,
    //       type: providerData.type || providerData.role,
    //       password: providerData.password,
    //       license_number: providerData.licenseNo,
    //       schedule_details: providerData.schedule,
    //       specialization: providerData.specialization,
    //       facility_id: Session.getFacilityId()
    //     }])
    //     .select()
    //     .single();
        
    //   if (error) throw error;
      
    //   return { success: true, provider: { ...providerData, id: data.provider_id } };
    // } catch (error) {
    //   return { success: false, error: error.message };
    // }
  },
  
  async updateProvider(id, providerData) {
    try {
      const updates = {
        name: providerData.name,
        email: providerData.email,
        type: providerData.type || providerData.role,
        license_number: providerData.licenseNo,
        schedule_details: providerData.schedule,
        specialization: providerData.specialization
      };

      if (providerData.password) {
        updates.password = providerData.password;
      }

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
      const { data, error } = await supabase
        .from('facilities')
        .select('*')
        .eq('facility_id', facilityId)
        .single();
        
      if (error) throw error;
      
      return {
        clinicName: data.name,
        abbreviation: data.name 
        ? data.name.split(' ').map(w => w[0]).join('').substring(0, 4).toUpperCase() : 'CLINIC',
        address: data.address,
        phone: data.contact_number,
        email: data.email,
        timezone: 'Asia/Manila'
      };
    } catch (error) {
      console.error("Get Location Error:", error);
      return null;
    }
  },

  async updateLocation(locationData) {
    const facilityId = Session.getFacilityId();
    try {
      const { error } = await supabase
        .from('facilities')
        .update({
          name: locationData.clinicName,
          address: locationData.address,
          phone_number: locationData.phone,
          email: locationData.email
        })
        .eq('facility_id', facilityId);
        
      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // --- PROCEDURES ---
  async getProcedures() {
    try {
      const { data, error } = await supabase
        .from('procedures')
        .select('*')
        .order('code');
        
      if (error) throw error;
      
      return data.map(p => ({
        id: p.procedure_id,
        code: p.code,
        description: p.name,
        category: p.category || 'General',
        officeFee: p.base_price || 0
      }));
    } catch (error) {
      console.error("Get Procedures Error:", error);
      return [];
    }
  },

  async updateProcedure(id, updates) {
    try {
      const { error } = await supabase
        .from('procedures')
        .update({
          category: updates.category,
          base_price: updates.officeFee
        })
        .eq('procedure_id', id);
        
      if (error) throw error;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // --- FEE SCHEDULES ---
  async getFeeSchedules() {
    try {
      const { data, error } = await supabase
        .from('fee_schedules')
        .select(`
          schedule_id,
          schedule_name,
          fee_schedule_items (
            procedure_id,
            custom_price,
            procedures ( code, name, base_price )
          )
        `);
        
      if (error) throw error;
      
      return data.map(fs => ({
        id: fs.schedule_id,
        scheduleName: fs.schedule_name,
        associatedPlans: 'N/A',
        procedureFees: fs.fee_schedule_items.map(item => ({
          code: item.procedures?.code,
          name: item.procedures?.name,
          originalFee: item.procedures?.base_price,
          scheduleFee: item.custom_price
        }))
      }));
    } catch (error) {
      console.error("Get Fee Schedules Error:", error);
      return [];
    }
  },

  async createFeeSchedule(data) {
    try {
      // 1. Insert Schedule
      const { data: schedule, error } = await supabase
        .from('fee_schedules')
        .insert([{ schedule_name: data.scheduleName }])
        .select()
        .single();
        
      if (error) throw error;

      // 2. Map codes to IDs and Insert Items
      const { data: procs } = await supabase.from('procedures').select('procedure_id, code');
      const codeMap = {};
      procs.forEach(p => codeMap[p.code] = p.procedure_id);

      const items = data.procedureFees.map(p => ({
        procedure_id: codeMap[p.code],
        schedule_id: schedule.schedule_id,
        custom_price: p.scheduleFee
      })).filter(i => i.procedure_id);

      if (items.length > 0) {
        const { error: itemsError } = await supabase.from('fee_schedule_items').insert(items);
        if (itemsError) throw itemsError;
      }

      return { success: true, feeSchedule: { ...data, id: schedule.schedule_id } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  async updateFeeSchedule(id, data) {
    try {
       // Update name
       const { error: scheduleError } = await supabase
         .from('fee_schedules')
         .update({ schedule_name: data.scheduleName })
         .eq('schedule_id', id);
       
       if (scheduleError) throw scheduleError;
       
       // Update items (Upsert)
       const { data: procs } = await supabase.from('procedures').select('procedure_id, code');
       const codeMap = {};
       procs.forEach(p => codeMap[p.code] = p.procedure_id);

       const items = data.procedureFees.map(p => ({
        schedule_id: id,
        procedure_id: codeMap[p.code],
        custom_price: p.scheduleFee
      })).filter(i => i.procedure_id);

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('fee_schedule_items')
          .upsert(items, { onConflict: 'schedule_id, procedure_id' });
        
        if (itemsError) throw itemsError;
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};