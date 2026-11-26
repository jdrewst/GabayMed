const { RequestError } = require('./provider-accounts');

// Default facility cancellation policy: 24 hours notice required
const DEFAULT_CANCELLATION_NOTICE_HOURS = 24;

/**
 * Format ISO date string into readable date and time components
 */
function formatAppointmentDateTime(isoString, appointmentTimeStr = '') {
  try {
    let d = new Date(isoString);
    if (isNaN(d.getTime())) return { dateStr: isoString, timeStr: appointmentTimeStr || '' };

    // If appointmentTimeStr ("HH:mm:ss") is provided and isoString was date-only
    if (appointmentTimeStr && typeof isoString === 'string' && !isoString.includes('T')) {
      const [y, m, day] = isoString.split('-').map(Number);
      const [hh, mm] = appointmentTimeStr.split(':').map(Number);
      d = new Date(y, m - 1, day, hh || 0, mm || 0, 0);
    }

    const dateStr = d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return { dateStr, timeStr };
  } catch {
    return { dateStr: isoString, timeStr: appointmentTimeStr || '' };
  }
}

/**
 * Extract readable procedure/service name from joined procedure or notes
 */
function resolveProcedureName(apt) {
  if (apt?.procedures?.name) return apt.procedures.name;
  if (apt?.procedures?.description) return apt.procedures.description;
  if (typeof apt?.notes === 'string') {
    const match = /^Service:\s*([^.]+)\./i.exec(apt.notes.trim());
    if (match && match[1]) return match[1].trim();
  }
  if (apt?.procedure_id) return `Procedure #${apt.procedure_id}`;
  return 'General Consultation';
}

/**
 * Check if an appointment is cancellable under facility policy
 */
function evaluateCancellationPolicy(appointmentDateStr, status, cutoffHours = DEFAULT_CANCELLATION_NOTICE_HOURS, now = new Date()) {
  const normStatus = (status || '').toUpperCase();
  if (normStatus === 'CANCELLED') {
    return { cancellable: false, reason: 'Already cancelled', cutoffHours };
  }
  if (normStatus === 'COMPLETED') {
    return { cancellable: false, reason: 'Already completed', cutoffHours };
  }

  const apptTime = new Date(appointmentDateStr).getTime();
  const currentTime = now.getTime();
  const diffHours = (apptTime - currentTime) / (1000 * 60 * 60);

  if (diffHours <= 0) {
    return { cancellable: false, reason: 'Appointment has already passed', cutoffHours };
  }

  if (diffHours < cutoffHours) {
    return {
      cancellable: false,
      reason: `Facility policy requires at least ${cutoffHours} hours advance notice to cancel online.`,
      cutoffHours,
      hoursRemaining: Math.max(0, Math.round(diffHours * 10) / 10)
    };
  }

  return {
    cancellable: true,
    reason: `Cancellable until ${cutoffHours} hours before appointment`,
    cutoffHours,
    hoursRemaining: Math.round(diffHours * 10) / 10
  };
}

/**
 * Fetch patient's appointments schedule across all facilities
 */
async function getPatientSchedule(admin, userId, options = {}) {
  if (!userId) throw new RequestError(401, 'User authentication required.');

  // 1. Resolve all patient IDs associated with this user's profile
  const { data: patientRows, error: pError } = await admin
    .from('patients')
    .select('patient_id, facility_id')
    .eq('profile_id', userId);

  if (pError) throw new RequestError(500, 'Failed to fetch patient records: ' + pError.message);
  if (!patientRows || patientRows.length === 0) {
    return { appointments: [] };
  }

  const patientIds = patientRows.map(p => p.patient_id);

  // 2. Query appointments for these patients
  let query = admin
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

  if (options.status) {
    query = query.eq('status', options.status.toUpperCase());
  }

  const { data: appointments, error: aptError } = await query;
  if (aptError) throw new RequestError(500, 'Failed to retrieve appointments: ' + aptError.message);

  const now = options.now ? new Date(options.now) : new Date();
  const cutoffHours = options.cutoffHours ?? DEFAULT_CANCELLATION_NOTICE_HOURS;

  const formatted = (appointments || []).map(apt => {
    const facility = apt.providers?.facilities || {};
    const { dateStr, timeStr } = formatAppointmentDateTime(apt.appointment_date, apt.appointment_time);
    const policy = evaluateCancellationPolicy(apt.appointment_date, apt.status, cutoffHours, now);

    return {
      id: apt.appointment_id,
      appointmentId: apt.appointment_id,
      appointmentDate: apt.appointment_date,
      formattedDate: dateStr,
      formattedTime: timeStr,
      duration: apt.duration || 60,
      status: apt.status || 'PENDING',
      notes: apt.notes || '',
      facilityId: apt.facility_id || facility.facility_id,
      facilityName: facility.name || 'Medical Facility',
      facilityAddress: facility.address || facility.location || '',
      facilityPhone: facility.contact_num || '',
      providerId: apt.provider_id,
      providerName: apt.providers?.name || 'Assigned Provider',
      providerSpecialty: apt.providers?.specialization || apt.providers?.specialty || 'General Physician',
      procedureId: apt.procedure_id,
      procedureName: resolveProcedureName(apt),
      cancellationPolicy: policy,
      createdAt: apt.created_at
    };
  });

  return { appointments: formatted };
}

