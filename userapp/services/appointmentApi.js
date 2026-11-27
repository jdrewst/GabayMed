import { supabase } from '../lib/supabase';
import Session from './session';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_CANCELLATION_NOTICE_HOURS = 24;

export const STANDARD_MEDICAL_SERVICES = [
  'General Check-up',
  'General Physician',
  'Cardiologist',
  'Neurologist',
  'Pediatrician',
  'Dermatologist',
  'Orthopedic',
  'Psychiatric',
  'Ophthalmologist',
  'ENT Specialist',
  'Pulmonologist',
  'Dentist',
  'Hematologist',
];

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin)) {
    return window.location.origin;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;
  if (hostUri) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost && lanHost !== 'localhost' && lanHost !== '127.0.0.1') {
      return `http://${lanHost}:3000`;
    }
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

const API_URL = resolveApiUrl();

function extractProcedureName(apt) {
  if (apt?.procedures?.name) return apt.procedures.name;
  if (apt?.procedures?.description) return apt.procedures.description;
  if (typeof apt?.notes === 'string') {
    const match = /^Service:\s*([^.]+)\./i.exec(apt.notes.trim());
    if (match && match[1]) return match[1].trim();
  }
  if (apt?.procedure_id) return `Procedure #${apt.procedure_id}`;
  return 'Consultation';
}

async function resolveBookingLocation(value) {
  const location = String(value || '').trim();
  const id = location.replace(/^(facility-|branch-)/, '');
  if (!location.startsWith('branch-')) return { facilityId: id };

  const { data, error } = await supabase.from('clinic_branches')
    .select('branch_id, facility_id, name, is_active').eq('branch_id', id).maybeSingle();
  if (error || !data || data.is_active === false) throw new Error('Choose an available clinic branch.');
  return { facilityId: data.facility_id, branchKey: String(data.branch_id), name: data.name };
}

