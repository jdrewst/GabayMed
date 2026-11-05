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

      const { error } = await supabase
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

      if(error) throw error;
      return {
        clinicName: data.name,
        abbreviation: data.abbreviation,
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

      if (error) throw error;
      if (!data || data.length === 0) {
        return {
          success: false,
          error: "Facility not found or update failed."
        };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: settingsRequestError(error).message };
    }
  },

  // --- PROCEDURES ---
  async getProcedures() {
    try {
      const { data, error } = await supabase
        .from('procedures')
        .select('*')
        .order('procedure_id');

      if (error) throw error;

      // Also fetch latest fees from fee_schedule_items to ensure procedure catalog has current_fee
      let feeByProcId = {};
      try {
        const { data: feeItems } = await supabase
          .from('fee_schedule_items')
          .select('procedure_id, current_fee, custom_price');
        
        if (feeItems) {
          for (const item of feeItems) {
            const val = item.current_fee ?? item.custom_price;
            if (val != null && Number(val) > 0) {
              feeByProcId[String(item.procedure_id)] = Number(val);
            }
          }
        }
      } catch (fErr) {
        console.warn("Could not fetch fee_schedule_items for procedures:", fErr.message);
      }

      return (data || []).map(p => {
        const proc = mapProcedure(p);
        const feeFromItems = feeByProcId[String(p.procedure_id)];
        if (feeFromItems != null) {
          proc.currentFee = feeFromItems;
          proc.current_fee = feeFromItems;
        }
        return proc;
      });
    } catch (error) {
      console.error("Get Procedures Error:", error.message);
      throw error;
    }
  },

  async createProcedure(values) {
    try {
      const record = procedureRecord(values);
      const { data, error } = await supabase
        .from('procedures')
        .insert([record])
        .select()
        .single();

      if (error) throw error;
      return { success: true, procedure: mapProcedure(data) };
    } catch (error) {
      return { success: false, error: settingsRequestError(error).message };
    }
  },

  async updateProcedure(id, values) {
    try {
      const record = procedureRecord(values);
      const { data, error } = await supabase
        .from('procedures')
        .update(record)
        .eq('procedure_id', id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, procedure: mapProcedure(data) };
    } catch (error) {
      return { success: false, error: settingsRequestError(error).message };
    }
  },

  async deleteProcedure(id) {
    try {
      const { data, error } = await supabase
        .from('procedures')
        .delete()
        .eq('procedure_id', id)
        .select('procedure_id')
        .single();

      if (error) throw error;
      return { success: true, id: data.procedure_id };
    } catch (error) {
      return { 
        success: false, 
        error: error.code === '23503'
          ? 'This procedure is used by other records and cannot be deleted.'
          : error.message 
      };
    }
  },

  // --- FEE SCHEDULES ---
  async getFeeSchedules() {
    let facilityId = Session.getFacilityId();
    if (!facilityId) {
      try {
        const { data: rpcFacId } = await supabase.rpc('fee_current_facility_id');
        facilityId = rpcFacId;
      } catch (_) {}
    }

    if (!facilityId) {
      throw new Error('Your account has no clinic assignment. Sign in with a clinic account.');
    }

    try {
      const { data, error } = await supabase
        .from('fee_schedules')
        .select(`
          schedule_id, 
          facility_id, 
          schedule_name, 
          insurance_id, 
          effective_from, 
          effective_to,
          insurance_plans ( plan_name ), 
          fee_schedule_items ( * )
        `)
        .eq('facility_id', facilityId)
        .order('effective_from', { ascending: false })
        .order('schedule_id');

      if (error) throw error;

      // Direct fallback query for fee_schedule_items to guarantee items are present
      const scheduleIds = (data || []).map(s => s.schedule_id).filter(Boolean);
      let itemsMap = {};
      if (scheduleIds.length > 0) {
        try {
          const { data: directItems } = await supabase
            .from('fee_schedule_items')
            .select('*')
            .in('schedule_id', scheduleIds);
          if (directItems) {
            for (const item of directItems) {
              if (!itemsMap[item.schedule_id]) itemsMap[item.schedule_id] = [];
              itemsMap[item.schedule_id].push(item);
            }
          }
        } catch (_) {}
      }

      return (data || []).map(s => {
        const rawItems = (s.fee_schedule_items && s.fee_schedule_items.length > 0)
          ? s.fee_schedule_items
          : (itemsMap[s.schedule_id] || []);

        return {
          id: s.schedule_id,
          facilityId: s.facility_id,
          scheduleName: s.schedule_name,
          insuranceId: s.insurance_id == null ? '' : String(s.insurance_id),
          planName: s.insurance_plans?.plan_name || '',
          effectiveFrom: s.effective_from,
          effectiveTo: s.effective_to || '',
          procedureFees: rawItems.map(i => {
            const fee = Number(i.current_fee ?? i.custom_price ?? i.price ?? i.fee ?? i.amount ?? 0);
            return {
              code: i.procedure_id,
              currentFee: fee,
              current_fee: fee,
              scheduleFee: fee,
              newFee: fee
            };
          })
        };
      });
    } catch (error) {
      console.error("Get Fee Schedules Error:", error.message);
      throw error;
    }
  },

  async getFeeSchedulePlans() {
    try {
      const { data, error } = await supabase
        .from('insurance_plans')
        .select('insurance_id, plan_name')
        .order('plan_name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Get Fee Schedule Plans Error:", error.message);
      return [];
    }
  },

  async saveFeeSchedule(id, form) {
    const facilityId = Session.getFacilityId();

    const formattedItems = form.procedureFees.map(p => {
      const val = parseFloat(p.current_fee ?? p.newFee ?? p.scheduleFee);
      const procId = isNaN(Number(p.code)) ? p.code : parseInt(p.code, 10);
      return {
        procedure_id: procId,
        current_fee: val,
        custom_price: val
      };
    });

    // 1. Try RPC save_fee_schedule first if available in Supabase
    try {
      const { data, error } = await supabase.rpc('save_fee_schedule', {
        p_schedule_id: id ? parseInt(id, 10) : null,
        p_schedule_name: form.scheduleName.trim(),
        p_insurance_id: form.insuranceId ? parseInt(form.insuranceId, 10) : null,
        p_effective_from: form.effectiveFrom,
        p_effective_to: form.effectiveTo || null,
        p_items: formattedItems
      });

      if (!error) return data;
      if (error.code !== 'PGRST202' && !error.message?.includes('save_fee_schedule')) {
        if (error.code === '23505') {
          throw new Error('A schedule for this plan and start date already exists. Edit it or choose another date.');
        }
        throw error;
      }
    } catch (rpcErr) {
      if (rpcErr.code !== 'PGRST202' && !rpcErr.message?.includes('save_fee_schedule')) {
        throw rpcErr;
      }
    }

    // 2. Direct table fallback (saves directly to fee_schedules and fee_schedule_items)
    let savedScheduleId = id;
    const schedulePayload = {
      facility_id: facilityId,
      schedule_name: form.scheduleName.trim(),
      insurance_id: form.insuranceId ? parseInt(form.insuranceId, 10) : null,
      effective_from: form.effectiveFrom,
      effective_to: form.effectiveTo || null
    };

    if (id) {
      const { error: updateErr } = await supabase
        .from('fee_schedules')
        .update(schedulePayload)
        .eq('schedule_id', id);

      if (updateErr) throw updateErr;

      // Delete old items before reinserting
      await supabase
        .from('fee_schedule_items')
        .delete()
        .eq('schedule_id', id);
    } else {
      const { data: newSchedule, error: insertErr } = await supabase
        .from('fee_schedules')
        .insert([schedulePayload])
        .select()
        .single();

      if (insertErr) throw insertErr;
      savedScheduleId = newSchedule.schedule_id;
    }

    // Insert fee schedule items - write to current_fee as requested
    if (formattedItems.length > 0) {
      const itemsWithCurrentFee = formattedItems.map(item => ({
        schedule_id: savedScheduleId,
        procedure_id: item.procedure_id,
        current_fee: item.current_fee
      }));

      const { error: itemsErr } = await supabase
        .from('fee_schedule_items')
        .insert(itemsWithCurrentFee);

      if (itemsErr) {
        // Fallback: in case database still has custom_price instead of current_fee
        const fallbackItems = formattedItems.map(item => ({
          schedule_id: savedScheduleId,
          procedure_id: item.procedure_id,
          custom_price: item.current_fee
        }));
        const { error: fallbackErr } = await supabase
          .from('fee_schedule_items')
          .insert(fallbackItems);
        if (fallbackErr) throw fallbackErr;
      }
    }

    return savedScheduleId;
  },

  async deleteFeeSchedule(id) {
    try {
      // Delete child items first to maintain FK integrity
      await supabase
        .from('fee_schedule_items')
        .delete()
        .eq('schedule_id', id);

      const { data, error } = await supabase
        .from('fee_schedules')
        .delete()
        .eq('schedule_id', id)
        .select('schedule_id')
        .single();

      if (error) {
        if (error.code === '23503') {
          throw new Error('This schedule is referenced by other records and cannot be deleted.');
        }
        throw error;
      }

      return data?.schedule_id ?? id;
    } catch (error) {
      console.error("Delete Fee Schedule Error:", error.message);
      throw error;
    }
  }

};

function mapProcedure(p) {
  const desc = p.description || p.name || (p.procedure_id ? `Procedure ${p.procedure_id}` : 'General Procedure');
  const fallbackFee = p.current_fee ?? p.currentFee ?? (Number(p.price || 0) + Number(p.office_fee ?? p.officeFee ?? 0));
  return {
    id: p.procedure_id,
    code: p.procedure_id,
    description: desc,
    name: desc,
    category: p.category || 'General',
    price: p.price ?? 0,
    officeFee: p.office_fee ?? p.officeFee ?? 0,
    phCaseRate: p.PHcase_rate ?? p.ph_case_rate ?? 0,
    currentFee: Number(fallbackFee || 0),
    current_fee: Number(fallbackFee || 0),
    duration: p.duration ?? 30
  };
}

function procedureRecord(values) {
  const desc = values.description?.trim() || values.name?.trim() || '';
  if (!desc || !values.category?.trim()) {
    throw new Error('Description and category are required.');
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
    description: desc,
    category: values.category.trim(),
    price: Number(values.price),
    office_fee: Number(values.officeFee),
    PHcase_rate: Number(values.phCaseRate),
    duration: Number(values.duration)
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