/**
 * Cancel an appointment with facility time-limit policy enforcement
 */
async function cancelPatientAppointment(admin, userId, { appointmentId, reason = '' }, options = {}) {
  if (!userId) throw new RequestError(401, 'User authentication required.');
  if (!appointmentId) throw new RequestError(400, 'Appointment ID is required.');

  // 1. Resolve patient IDs for this user
  const { data: patientRows, error: pError } = await admin
    .from('patients')
    .select('patient_id')
    .eq('profile_id', userId);

  if (pError) throw new RequestError(500, 'Failed to verify patient identity: ' + pError.message);
  const patientIds = (patientRows || []).map(p => p.patient_id);
  if (patientIds.length === 0) {
    throw new RequestError(404, 'No patient records found for this account.');
  }

  // 2. Fetch the appointment to verify ownership and check policy
  const { data: appointment, error: aptError } = await admin
    .from('appointments')
    .select(`
      appointment_id,
      appointment_date,
      status,
      notes,
      patient_id,
      facility_id,
      providers (
        name,
        facilities ( name, contact_num )
      )
    `)
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  if (aptError) throw new RequestError(500, 'Failed to fetch appointment: ' + aptError.message);
  if (!appointment) throw new RequestError(404, 'Appointment not found.');

  if (!patientIds.includes(appointment.patient_id)) {
    throw new RequestError(403, 'You are not authorized to manage this appointment.');
  }

  // 3. Status checks
  const currentStatus = (appointment.status || '').toUpperCase();
  if (currentStatus === 'CANCELLED') {
    throw new RequestError(400, 'This appointment has already been cancelled.');
  }
  if (currentStatus === 'COMPLETED') {
    throw new RequestError(400, 'Cannot cancel an appointment that has already been completed.');
  }

  // 4. Policy validation (Time-limit check)
  const now = options.now ? new Date(options.now) : new Date();
  const cutoffHours = options.cutoffHours ?? DEFAULT_CANCELLATION_NOTICE_HOURS;
  const policy = evaluateCancellationPolicy(appointment.appointment_date, currentStatus, cutoffHours, now);

  if (!policy.cancellable) {
    const facilityName = appointment.providers?.facilities?.name || 'the clinic';
    const facilityPhone = appointment.providers?.facilities?.contact_num;
    const contactMsg = facilityPhone ? ` (${facilityPhone})` : '';

    if (policy.reason === 'Appointment has already passed') {
      throw new RequestError(400, 'Cannot cancel an appointment that has already passed.');
    }

    throw new RequestError(
      400,
      `Per ${facilityName} policy, cancellations must be made at least ${cutoffHours} hours in advance. ` +
      `Please contact the facility directly${contactMsg} to adjust your schedule.`
    );
  }

  // 5. Update appointment status to CANCELLED in DB
  const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
  const cancellationNote = cleanReason
    ? `[Cancelled on ${now.toISOString()} - Reason: ${cleanReason}]`
    : `[Cancelled on ${now.toISOString()}]`;

  const updatedNotes = appointment.notes ? `${appointment.notes} ${cancellationNote}` : cancellationNote;

  const { data: updated, error: updateError } = await admin
    .from('appointments')
    .update({
      status: 'CANCELLED',
      notes: updatedNotes
    })
    .eq('appointment_id', appointmentId)
    .select(`
      appointment_id,
      appointment_date,
      status,
      notes
    `)
    .single();

  if (updateError) throw new RequestError(500, 'Failed to update appointment: ' + updateError.message);

  return {
    success: true,
    message: 'Appointment successfully cancelled.',
    appointment: updated
  };
}

