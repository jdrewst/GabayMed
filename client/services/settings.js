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
    const runSave = payload => id
      ? supabase.from('clinic_branches').update(payload).eq('branch_id', id).eq('facility_id', facilityId)
      : supabase.from('clinic_branches').insert({ ...payload, facility_id: facilityId });
    let { data, error } = await runSave(values).select().single();
    // Graceful fallback if `lat`/`long` columns haven't been added to clinic_branches yet
    if (error && (error.message?.includes('lat') || error.message?.includes('long') || error.code === 'PGRST204')) {
      const { lat, long, ...withoutCoords } = values;
      const retry = await runSave(withoutCoords).select().single();
      data = retry.data;
      error = retry.error;
    }
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
          user_id,
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
        userId: p.user_id || null,
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

  async resetProviderPassword(providerId, customPassword = '') {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw settingsRequestError(error);
      if (!session?.access_token) throw userSettingsError('Please sign in before resetting a provider password.');
      const response = await fetch(`${getEnv('VITE_API_BASE_URL') || '/api'}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: 'reset_password',
          providerId,
          ...(customPassword ? { password: customPassword } : {})
        })
      });
      let result;
      try { result = await response.json(); }
      catch { throw userSettingsError('Password reset is temporarily unavailable. Please try again later.'); }
      if (!response.ok) {
        if (response.status === 400 && result.error) {
          throw userSettingsError(result.error);
        }
        const messages = {
          401: 'Your session has expired. Please sign in again.',
          403: 'Only IT Admin accounts can reset provider passwords.',
          404: result.error || 'Provider login account not found.'
        };
        throw settingsRequestError({ status: response.status, message: result.error },
          messages[response.status] || 'Unable to reset the provider password. Please try again later.');
      }
      return result;
    } catch (error) {
      return { success: false, error: settingsRequestError(error).message };
    }
  },

  async changeOwnPassword(currentPassword, newPassword) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw settingsRequestError(error);
      if (!session?.access_token) throw userSettingsError('Please sign in before changing your password.');
      const response = await fetch(`${getEnv('VITE_API_BASE_URL') || '/api'}/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: 'change_own_password',
          currentPassword,
          newPassword
        })
      });
      let result;
      try { result = await response.json(); }
      catch { throw userSettingsError('Password change is temporarily unavailable. Please try again later.'); }
      if (!response.ok) {
        if ((response.status === 400 || response.status === 401) && result.error) {
          throw userSettingsError(result.error);
        }
        throw settingsRequestError({ status: response.status, message: result.error },
          'Unable to change your password. Please try again later.');
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

      // Keep Supabase Auth and public.users email in sync if the provider's email was updated
      if (updates.email) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            await fetch(`${getEnv('VITE_API_BASE_URL') || '/api'}/providers`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ action: 'sync_email', providerId: id, email: updates.email })
            });
          }
        } catch {}
      }

      return { success: true, provider: { id: data.provider_id, userId: data.user_id || null, name: data.name, email: data.email || '',
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
    } catch (_) {}

    return (data || []).map(p => {
      const proc = mapProcedure(p);
      const feeFromItems = feeByProcId[String(p.procedure_id)];
      if (feeFromItems != null) {
        proc.currentFee = feeFromItems;
        proc.current_fee = feeFromItems;
      }
      return proc;
    });
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
          effectiveFrom: String(s.effective_from || '').slice(0, 10),
          effectiveTo: String(s.effective_to || '').slice(0, 10),
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

  // Update or remove a single procedure's fee without modifying the rest of the schedule
  async updateFeeScheduleItem(scheduleId, procedureCode, feeValue, included = true) {
    if (!scheduleId) throw new Error('Schedule ID is required to update an individual fee.');
    const procId = isNaN(Number(procedureCode)) ? procedureCode : parseInt(procedureCode, 10);

    if (!included) {
      const { error: delErr } = await supabase
        .from('fee_schedule_items')
        .delete()
        .eq('schedule_id', scheduleId)
        .eq('procedure_id', procId);
      if (delErr) throw settingsRequestError(delErr, 'Failed to remove procedure fee from schedule.');
      return { code: procId, included: false, currentFee: 0 };
    }

    const val = parseFloat(feeValue);
    if (!Number.isFinite(val) || val < 0 || val > 9999999999.99) {
      throw userSettingsError('Enter a valid non-negative price with at most two decimal places.');
    }

    // Check if an item row already exists for (schedule_id, procedure_id)
    const { data: existing, error: findErr } = await supabase
      .from('fee_schedule_items')
      .select('*')
      .eq('schedule_id', scheduleId)
      .eq('procedure_id', procId)
      .limit(1);

    if (findErr) throw settingsRequestError(findErr, 'Failed to look up procedure fee.');

    if (Array.isArray(existing) && existing.length > 0) {
      let { error: updErr } = await supabase
        .from('fee_schedule_items')
        .update({ current_fee: val })
        .eq('schedule_id', scheduleId)
        .eq('procedure_id', procId);

      if (updErr) {
        const retry = await supabase
          .from('fee_schedule_items')
          .update({ custom_price: val })
          .eq('schedule_id', scheduleId)
          .eq('procedure_id', procId);
        updErr = retry.error;
      }
      if (updErr) throw settingsRequestError(updErr, 'Failed to update procedure fee.');
    } else {
      let { error: insErr } = await supabase
        .from('fee_schedule_items')
        .insert([{ schedule_id: scheduleId, procedure_id: procId, current_fee: val }]);

      if (insErr) {
        const retry = await supabase
          .from('fee_schedule_items')
          .insert([{ schedule_id: scheduleId, procedure_id: procId, custom_price: val }]);
        insErr = retry.error;
      }
      if (insErr) throw settingsRequestError(insErr, 'Failed to add procedure fee.');
    }

    return { code: procId, included: true, currentFee: val };
  },

  async saveFeeSchedule(id, form, original = null) {
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

    // When updating an existing schedule, only update modified header fields & modified fee items
    if (id) {
      const headerPatch = {};
      const nextName = form.scheduleName.trim();
      const nextIns = form.insuranceId ? parseInt(form.insuranceId, 10) : null;
      const nextFrom = form.effectiveFrom;
      const nextTo = form.effectiveTo || null;

      if (!original || nextName !== (original.scheduleName || '').trim()) {
        headerPatch.schedule_name = nextName;
      }
      if (!original || String(form.insuranceId || '') !== String(original.insuranceId || '')) {
        headerPatch.insurance_id = nextIns;
      }
      if (!original || nextFrom !== original.effectiveFrom) {
        headerPatch.effective_from = nextFrom;
      }
      if (!original || (form.effectiveTo || '') !== (original.effectiveTo || '')) {
        headerPatch.effective_to = nextTo;
      }

      if (Object.keys(headerPatch).length > 0) {
        const { error: updateErr } = await supabase
          .from('fee_schedules')
          .update(headerPatch)
          .eq('schedule_id', id);

        if (updateErr) {
          if (updateErr.code === '23505') {
            throw new Error('A schedule for this plan and start date already exists. Edit it or choose another date.');
          }
          throw updateErr;
        }
      }

      // Selective per-item diff: only update, insert, or delete individual fee items that changed
      const { data: currentRows, error: fetchErr } = await supabase
        .from('fee_schedule_items')
        .select('*')
        .eq('schedule_id', id);

      if (fetchErr) throw fetchErr;

      const existingByProc = new Map(
        (currentRows || []).map(r => [
          String(r.procedure_id),
          Number(r.current_fee ?? r.custom_price ?? r.price ?? r.fee ?? r.amount ?? 0)
        ])
      );
      const wantedByProc = new Map(formattedItems.map(i => [String(i.procedure_id), i]));

      // 1. Delete only items that were removed/unchecked
      for (const [procKey] of existingByProc.entries()) {
        if (!wantedByProc.has(procKey)) {
          await this.updateFeeScheduleItem(id, procKey, 0, false);
        }
      }

      // 2. Insert or update only items whose fee changed or were newly included
      for (const [procKey, item] of wantedByProc.entries()) {
        const prevFee = existingByProc.get(procKey);
        if (prevFee === undefined || Math.abs(prevFee - item.current_fee) > 0.0001) {
          await this.updateFeeScheduleItem(id, item.procedure_id, item.current_fee, true);
        }
      }

      return id;
    }

    // Creating a new schedule (id == null)
    const schedulePayload = {
      facility_id: facilityId,
      schedule_name: form.scheduleName.trim(),
      insurance_id: form.insuranceId ? parseInt(form.insuranceId, 10) : null,
      effective_from: form.effectiveFrom,
      effective_to: form.effectiveTo || null
    };

    const { data: newSchedule, error: insertErr } = await supabase
      .from('fee_schedules')
      .insert([schedulePayload])
      .select()
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        throw new Error('A schedule for this plan and start date already exists. Edit it or choose another date.');
      }
      throw insertErr;
    }
    const savedScheduleId = newSchedule.schedule_id;

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