const AppointmentAPI = {
  DEFAULT_CANCELLATION_NOTICE_HOURS,

  /**
   * Evaluates whether an appointment can be cancelled under facility policies.
   */
  evaluateCancellationPolicy(appointmentDateStr, status, cutoffHours = DEFAULT_CANCELLATION_NOTICE_HOURS) {
    const normStatus = (status || '').toUpperCase();
    if (normStatus === 'CANCELLED') {
      return { cancellable: false, reason: 'Already cancelled', cutoffHours };
    }
    if (normStatus === 'COMPLETED') {
      return { cancellable: false, reason: 'Already completed', cutoffHours };
    }

    const apptTime = new Date(appointmentDateStr).getTime();
    const now = Date.now();
    const diffHours = (apptTime - now) / (1000 * 60 * 60);

    if (diffHours <= 0) {
      return { cancellable: false, reason: 'Appointment date has already passed', cutoffHours };
    }

    if (diffHours < cutoffHours) {
      return {
        cancellable: false,
        reason: `Cancellations require at least ${cutoffHours} hours advance notice per facility policy.`,
        cutoffHours,
        hoursRemaining: Math.max(0, Math.round(diffHours * 10) / 10),
      };
    }

    return {
      cancellable: true,
      reason: `Cancellable until ${cutoffHours} hours before the appointment`,
      cutoffHours,
      hoursRemaining: Math.round(diffHours * 10) / 10,
    };
  },

  /**
   * Fetch all appointments for the logged-in patient.
   * Tries the backend API endpoint first, and falls back to Supabase client.
   */
  async getPatientSchedule() {
    try {
      const token = await Session.getAccessToken();
      if (token) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const response = await fetch(`${API_URL}/api/patient-appointments`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data.appointments)) {
              return data.appointments;
            }
          }
        } catch (apiErr) {
          console.warn('Backend API unreachable, falling back to Supabase:', apiErr.message);
        }
      }

      // Supabase Direct Query Fallback
      const patientIds = await Session.getAssociatedPatientIds();
      if (patientIds.length === 0) return [];

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          procedures ( * ),
          providers (
            *,
            facilities ( * )
          )
        `)
        .in('patient_id', patientIds)
        .order('appointment_date', { ascending: false });

      if (error) throw error;

      return (data || []).map(apt => {
        const facility = apt.providers?.facilities || {};
        let d = new Date(apt.appointment_date);
        if (apt.appointment_time && typeof apt.appointment_date === 'string' && !apt.appointment_date.includes('T')) {
          const [y, m, day] = apt.appointment_date.split('-').map(Number);
          const [hh, mm] = apt.appointment_time.split(':').map(Number);
          d = new Date(y, m - 1, day, hh || 0, mm || 0, 0);
        }

        const dateStr = d.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        const timeStr = d.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        const policy = this.evaluateCancellationPolicy(d.toISOString(), apt.status);

        return {
          id: apt.appointment_id,
          appointmentId: apt.appointment_id,
          appointmentDate: d.toISOString(),
          formattedDate: dateStr,
          formattedTime: timeStr,
          duration: apt.duration || 60,
          status: apt.status || 'PENDING',
          notes: apt.notes || '',
          facilityId: apt.facility_id || facility.facility_id,
          facilityName: facility.name || 'Medical Facility',
          facilityAddress: facility.address || facility.location || '',
          facilityPhone: facility.contact_num || '',
          providerName: apt.providers?.name || 'Assigned Provider',
          providerSpecialty: apt.providers?.specialization || apt.providers?.specialty || 'General Physician',
          procedureName: extractProcedureName(apt),
          cancellationPolicy: policy,
        };
      });
    } catch (error) {
      console.error('Get Patient Schedule Error:', error.message);
      return [];
    }
  },

  /**
   * Cancel an appointment subject to facility time-limit policy.
   * Tries backend PATCH endpoint first, falling back to Supabase update.
   */
  async cancelAppointment(appointmentId, reason = '') {
    try {
      if (!appointmentId) throw new Error('Appointment ID is required');

      const token = await Session.getAccessToken();
      if (token) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`${API_URL}/api/patient-appointments`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ appointmentId, reason }),
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (response.status !== 404) {
            const result = await response.json();
            if (!response.ok) {
              return {
                success: false,
                error: result.error || 'Failed to cancel appointment due to policy restrictions.',
              };
            }
            return { success: true, message: result.message || 'Appointment cancelled successfully.' };
          }
        } catch (apiErr) {
          console.warn('Backend API cancel endpoint unreachable, checking policy directly:', apiErr.message);
        }
      }

      // Supabase direct policy verification and update fallback
      const { data: apt, error: fetchErr } = await supabase
        .from('appointments')
        .select(`
          appointment_id,
          appointment_date,
          appointment_time,
          status,
          notes,
          providers ( facilities ( * ) )
        `)
        .eq('appointment_id', appointmentId)
        .single();

      if (fetchErr) throw fetchErr;

      let apptDateIso = apt.appointment_date;
      if (apt.appointment_time && typeof apt.appointment_date === 'string' && !apt.appointment_date.includes('T')) {
        const [y, m, day] = apt.appointment_date.split('-').map(Number);
        const [hh, mm] = apt.appointment_time.split(':').map(Number);
        apptDateIso = new Date(y, m - 1, day, hh || 0, mm || 0, 0).toISOString();
      }

      // Validate policy
      const policy = this.evaluateCancellationPolicy(apptDateIso, apt.status);
      if (!policy.cancellable) {
        const facName = apt.providers?.facilities?.name || 'the clinic';
        const facPhone = apt.providers?.facilities?.contact_num;
        const phoneNotice = facPhone ? ` at ${facPhone}` : '';
        return {
          success: false,
          error: `Per ${facName} policy, appointments cannot be cancelled within 24 hours of the scheduled time. Please call the facility directly${phoneNotice}.`,
        };
      }

      const cancellationTag = reason
        ? `[Cancelled by patient - Reason: ${reason.trim()}]`
        : '[Cancelled by patient]';
      const updatedNotes = apt.notes ? `${apt.notes} ${cancellationTag}` : cancellationTag;

      const { error: updateErr } = await supabase
        .from('appointments')
        .update({
          status: 'CANCELLED',
          notes: updatedNotes,
        })
        .eq('appointment_id', appointmentId);

      if (updateErr) throw updateErr;

      return { success: true, message: 'Appointment cancelled successfully.' };
    } catch (error) {
      console.error('Cancel Appointment Error:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get all registered healthcare facilities
   */
  async getAllFacilities() {
    try {
      const { data, error } = await supabase
        .from('facilities')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []).map(f => ({
        key: `fac-${f.facility_id}`,
        id: f.facility_id,
        facilityId: f.facility_id,
        name: f.name || 'Healthcare Facility',
        address: f.location || f.address || 'Metro Manila, Philippines',
        phone: f.contact_num || '',
      }));
    } catch (error) {
      console.error('Get All Facilities Error:', error.message);
      return [];
    }
  },

  /**
   * Get providers linked to a specific facility (with fallback to all providers if none linked yet)
   */
  async getFacilityProviders(facilityId) {
    try {
      const { facilityId: cleanId, branchKey } = await resolveBookingLocation(facilityId);
      const { data, error } = await supabase
        .from('providers')
        .select('*')
        .eq('facility_id', cleanId);

      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }

      if (branchKey) return [];

      // Fallback: if a facility has no linked providers yet, return all available providers
      const { data: allProviders, error: allErr } = await supabase
        .from('providers')
        .select('*');
      if (allErr) throw allErr;
      return allProviders || [];
    } catch (error) {
      console.error('Get Providers Error:', error.message);
      return [];
    }
  },

  /**
   * Get services offered by a specific facility, always enabling standard specialties
   * (Neurologist, Cardiologist, General Check-up, etc.)
   */
  async getFacilityServices(facilityId) {
    try {
      const { facilityId: cleanId } = await resolveBookingLocation(facilityId);
      const { data } = await supabase
        .from('facilities')
        .select('services_offered')
        .eq('facility_id', cleanId)
        .maybeSingle();

      let raw = data?.services_offered || [];
      if (typeof raw === 'string') {
        try {
          if (raw.startsWith('{') && raw.endsWith('}')) {
            raw = raw.slice(1, -1).split(',').map(s => s.replace(/"/g, '').trim());
          } else if (raw.startsWith('[') && raw.endsWith(']')) {
            raw = JSON.parse(raw);
          } else {
            raw = raw.split(',').map(s => s.trim());
          }
        } catch {
          raw = [];
        }
      }

      const customServices = (Array.isArray(raw) ? raw : [])
        .map(s => String(s || '').trim())
        .filter(s => s && !/^(everything|all|all services|none|n\/a)$/i.test(s));

      // Combine custom facility services with all standard medical specialties
      const combined = new Set([...customServices, ...STANDARD_MEDICAL_SERVICES]);
      return Array.from(combined);
    } catch (error) {
      console.error('Get Facility Services Error:', error.message);
      return [...STANDARD_MEDICAL_SERVICES];
    }
  },

  /**
   * Check for existing appointments for a provider on a specific date.
   * Returns an array of booked ISO timestamps (excludes CANCELLED).
   */
  async getProviderSchedule(providerId, dateString) {
    try {
      const [y, m, d] = String(dateString).split('-').map(Number);
      const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
      const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('provider_id', providerId)
        .gte('appointment_date', startDate.toISOString())
        .lte('appointment_date', endDate.toISOString())
        .neq('status', 'CANCELLED');

      if (error) throw error;

      return (data || []).map(a => {
        if (a.appointment_time && typeof a.appointment_date === 'string' && !a.appointment_date.includes('T')) {
          const [hh, mm] = a.appointment_time.split(':').map(Number);
          return new Date(y, m - 1, d, hh || 0, mm || 0, 0).toISOString();
        }
        return a.appointment_date;
      });
    } catch (error) {
      console.error('Get Schedule Error:', error.message);
      return [];
    }
  },

  /**
   * Check whether a specific slot is still available right before booking.
   * Returns true if the slot is free, false if already taken.
   */
  async isSlotAvailable(providerId, appointmentDateISO) {
    try {
      const dateObj = new Date(appointmentDateISO);
      const windowStart = new Date(dateObj.getTime() - 30000).toISOString();
      const windowEnd = new Date(dateObj.getTime() + 30000).toISOString();

      const { count, error } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', providerId)
        .gte('appointment_date', windowStart)
        .lte('appointment_date', windowEnd)
        .neq('status', 'CANCELLED');

      if (error) throw error;
      return (count || 0) === 0;
    } catch (error) {
      console.error('Slot availability check error:', error.message);
      return true;
    }
  },

  /**
   * Get facility details for the confirmation screen
   */
  async getFacilityName(facilityId) {
    try {
      const { facilityId: cleanId, name } = await resolveBookingLocation(facilityId);
      if (name) return name;
      const { data, error } = await supabase
        .from('facilities')
        .select('name')
        .eq('facility_id', cleanId)
        .single();

      if (error) throw error;
      return data?.name || 'Medical Facility';
    } catch (error) {
      console.error('Get Facility Name Error:', error.message);
      return 'Medical Facility';
    }
  },

  /**
   * Create a new appointment for the current user.
   * Includes a double-booking guard that re-checks slot availability
   * immediately before inserting, and populates `created_at` on `patients`.
   */
  async createAppointment(appointmentData) {
    try {
      // 1. Try backend endpoint first if available
      const token = await Session.getAccessToken().catch(() => null);
      if (token) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const response = await fetch(`${API_URL}/api/patient-appointments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: 'book',
              ...appointmentData,
            }),
            signal: controller.signal,
          });
          clearTimeout(timer);

          if (response.ok) {
            const resData = await response.json();
            if (resData?.success) {
              return { success: true, data: resData.data };
            }
          } else if (response.status === 409) {
            const errData = await response.json().catch(() => ({}));
            return {
              success: false,
              error: 'SLOT_TAKEN',
              message:
                errData.error ||
                'This time slot was just booked by another patient. Please choose a different time.',
            };
          }
        } catch {
          // Backend unreachable or not updated; proceed with direct Supabase client below
        }
      }

      // 2. Direct Supabase Client Implementation
      const userId = Session.getUserId();
      if (!userId) throw new Error('User not authenticated');

      const { facilityId: cleanFacilityId, branchKey } = await resolveBookingLocation(appointmentData.facilityId);
      if (!cleanFacilityId) throw new Error('Facility ID is required');

      // 3. Resolve or Create Patient ID for this user at this facility
      let patientId = null;
      const { data: existingPatients } = await supabase
        .from('patients')
        .select('patient_id')
        .eq('profile_id', userId)
        .eq('facility_id', cleanFacilityId)
        .limit(1);

      if (Array.isArray(existingPatients) && existingPatients.length > 0) {
        patientId = existingPatients[0].patient_id;
      } else {
        const { data: dbProfile } = await supabase
          .from('profiles')
          .select('full_name, first_name, middle_name, last_name, phone_number, address, date_of_birth, gender')
          .eq('id', userId)
          .maybeSingle();

        // Resolve a valid insurance_id (required NOT NULL in patients table)
        let resolvedInsuranceId = appointmentData.insuranceId || null;
        if (resolvedInsuranceId == null) {
          try {
            const { data: userPatIns } = await supabase
              .from('patients')
              .select('insurance_id')
              .eq('profile_id', userId)
              .not('insurance_id', 'is', null)
              .limit(1);
            if (userPatIns?.[0]?.insurance_id != null) {
              resolvedInsuranceId = userPatIns[0].insurance_id;
            }
          } catch {}
        }
        if (resolvedInsuranceId == null) {
          try {
            const { data: plans } = await supabase
              .from('insurance_plans')
              .select('insurance_id')
              .limit(1);
            if (plans?.[0]?.insurance_id != null) {
              resolvedInsuranceId = plans[0].insurance_id;
            }
          } catch {}
        }
        if (resolvedInsuranceId == null) {
          try {
            const { data: anyPatIns } = await supabase
              .from('patients')
              .select('insurance_id')
              .not('insurance_id', 'is', null)
              .limit(1);
            if (anyPatIns?.[0]?.insurance_id != null) {
              resolvedInsuranceId = anyPatIns[0].insurance_id;
            }
          } catch {}
        }

        const sessionProfile = Session.current()?.profile || {};
        const firstName = dbProfile?.first_name || sessionProfile.firstName || 'Guest';
        const middleName = dbProfile?.middle_name || sessionProfile.middleName || null;
        const lastName = dbProfile?.last_name || sessionProfile.lastName || 'Patient';
        const fullName =
          dbProfile?.full_name ||
          sessionProfile.fullName ||
          [firstName, middleName, lastName].filter(Boolean).join(' ') ||
          'Guest User';
        const dob = dbProfile?.date_of_birth || sessionProfile.dateOfBirth || '2000-01-01';
        const age = dob
          ? Math.max(0, Math.abs(new Date(Date.now() - new Date(dob).getTime()).getUTCFullYear() - 1970))
          : 25;

        const patientPayload = {
          profile_id: userId,
          facility_id: cleanFacilityId,
          full_name: fullName,
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          phone_number: dbProfile?.phone_number || sessionProfile.phoneNumber || sessionProfile.mobileNumber || '09000000000',
          address: dbProfile?.address || sessionProfile.address || 'Metro Manila',
          date_of_birth: dob,
          gender: dbProfile?.gender || sessionProfile.gender || 'Prefer not to say',
          age,
          ...(resolvedInsuranceId != null ? { insurance_id: resolvedInsuranceId } : {}),
          created_at: new Date().toISOString(),
        };

        let { data: newPatient, error: createError } = await supabase
          .from('patients')
          .insert([patientPayload])
          .select('patient_id')
          .single();

        if (createError && createError.message?.includes('full_name')) {
          const { full_name, ...withoutFullName } = patientPayload;
          const retry = await supabase
            .from('patients')
            .insert([withoutFullName])
            .select('patient_id')
            .single();
          newPatient = retry.data;
          createError = retry.error;
        }

        if (createError) throw createError;
        patientId = newPatient.patient_id;
      }

      // 4. Construct timestamp safely
      let appointmentDate;
      let time24Str;
      try {
        const [year, month, day] = String(appointmentData.date).split('-').map(Number);
        const [timeStr, modifier] = String(appointmentData.time).trim().split(' ');
        let [hours, minutes] = timeStr.split(':').map(Number);

        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;

        time24Str = `${String(hours).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}:00`;
        const dateObj = new Date(year, month - 1, day, hours, minutes || 0, 0);
        if (isNaN(dateObj.getTime())) {
          throw new Error('Invalid date constructed');
        }

        appointmentDate = dateObj.toISOString();
      } catch (e) {
        throw new Error('Invalid date or time format');
      }

      const normalizedProviderId = !isNaN(Number(appointmentData.providerId))
        ? parseInt(appointmentData.providerId, 10)
        : appointmentData.providerId;

      // 5. Double-booking check
      const slotFree = await this.isSlotAvailable(normalizedProviderId, appointmentDate);
      if (!slotFree) {
        return {
          success: false,
          error: 'SLOT_TAKEN',
          message: 'This time slot was just booked by another patient. Please choose a different time.',
        };
      }

      // 6. Resolve a valid procedure_id from `procedures` table if available
      let resolvedProcedureId = appointmentData.procedureId || null;
      if (!resolvedProcedureId) {
        try {
          const { data: procs } = await supabase.from('procedures').select('*').limit(50);
          if (Array.isArray(procs) && procs.length > 0) {
            const svcLower = String(appointmentData.serviceName || '').toLowerCase();
            const matched = procs.find(p => {
              const pName = String(p.name || p.description || '').toLowerCase();
              return pName && (pName.includes(svcLower) || svcLower.includes(pName));
            });
            resolvedProcedureId = (matched || procs[0]).procedure_id;
          }
        } catch {}
      }

      // 7. Insert Appointment with graceful fallback for optional columns
      const notesText = `Service: ${appointmentData.serviceName || 'General Consultation'}. ${appointmentData.notes || ''}`.trim();
      const fullPayload = {
        facility_id: cleanFacilityId,
        ...(branchKey ? { branch_key: branchKey } : {}),
        patient_id: patientId,
        provider_id: normalizedProviderId,
        ...(resolvedProcedureId != null ? { procedure_id: resolvedProcedureId } : {}),
        operatory: 'Room 101',
        appointment_date: appointmentDate,
        appointment_time: time24Str,
        duration: 60,
        status: 'PENDING',
        notes: notesText,
      };

      let { data, error } = await supabase
        .from('appointments')
        .insert([fullPayload])
        .select()
        .single();

      if (error) {
        // Fallback if appointment_time or operatory columns don't exist
        const fallbackPayload = {
          facility_id: cleanFacilityId,
          ...(branchKey ? { branch_key: branchKey } : {}),
          patient_id: patientId,
          provider_id: normalizedProviderId,
          ...(resolvedProcedureId != null ? { procedure_id: resolvedProcedureId } : {}),
          appointment_date: appointmentDate,
          duration: 60,
          status: 'PENDING',
          notes: notesText,
        };
        const retry1 = await supabase
          .from('appointments')
          .insert([fallbackPayload])
          .select()
          .single();
        data = retry1.data;
        error = retry1.error;

        if (error && resolvedProcedureId != null) {
          // Fallback without procedure_id if FK constraint failed
          const { procedure_id, ...noProcPayload } = fallbackPayload;
          const retry2 = await supabase
            .from('appointments')
            .insert([noProcPayload])
            .select()
            .single();
          data = retry2.data;
          error = retry2.error;
        }
      }

      if (error) {
        if (error.code === '23505') {
          return {
            success: false,
            error: 'SLOT_TAKEN',
            message: 'This time slot was just booked by another patient. Please choose a different time.',
          };
        }
        throw error;
      }

      return { success: true, data };
    } catch (error) {
      console.error('Create Appointment Error:', error.message);
      return { success: false, error: error.message };
    }
  },
};

export default AppointmentAPI;