/**
 * Validate requested time slot and prevent double-booking
 */
async function validateSlotAvailability(admin, { providerId, appointmentDate, durationMinutes = 60 }) {
  if (!providerId) throw new RequestError(400, 'Provider ID is required.');
  if (!appointmentDate) throw new RequestError(400, 'Appointment date and time is required.');

  const targetDate = new Date(appointmentDate);
  if (isNaN(targetDate.getTime())) {
    throw new RequestError(400, 'Invalid appointment date format.');
  }

  // Check if requested date is in the past
  if (targetDate <= new Date()) {
    throw new RequestError(400, 'Cannot book an appointment in the past.');
  }

  // Buffer window (slot duration)
  const windowStart = new Date(targetDate.getTime() - (durationMinutes - 1) * 60000).toISOString();
  const windowEnd = new Date(targetDate.getTime() + (durationMinutes - 1) * 60000).toISOString();

  // Check existing appointments for the provider
  const { data: conflicts, error } = await admin
    .from('appointments')
    .select('appointment_id, appointment_date')
    .eq('provider_id', providerId)
    .gte('appointment_date', windowStart)
    .lte('appointment_date', windowEnd)
    .neq('status', 'CANCELLED');

  if (error) throw new RequestError(500, 'Failed to check provider schedule: ' + error.message);

  const isAvailable = !conflicts || conflicts.length === 0;

  return {
    available: isAvailable,
    conflicts: conflicts || []
  };
}

/**
 * Create a patient appointment via admin client (prevents RLS issues & handles schema constraints)
 */
