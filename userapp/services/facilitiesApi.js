import { supabase } from '../lib/supabase';
import Session from './session';

function resolveProcedureLabel(apt) {
  if (apt?.procedures?.name) return apt.procedures.name;
  if (apt?.procedures?.description) return apt.procedures.description;
  if (typeof apt?.notes === 'string') {
    const match = /^Service:\s*([^.]+)\./i.exec(apt.notes.trim());
    if (match && match[1]) return match[1].trim();
  }
  if (apt?.procedure_id) return `Procedure #${apt.procedure_id}`;
  return 'Consultation';
}

const FacilitiesAPI = {
  async getFacilitiesPageData() {
    try {
      const patientIds = await Session.getAssociatedPatientIds();

      // Always fetch all registered healthcare facilities so the user can browse and book at any clinic
      const allFacilitiesPromise = supabase
        .from('facilities')
        .select('*')
        .order('name', { ascending: true });

      const [allFacilitiesResult, appointmentsResult, ledgerResult, patientsResult] = await Promise.all([
        allFacilitiesPromise,
        patientIds.length > 0
          ? supabase
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
              .order('appointment_date', { ascending: false })
          : Promise.resolve({ data: [] }),
        patientIds.length > 0
          ? supabase
              .from('ledger')
              .select(`
                *,
                appointments (
                  appointment_date,
                  notes,
                  procedures ( * ),
                  providers (
                    *,
                    facilities ( * )
                  )
                )
              `)
              .in('patient_id', patientIds)
              .order('date', { ascending: false })
          : Promise.resolve({ data: [] }),
        patientIds.length > 0
          ? supabase
              .from('patients')
              .select(`
                patient_id,
                facility_id,
                facilities ( * )
              `)
              .in('patient_id', patientIds)
          : Promise.resolve({ data: [] }),
      ]);

      const allRegisteredFacilities = allFacilitiesResult.data || [];
      const appointments = appointmentsResult.data || [];
      const ledger = ledgerResult.data || [];
      const patientRows = patientsResult.data || [];

      // Map patient_id to facility_id
      const patientFacilityMap = {};
      const facilitiesMap = new Map();

      patientRows.forEach(p => {
        if (p.patient_id && p.facility_id) {
          patientFacilityMap[p.patient_id] = p.facility_id;
        }
        const fac = p.facilities;
        if (fac && fac.facility_id && !facilitiesMap.has(fac.facility_id)) {
          facilitiesMap.set(fac.facility_id, {
            id: fac.facility_id,
            name: fac.name || 'Healthcare Facility',
            address: fac.address || fac.location || '',
            insurancePlan: 'Maxicare',
            lastVisit: 'No visits yet',
          });
        }
      });

      appointments.forEach(apt => {
        const facility = apt.providers?.facilities;
        const fId = apt.facility_id || facility?.facility_id;
        if (apt.patient_id && fId) {
          patientFacilityMap[apt.patient_id] = fId;
        }
        if (facility && fId) {
          if (!facilitiesMap.has(fId)) {
            facilitiesMap.set(fId, {
              id: fId,
              name: facility.name || 'Healthcare Facility',
              address: facility.address || facility.location || '',
              insurancePlan: 'Maxicare',
              lastVisit: 'No visits yet',
            });
          }

          const existing = facilitiesMap.get(fId);
          if (apt.status === 'COMPLETED' && existing.lastVisit === 'No visits yet') {
            existing.lastVisit = new Date(apt.appointment_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
          }
        }
      });

      // Include all other registered healthcare facilities so all facilities are displayed
      allRegisteredFacilities.forEach(fac => {
        if (fac && fac.facility_id && !facilitiesMap.has(fac.facility_id)) {
          facilitiesMap.set(fac.facility_id, {
            id: fac.facility_id,
            name: fac.name || 'Healthcare Facility',
            address: fac.address || fac.location || '',
            insurancePlan: 'Maxicare',
            lastVisit: 'No visits yet',
          });
        }
      });
      const facilitiesData = Array.from(facilitiesMap.values());

      // --- PROCESS SCHEDULES ---
      const schedulesData = appointments.map(apt => {
        let dateObj = new Date(apt.appointment_date);
        if (apt.appointment_time && typeof apt.appointment_date === 'string' && !apt.appointment_date.includes('T')) {
          const [y, m, d] = apt.appointment_date.split('-').map(Number);
          const [hh, mm] = apt.appointment_time.split(':').map(Number);
          dateObj = new Date(y, m - 1, d, hh || 0, mm || 0, 0);
        }

        const timeLabel = dateObj.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        return {
          id: apt.appointment_id,
          facilityId: apt.facility_id || apt.providers?.facilities?.facility_id || patientFacilityMap[apt.patient_id],
          month: dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
          date: dateObj.getDate().toString(),
          fullDate: dateObj.toLocaleDateString(),
          status:
            apt.status === 'CONFIRMED' || apt.status === 'PENDING'
              ? 'Scheduled'
              : apt.status === 'COMPLETED'
              ? 'Done'
              : apt.status === 'CANCELLED'
              ? 'Cancelled'
              : apt.status,
          rawStatus: apt.status,
          procedure: resolveProcedureLabel(apt),
          doctor: apt.providers?.name || 'Unknown Provider',
          room: apt.operatory ? `${apt.operatory} • ${timeLabel}` : timeLabel,
        };
      });

      // --- PROCESS ACTIVITIES (All Ledger Entries) ---
      const activitiesData = ledger.map(entry => {
        const rawDate = entry.date || entry.appointments?.appointment_date || entry.created_at;
        const dateObj = new Date(rawDate);
        const description = entry.description || 'Transaction';
        const facilityId = entry.appointments?.providers?.facilities?.facility_id || patientFacilityMap[entry.patient_id];

        return {
          id: entry.ledger_id,
          facilityId,
          description,
          time: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          amount: parseFloat(entry.total_bill_amount) || 0,
          type: parseFloat(entry.total_bill_amount) < 0 ? 'payment' : 'charge',
          code: entry.code || entry.procedure_id || entry.appointments?.procedures?.procedure_id || '-',
        };
      });

      // --- PROCESS BALANCES (Unpaid Charges) ---
      const balancesData = ledger
        .filter(entry => entry.payment_status !== 'PAID' && parseFloat(entry.total_bill_amount) > 0)
        .map(entry => {
          const facilityId = entry.appointments?.providers?.facilities?.facility_id || patientFacilityMap[entry.patient_id];
          return {
            id: entry.ledger_id,
            patientId: entry.patient_id,
            facilityId,
            procedure:
              entry.appointments?.procedures?.name ||
              entry.appointments?.procedures?.description ||
              entry.description ||
              'Service Charge',
            date: new Date(entry.created_at || entry.date).toLocaleDateString(),
            amount: parseFloat(entry.total_bill_amount) || 0,
          };
        });

      const totalPendingBalance = ledger.reduce((sum, entry) => sum + (parseFloat(entry.total_bill_amount) || 0), 0);

      return {
        facilities: facilitiesData,
        schedules: schedulesData,
        activities: activitiesData,
        balances: balancesData,
        totalPendingBalance,
      };
    } catch (error) {
      console.error('FacilitiesAPI Error:', error);
      return { facilities: [], schedules: [], activities: [], balances: [], totalPendingBalance: 0 };
    }
  },

  async addPayment(paymentData) {
    try {
      const { error } = await supabase
        .from('ledger')
        .insert([
          {
            patient_id: paymentData.patientId,
            date: new Date().toISOString(),
            created_at: new Date().toISOString(),
            type: 'PAYMENT',
            code: paymentData.method,
            description: `Payment via ${paymentData.method}`,
            total_bill_amount: -Math.abs(parseFloat(paymentData.amount)),
            payment_status: 'PAID',
          },
        ]);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Add Payment Error:', error.message);
      return { success: false, error: error.message };
    }
  },
};

export default FacilitiesAPI;
