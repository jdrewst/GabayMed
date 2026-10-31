import { validateSettingsForm } from '../src/lib/settings-forms.js';
import { branchRecord, roomRecord, roomStatusRequest, validateLogo } from '../src/lib/settings-locations.js';
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

export const settingsAPI = {

  // --- SETTINGS: BRANCHES, ROOMS, AND LOGOS ---
  async getBranches(facilityId) {
    if (!facilityId) throw new Error('Your account has no clinic assignment.');
    const { data, error } = await supabase.from('clinic_branches').select('*')
      .eq('facility_id', facilityId).order('name');
    if (error) throw settingsLocationError(error);
    return data;
  },

  async saveBranch(facilityId, id, form) {
    if (!facilityId) throw new Error('Your account has no clinic assignment.');
    const values = branchRecord(form);
    const query = id
      ? supabase.from('clinic_branches').update(values).eq('branch_id', id).eq('facility_id', facilityId)
      : supabase.from('clinic_branches').insert({ ...values, facility_id: facilityId });
    const { data, error } = await query.select().single();
    if (error) throw settingsLocationError(error, 'This branch code already exists in your clinic.');
    return data;
  },

  async deleteBranch(facilityId, id) {
    const { data, error } = await supabase.from('clinic_branches').delete()
      .eq('branch_id', id).eq('facility_id', facilityId).select().single();
    if (error) {
      if (error.code === '23503') throw new Error('This branch has rooms or other linked records. Remove or move them before deleting the branch.');
      throw settingsLocationError(error);
    }
    return { id: data.branch_id, warning: '' };
  },

  async getHospitalLogo(facilityId) {
    const { data, error } = await supabase.from('settings_hospital_branding').select('*')
      .eq('facility_id', facilityId).single();
    if (error) throw settingsLocationError(error);
    return withHospitalLogo(data);
  },

  async setHospitalLogo(branding, file) {
    const oldPath = branding.logo_path;
    let newPath = null;
    if (file) {
      const extension = await validateLogo(file);
      newPath = `${branding.facility_id}/hospital/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from('clinic-branch-logos').upload(newPath, file,
        { contentType: file.type, cacheControl: '3600', upsert: false });
      if (upload.error) throw settingsLocationError(upload.error);
    }
    let query = supabase.from('settings_hospital_branding').update({ logo_path: newPath })
      .eq('facility_id', branding.facility_id);
    query = oldPath ? query.eq('logo_path', oldPath) : query.is('logo_path', null);
    const { data, error } = await query.select().single();
    if (error) {
      if (newPath) await supabase.storage.from('clinic-branch-logos').remove([newPath]);
      if (error.code === 'PGRST116') throw new Error('The hospital logo changed or access was denied. Reload before trying again.');
      throw settingsLocationError(error);
    }
    if (oldPath) {
      const cleanup = await supabase.storage.from('clinic-branch-logos').remove([oldPath]);
      if (cleanup.error) console.error('[Settings logo cleanup failed]', { code: cleanup.error.code, message: cleanup.error.message });
    }
    return { branding: await withHospitalLogo(data) };
  },

  async getOperatoryRooms(facilityId) {
    if (!facilityId) throw new Error('Your account has no clinic assignment.');
    const { data, error } = await supabase.from('operatory_rooms').select('*')
      .eq('facility_id', facilityId).order('code');
    if (error) throw settingsLocationError(error);
    return data;
  },

  async saveOperatoryRoom(facilityId, id, form) {
    if (!facilityId) throw new Error('Your account has no clinic assignment.');
    const values = roomRecord(form);
    const query = id
      ? supabase.from('operatory_rooms').update(values).eq('room_id', id).eq('facility_id', facilityId)
      : supabase.from('operatory_rooms').insert({ ...values, facility_id: facilityId });
    const { data, error } = await query.select().single();
    if (error) throw settingsLocationError(error, 'This room code already exists in the selected branch.');
    return data;
  },

  async updateOperatingRoomStatus(roomId, status, previousStatus) {
    const { data, error } = await supabase.rpc('update_operating_room_status', roomStatusRequest(roomId, status, previousStatus));
    if (error) throw settingsLocationError(error);
    return data;
  },

  async deleteOperatoryRoom(facilityId, id) {
    const { data, error } = await supabase.from('operatory_rooms').delete()
      .eq('room_id', id).eq('facility_id', facilityId).select('room_id').single();
    if (error) {
      if (error.code === '23503') throw new Error('This room is used by other records and cannot be deleted.');
      throw settingsLocationError(error);
    }
    return data.room_id;
  },

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
      
      if (error) throw settingsRequestError(error);
      
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
      throw settingsRequestError(error);
    }
  },

  async getAccessContext() {
    try { return await GabayAPI.getClinicAccount(); }
    catch (error) { throw settingsRequestError(error, 'Unable to load your account. Please sign in again.'); }
  },

  async createProvider(providerData) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw settingsRequestError(error);
      if (!session?.access_token) throw userSettingsError('Please sign in before creating a provider.');
      const response = await fetch(`${getEnv('VITE_API_BASE_URL') || '/api'}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(providerData)
      });
      let result;
      try { result = await response.json(); }
      catch { throw userSettingsError('Provider creation is temporarily unavailable. Please try again later.'); }
      if (!response.ok) {
        const messages = {
          401: 'Your session has expired. Please sign in again.',
          403: 'You do not have permission to add providers.',
          409: 'An account with this email already exists. Use another email.'
        };
        throw settingsRequestError({ status: response.status, message: result.error },
          messages[response.status] || 'Unable to create the provider account. Please try again later.');
      }
      return result;
    } catch (error) {
      return { success: false, error: settingsRequestError(error).message };
    }
  },

  async updateProvider(id, providerData) {
    try {
      const errors = validateSettingsForm('provider', providerData);
      if (Object.keys(errors).length) throw userSettingsError(Object.values(errors)[0]);
      const updates = {
        name: providerData.name,
        email: providerData.email || null,
        type: providerData.type || providerData.role,
        NPI: providerData.licenseNo,
        schedule_details: providerData.schedule,
        specialization: providerData.specialization,
        working_hrs: Math.max(1, Math.round(Object.values(providerData.schedule).reduce((total, hours) => {
          const [start, end] = hours.split('-').map(time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; });
          return total + end - start;
        }, 0) / 60))
      };


      const { data, error } = await supabase
        .from('providers')
        .update(updates)
        .eq('provider_id', id).select().single();

      if (error) throw settingsRequestError(error);
      return { success: true, provider: { id: data.provider_id, name: data.name, email: data.email || '',
        type: data.type, role: data.type, licenseNo: data.NPI, specialization: data.specialization,
        workingHours: data.working_hrs, schedule: data.schedule_details || {} } };
    } catch (error) {
      return { success: false, error: settingsRequestError(error).message };
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

      if(error) throw settingsRequestError(error);
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
      error: "Your account has no clinic assignment."
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

      
      if (error) throw settingsRequestError(error);
      if (!data || data.length === 0) {
        return{
          success: false,
          error: "Facility not found or update failed."
        }
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: settingsRequestError(error).message };
    }
  },

  // --- PROCEDURES ---
  async getProcedures() {
    const { data, error } = await supabase.from('procedures')
      .select('*').order('procedure_id');
    if (error) throw settingsRequestError(error);
    return data.map(mapProcedure);
  },

  async createProcedure(values) {
    try {
      const { data, error } = await supabase.from('procedures')
        .insert(procedureRecord(values)).select().single();
      if (error) throw settingsRequestError(error);
      return { success: true, procedure: mapProcedure(data) };
    } catch (error) {
      return { success: false, error: settingsRequestError(error).message };
    }
  },

  async updateProcedure(id, values) {
    try {
      const { data, error } = await supabase.from('procedures')
        .update(procedureRecord(values)).eq('procedure_id', id).select().single();
      if (error) throw settingsRequestError(error);
      return { success: true, procedure: mapProcedure(data) };
    } catch (error) {
      return { success: false, error: settingsRequestError(error).message };
    }
  },

  async deleteProcedure(id) {
    try {
      const { data, error } = await supabase.from('procedures')
        .delete().eq('procedure_id', id).select('procedure_id').single();
      if (error) throw settingsRequestError(error);
      return { success: true, id: data.procedure_id };
    } catch (error) {
      return { success: false, error: error.code === '23503'
        ? 'This procedure is used by other records and cannot be deleted.'
        : settingsRequestError(error).message };
    }
  },

  // --- FEE SCHEDULES ---
  async getFeeSchedules() {
    const { data: facilityId, error: facilityError } = await supabase.rpc('fee_current_facility_id');
    if (facilityError) throw settingsRequestError(facilityError);
    if (!facilityId) throw new Error('Your account has no clinic assignment. Sign in with a clinic account.');
    const { data, error } = await supabase.from('fee_schedules')
      .select(`schedule_id, facility_id, schedule_name, insurance_id, effective_from, effective_to,
        insurance_plans (plan_name), fee_schedule_items (procedure_id, custom_price)`)
      .eq('facility_id', facilityId).order('effective_from', { ascending: false }).order('schedule_id');
    if (error) throw settingsRequestError(error);
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
    if (error) throw settingsRequestError(error);
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
      if (error.code === 'PGRST202') throw settingsRequestError(error, 'Fee schedules are temporarily unavailable. Please try again later.');
      if (error.code === '23505') throw new Error('A schedule for this plan and start date already exists. Edit it or choose another date.');
      throw settingsRequestError(error);
    }
    return data;
  },

  async deleteFeeSchedule(id) {
    const { data, error } = await supabase.from('fee_schedules')
      .delete().eq('schedule_id', id).select('schedule_id').single();
    if (error) {
      if (error.code === '23503') throw new Error('This schedule is referenced by other records and cannot be deleted.');
      throw settingsRequestError(error);
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
  const errors = validateSettingsForm('procedure', values);
  if (Object.keys(errors).length) throw userSettingsError(Object.values(errors)[0]);
  if (!values.description?.trim() || !values.category?.trim()) {
    throw userSettingsError('Description and category are required.');
  }
  for (const key of ['price', 'officeFee', 'phCaseRate', 'duration']) {
    if (values[key] === '' || values[key] == null || !Number.isFinite(Number(values[key])) || Number(values[key]) < 0) {
      throw userSettingsError('Enter valid non-negative prices and duration.');
    }
  }
  if (!Number.isInteger(Number(values.duration)) || Number(values.duration) < 1) {
    throw userSettingsError('Duration must be a positive whole number of minutes.');
  }
  return {
    name: values.description.trim(), category: values.category.trim(),
    price: Number(values.price), office_fee: Number(values.officeFee),
    PHcase_rate: Number(values.phCaseRate), duration: Number(values.duration)
  };
}

function userSettingsError(message) {
  const error = new Error(message);
  error.isSettingsUserError = true;
  return error;
}

function settingsRequestError(error, fallback = '') {
  if (error?.isSettingsUserError) return error;
  console.error('[Settings request failed]', { code: error?.code, status: error?.status, message: error?.message });
  const messages = {
    '40001': 'The room status was changed by someone else. Please try again.',
    '42501': 'You do not have permission to make this change.',
    'PGRST116': 'Record not found or access denied. Reload and try again.',
    '23505': 'A record with these details already exists.',
    '23503': 'This record is linked to other records and cannot be changed.',
    '23502': 'Some required information is missing. Check the details and try again.'
  };
  return userSettingsError(messages[error?.code] || fallback);
}

function settingsLocationError(error, duplicateMessage) {
  if (error.code === '23505' && duplicateMessage) {
    console.error('[Settings duplicate record]', { code: error.code });
    return userSettingsError(duplicateMessage);
  }
  return settingsRequestError(error);
}

async function withHospitalLogo(branch) {
  if (!branch.logo_path) return { ...branch, logoUrl: '', logoError: '' };
  const { data, error } = await supabase.storage.from('clinic-branch-logos').createSignedUrl(branch.logo_path, 3600);
  return { ...branch, logoUrl: data?.signedUrl || '', logoError: error ? 'Logo unavailable. Try uploading it again.' : '' };
}