async function createPatientAppointment(admin, userId, appointmentData = {}) {
  if (!userId) throw new RequestError(401, 'User authentication required.');

  const cleanFacilityId = String(appointmentData.facilityId || '').replace(/^(facility-|branch-)/, '').trim();
  if (!cleanFacilityId) throw new RequestError(400, 'Facility ID is required.');
  if (!appointmentData.providerId) throw new RequestError(400, 'Provider ID is required.');
  if (!appointmentData.date || !appointmentData.time) {
    throw new RequestError(400, 'Appointment date and time are required.');
  }

  // 1. Parse date and time
  let appointmentDateISO;
  let time24Str;
  try {
    const [year, month, day] = String(appointmentData.date).split('-').map(Number);
    const [timePart, modifier] = String(appointmentData.time).trim().split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);

    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    time24Str = `${String(hours).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}:00`;
    const dateObj = new Date(year, month - 1, day, hours, minutes || 0, 0);
    if (isNaN(dateObj.getTime())) throw new Error('Invalid date');
    appointmentDateISO = dateObj.toISOString();
  } catch {
    throw new RequestError(400, 'Invalid date or time format.');
  }

  const normalizedProviderId = !isNaN(Number(appointmentData.providerId))
    ? parseInt(appointmentData.providerId, 10)
    : appointmentData.providerId;

  // 2. Check double-booking
  const availability = await validateSlotAvailability(admin, {
    providerId: normalizedProviderId,
    appointmentDate: appointmentDateISO,
    durationMinutes: 30
  });
  if (!availability.available) {
    throw Object.assign(
      new RequestError(409, 'This time slot was just booked by another patient. Please choose a different time.'),
      { code: 'SLOT_TAKEN' }
    );
  }

  // 3. Resolve or create Patient record for (userId, cleanFacilityId)
  let patientId = null;
  const { data: existingPatients } = await admin
    .from('patients')
    .select('patient_id')
    .eq('profile_id', userId)
    .eq('facility_id', cleanFacilityId)
    .limit(1);

  if (Array.isArray(existingPatients) && existingPatients.length > 0) {
    patientId = existingPatients[0].patient_id;
  } else {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, first_name, middle_name, last_name, phone_number, address, date_of_birth, gender')
      .eq('id', userId)
      .maybeSingle();

    // Resolve a valid insurance_id (required NOT NULL in patients table)
    let resolvedInsuranceId = appointmentData.insuranceId || null;
    if (resolvedInsuranceId == null) {
      try {
        const { data: userPatIns } = await admin
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
        const { data: plans } = await admin
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
        const { data: anyPatIns } = await admin
          .from('patients')
          .select('insurance_id')
          .not('insurance_id', 'is', null)
          .limit(1);
        if (anyPatIns?.[0]?.insurance_id != null) {
          resolvedInsuranceId = anyPatIns[0].insurance_id;
        }
      } catch {}
    }

    const firstName = profile?.first_name || 'Guest';
    const middleName = profile?.middle_name || null;
    const lastName = profile?.last_name || 'Patient';
    const fullName =
      profile?.full_name ||
      [firstName, middleName, lastName].filter(Boolean).join(' ') ||
      'Guest User';
    const dob = profile?.date_of_birth || '2000-01-01';
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
      phone_number: profile?.phone_number || '09000000000',
      address: profile?.address || 'Metro Manila',
      date_of_birth: dob,
      gender: profile?.gender || 'Prefer not to say',
      age,
      ...(resolvedInsuranceId != null ? { insurance_id: resolvedInsuranceId } : {}),
      created_at: new Date().toISOString()
    };

    let { data: newPatient, error: createError } = await admin
      .from('patients')
      .insert([patientPayload])
      .select('patient_id')
      .single();

    if (createError && createError.message?.includes('full_name')) {
      const { full_name, ...withoutFullName } = patientPayload;
      const retry = await admin
        .from('patients')
        .insert([withoutFullName])
        .select('patient_id')
        .single();
      newPatient = retry.data;
      createError = retry.error;
    }

    if (createError) {
      throw new RequestError(500, 'Failed to create patient record: ' + createError.message);
    }
    patientId = newPatient.patient_id;
  }

  // 4. Resolve a valid procedure_id from procedures table if available
  let resolvedProcedureId = appointmentData.procedureId || null;
  if (!resolvedProcedureId) {
    try {
      const { data: procs } = await admin.from('procedures').select('*').limit(50);
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

  // 5. Insert Appointment with fallback for optional columns
  const notesText = `Service: ${appointmentData.serviceName || 'General Consultation'}. ${appointmentData.notes || ''}`.trim();
  const fullApptPayload = {
    facility_id: cleanFacilityId,
    patient_id: patientId,
    provider_id: normalizedProviderId,
    ...(resolvedProcedureId != null ? { procedure_id: resolvedProcedureId } : {}),
    operatory: 'Room 101',
    appointment_date: appointmentDateISO,
    appointment_time: time24Str,
    duration: 60,
    status: 'PENDING',
    notes: notesText
  };

  let { data: createdAppt, error: apptErr } = await admin
    .from('appointments')
    .insert([fullApptPayload])
    .select()
    .single();

  if (apptErr) {
    // Fallback without appointment_time / operatory in case table doesn't have those columns
    const fallbackPayload = {
      facility_id: cleanFacilityId,
      patient_id: patientId,
      provider_id: normalizedProviderId,
      ...(resolvedProcedureId != null ? { procedure_id: resolvedProcedureId } : {}),
      appointment_date: appointmentDateISO,
      duration: 60,
      status: 'PENDING',
      notes: notesText
    };
    const retry1 = await admin
      .from('appointments')
      .insert([fallbackPayload])
      .select()
      .single();
    createdAppt = retry1.data;
    apptErr = retry1.error;

    if (apptErr && resolvedProcedureId != null) {
      // Fallback without procedure_id if FK constraint failed
      const { procedure_id, ...noProcPayload } = fallbackPayload;
      const retry2 = await admin
        .from('appointments')
        .insert([noProcPayload])
        .select()
        .single();
      createdAppt = retry2.data;
      apptErr = retry2.error;
    }
  }

  if (apptErr) {
    if (apptErr.code === '23505') {
      throw Object.assign(
        new RequestError(409, 'This time slot was just booked by another patient. Please choose a different time.'),
        { code: 'SLOT_TAKEN' }
      );
    }
    throw new RequestError(500, 'Failed to book appointment: ' + apptErr.message);
  }

  return { success: true, data: createdAppt };
}

module.exports = {
  DEFAULT_CANCELLATION_NOTICE_HOURS,
  formatAppointmentDateTime,
  resolveProcedureName,
  evaluateCancellationPolicy,
  getPatientSchedule,
  cancelPatientAppointment,
  validateSlotAvailability,
  createPatientAppointment
};
