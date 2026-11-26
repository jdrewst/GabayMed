const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateCancellationPolicy,
  formatAppointmentDateTime,
  getPatientSchedule,
  cancelPatientAppointment,
  validateSlotAvailability,
  createPatientAppointment,
  DEFAULT_CANCELLATION_NOTICE_HOURS
} = require('../lib/patient-appointments');

test('formatAppointmentDateTime returns formatted date and time strings', () => {
  const { dateStr, timeStr } = formatAppointmentDateTime('2026-12-01T10:00:00.000Z');
  assert.ok(dateStr.includes('2026') || dateStr.includes('Dec'));
  assert.ok(timeStr.length > 0);
});

test('evaluateCancellationPolicy: allows cancellation when appointment is >24h away', () => {
  const now = new Date('2026-11-20T10:00:00.000Z');
  const appointmentDate = '2026-11-22T10:00:00.000Z'; // 48 hours away
  const policy = evaluateCancellationPolicy(appointmentDate, 'CONFIRMED', 24, now);

  assert.equal(policy.cancellable, true);
  assert.equal(policy.cutoffHours, 24);
  assert.equal(policy.hoursRemaining, 48);
});

test('evaluateCancellationPolicy: rejects cancellation when appointment is within 24h cutoff', () => {
  const now = new Date('2026-11-20T10:00:00.000Z');
  const appointmentDate = '2026-11-20T18:00:00.000Z'; // 8 hours away (<24h)
  const policy = evaluateCancellationPolicy(appointmentDate, 'CONFIRMED', 24, now);

  assert.equal(policy.cancellable, false);
  assert.ok(policy.reason.includes('Facility policy requires at least 24 hours'));
});

test('evaluateCancellationPolicy: rejects cancellation when appointment is in the past', () => {
  const now = new Date('2026-11-20T10:00:00.000Z');
  const appointmentDate = '2026-11-19T10:00:00.000Z'; // Past
  const policy = evaluateCancellationPolicy(appointmentDate, 'CONFIRMED', 24, now);

  assert.equal(policy.cancellable, false);
  assert.equal(policy.reason, 'Appointment has already passed');
});

test('evaluateCancellationPolicy: rejects cancellation if already cancelled or completed', () => {
  const now = new Date('2026-11-20T10:00:00.000Z');
  const appointmentDate = '2026-11-25T10:00:00.000Z';

  const cancelled = evaluateCancellationPolicy(appointmentDate, 'CANCELLED', 24, now);
  assert.equal(cancelled.cancellable, false);
  assert.equal(cancelled.reason, 'Already cancelled');

  const completed = evaluateCancellationPolicy(appointmentDate, 'COMPLETED', 24, now);
  assert.equal(completed.cancellable, false);
  assert.equal(completed.reason, 'Already completed');
});

test('getPatientSchedule retrieves and enriches appointments for user', async () => {
  const mockAdmin = {
    from: (table) => {
      if (table === 'patients') {
        return {
          select: () => ({
            eq: (col, val) => Promise.resolve({
              data: [{ patient_id: 'p-1', facility_id: 'fac-1' }],
              error: null
            })
          })
        };
      }
      if (table === 'appointments') {
        return {
          select: () => ({
            in: (col, ids) => ({
              order: () => Promise.resolve({
                data: [{
                  appointment_id: 'apt-1',
                  appointment_date: '2026-11-25T14:00:00.000Z',
                  duration: 60,
                  status: 'CONFIRMED',
                  notes: 'Checkup',
                  facility_id: 'fac-1',
                  patient_id: 'p-1',
                  provider_id: 'pr-1',
                  procedure_id: 'proc-1',
                  procedures: { name: 'Cardiology Consultation' },
                  providers: {
                    provider_id: 'pr-1',
                    name: 'Dr. Santos',
                    specialization: 'Cardiologist',
                    facilities: {
                      facility_id: 'fac-1',
                      name: 'Manila Medical Clinic',
                      address: 'Manila',
                      contact_num: '09123456789'
                    }
                  }
                }],
                error: null
              })
            })
          })
        };
      }
    }
  };

  const now = new Date('2026-11-20T00:00:00.000Z');
  const result = await getPatientSchedule(mockAdmin, 'user-1', { now });

  assert.equal(result.appointments.length, 1);
  const apt = result.appointments[0];
  assert.equal(apt.id, 'apt-1');
  assert.equal(apt.providerName, 'Dr. Santos');
  assert.equal(apt.facilityName, 'Manila Medical Clinic');
  assert.equal(apt.cancellationPolicy.cancellable, true);
});

test('cancelPatientAppointment succeeds when requested >24 hours prior', async () => {
  let updatedData = null;
  const mockAdmin = {
    from: (table) => {
      if (table === 'patients') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ patient_id: 'p-1' }],
              error: null
            })
          })
        };
      }
      if (table === 'appointments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  appointment_id: 'apt-1',
                  patient_id: 'p-1',
                  appointment_date: '2026-11-25T14:00:00.000Z', // 5 days away
                  status: 'CONFIRMED',
                  notes: 'Initial checkup',
                  providers: { facilities: { name: 'Clinic A', contact_num: '123' } }
                },
                error: null
              })
            })
          }),
          update: (fields) => ({
            eq: () => ({
              select: () => ({
                single: () => {
                  updatedData = fields;
                  return Promise.resolve({
                    data: { appointment_id: 'apt-1', ...fields },
                    error: null
                  });
                }
              })
            })
          })
        };
      }
    }
  };

  const now = new Date('2026-11-20T00:00:00.000Z');
  const result = await cancelPatientAppointment(mockAdmin, 'user-1', {
    appointmentId: 'apt-1',
    reason: 'Schedule conflict'
  }, { now });

  assert.equal(result.success, true);
  assert.equal(updatedData.status, 'CANCELLED');
  assert.ok(updatedData.notes.includes('Schedule conflict'));
});

