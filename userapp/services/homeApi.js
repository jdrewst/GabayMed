import { supabase } from '../lib/supabase';
import Session from './session';

function resolveAppointmentType(apt) {
  if (apt?.procedures?.name) return apt.procedures.name;
  if (apt?.procedures?.description) return apt.procedures.description;
  if (typeof apt?.notes === 'string') {
    const match = /^Service:\s*([^.]+)\./i.exec(apt.notes.trim());
    if (match && match[1]) return match[1].trim();
  }
  return 'Consultation';
}

const HomeAPI = {
  async getHomeData() {
    try {
      const patientIds = await Session.getAssociatedPatientIds();
      const now = new Date().toISOString();

      if (patientIds.length === 0) {
        return { upcomingAppointment: null };
      }

      const [appointmentResult] = await Promise.all([
        supabase
          .from('appointments')
          .select(`
            appointment_id,
            appointment_date,
            appointment_time,
            duration,
            status,
            notes,
            procedures ( * ),
            providers (
              *,
              facilities ( * )
            )
          `)
          .in('patient_id', patientIds)
          .gte('appointment_date', now)
          .in('status', ['PENDING', 'CONFIRMED', 'ONGOING'])
          .order('appointment_date', { ascending: true })
          .limit(1),
      ]);

      let upcomingAppointment = null;

      if (appointmentResult.data && appointmentResult.data.length > 0) {
        const apt = appointmentResult.data[0];
        let dateObj = new Date(apt.appointment_date);
        if (apt.appointment_time && typeof apt.appointment_date === 'string' && !apt.appointment_date.includes('T')) {
          const [y, m, d] = apt.appointment_date.split('-').map(Number);
          const [hh, mm] = apt.appointment_time.split(':').map(Number);
          dateObj = new Date(y, m - 1, d, hh || 0, mm || 0, 0);
        }

        const dateOptions = { weekday: 'long', day: 'numeric', month: 'short' };
        const dateStr = dateObj.toLocaleDateString('en-US', dateOptions);

        const startTime = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        const endTimeObj = new Date(dateObj.getTime() + (apt.duration || 60) * 60000);
        const endTime = endTimeObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        upcomingAppointment = {
          id: apt.appointment_id,
          hospital: apt.providers?.facilities?.name || apt.providers?.name || 'Medical Center',
          type: resolveAppointmentType(apt),
          date: dateStr,
          time: `${startTime} - ${endTime}`,
          status: apt.status || 'PENDING',
        };
      }

      return {
        upcomingAppointment,
      };
    } catch (error) {
      console.error('HomeAPI Error:', error);
      return { upcomingAppointment: null };
    }
  },
};

export default HomeAPI;