test('cancelPatientAppointment enforces facility time-limit and rejects cancellation <24h', async () => {
  const mockAdmin = {
    from: (table) => {
      if (table === 'patients') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ patient_id: 'p-1' }],
              error: null
            })
          })
        };
      }
      if (table === 'appointments') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  appointment_id: 'apt-1',
                  patient_id: 'p-1',
                  appointment_date: '2026-11-20T14:00:00.000Z', // 4 hours away
                  status: 'CONFIRMED',
                  providers: { facilities: { name: 'Metro Clinic', contact_num: '02-8888-0000' } }
                },
                error: null
              })
            })
          })
        };
      }
    }
  };

  const now = new Date('2026-11-20T10:00:00.000Z');
  await assert.rejects(
    () => cancelPatientAppointment(mockAdmin, 'user-1', { appointmentId: 'apt-1' }, { now }),
    (err) => {
      assert.equal(err.status, 400);
      assert.ok(err.message.includes('at least 24 hours in advance'));
      assert.ok(err.message.includes('Metro Clinic'));
      return true;
    }
  );
});

test('validateSlotAvailability: detects double-booking conflicts', async () => {
  const mockAdmin = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            lte: () => ({
              neq: () => Promise.resolve({
                data: [{ appointment_id: 'existing-1', appointment_date: '2026-12-01T10:00:00.000Z' }],
                error: null
              })
            })
          })
        })
      })
    })
  };

  const check = await validateSlotAvailability(mockAdmin, {
    providerId: 'pr-1',
    appointmentDate: '2026-12-01T10:00:00.000Z'
  });

  assert.equal(check.available, false);
  assert.equal(check.conflicts.length, 1);
});

test('createPatientAppointment creates patient with non-null created_at and books appointment', async () => {
  let insertedPatient = null;
  let insertedAppointment = null;

  const mockAdmin = {
    from: (table) => {
      if (table === 'patients') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: [], error: null })
              }),
              not: () => ({
                limit: () => Promise.resolve({ data: [], error: null })
              })
            }),
            not: () => ({
              limit: () => Promise.resolve({ data: [{ insurance_id: 'ins-default-1' }], error: null })
            })
          }),
          insert: (rows) => {
            insertedPatient = rows[0];
            if (!insertedPatient.created_at) {
              return {
                select: () => ({
                  single: () => Promise.resolve({
                    data: null,
                    error: { message: 'null value in column "created_at" of relation "patients" violates not-null constraint' }
                  })
                })
              };
            }
            if (!insertedPatient.insurance_id) {
              return {
                select: () => ({
                  single: () => Promise.resolve({
                    data: null,
                    error: { message: 'null value in column "insurance_id" of relation "patients" violates not-null constraint' }
                  })
                })
              };
            }
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: { patient_id: 'new-pat-1' },
                  error: null
                })
              })
            };
          }
        };
      }
      if (table === 'insurance_plans') {
        return {
          select: () => ({
            limit: () => Promise.resolve({
              data: [{ insurance_id: 'ins-plan-1' }],
              error: null
            })
          })
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: {
                  first_name: 'Juan',
                  middle_name: 'D',
                  last_name: 'Dela Cruz',
                  full_name: 'Juan D Dela Cruz',
                  phone_number: '+639171234567',
                  address: 'Manila',
                  date_of_birth: '1995-05-15',
                  gender: 'Male'
                },
                error: null
              })
            })
          })
        };
      }
      if (table === 'procedures') {
        return {
          select: () => ({
            limit: () => Promise.resolve({
              data: [{ procedure_id: 101, name: 'General Check-up' }],
              error: null
            })
          })
        };
      }
      if (table === 'appointments') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  neq: () => Promise.resolve({ data: [], error: null })
                })
              })
            })
          }),
          insert: (rows) => {
            insertedAppointment = rows[0];
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: { appointment_id: 'apt-999', ...insertedAppointment },
                  error: null
                })
              })
            };
          }
        };
      }
    }
  };

  const result = await createPatientAppointment(mockAdmin, 'user-1', {
    facilityId: 'facility-d7f1b581-3b68-491d-a515-aeb94a5bee3f',
    providerId: 'prov-1',
    date: '2026-12-05',
    time: '09:00 AM',
    serviceName: 'General Check-up',
    notes: 'Booked via GabayMed App'
  });

  assert.equal(result.success, true);
  assert.ok(insertedPatient.created_at, 'created_at must be populated on patients insert');
  assert.equal(insertedPatient.insurance_id, 'ins-plan-1', 'insurance_id must be populated on patients insert');
  assert.equal(insertedPatient.facility_id, 'd7f1b581-3b68-491d-a515-aeb94a5bee3f');
  assert.equal(insertedAppointment.patient_id, 'new-pat-1');
  assert.equal(insertedAppointment.procedure_id, 101);
  assert.equal(result.data.appointment_id, 'apt-999');
});
