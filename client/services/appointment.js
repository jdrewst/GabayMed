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
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL');
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.error("🚨 Supabase keys are missing! Check your .env file.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// HELPER: Get YYYY-MM-DD in LOCAL time (fixes UTC timezone bugs)
const getLocalDateStr = (dateInput) => {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const appointmentAPI = {
  
  async getTodayAppointments() {
    const facilityId = Session.getFacilityId();

    // FIX: Use local date string
    const today = getLocalDateStr(new Date());
    const start = `${today}T00:00:00`;
    const end = `${today}T23:59:59`;

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          appointment_id,
          appointment_date,
          operatory,
          status,
          patients ( full_name ),
          procedures ( name ),
          providers ( name )
        `)
        .eq('facility_id', facilityId)
        .gte('appointment_date', start)
        .lte('appointment_date', end)
        .neq('status', 'CANCELLED') 
        .order('appointment_date', { ascending: true });

      if (error) throw error;

      return data;

    } catch (error) {
      console.error("Get Today's Appointments Error:", error.message);
      return [];
    }
  },

  // 1. Get Providers for the Scheduler Rows
  async getProviders() {
    const facilityId = Session.getFacilityId();
    try {
      const { data, error } = await supabase
        .from('providers')
        .select('provider_id, name, specialization')
        .eq('facility_id', facilityId);
      
      if (error) throw error;
      
      return data.map(p => ({
        id: p.provider_id,
        name: p.name,
        role: p.specialization || 'Provider',
        image: null 
      }));
    } catch (error) {
      console.error("Get Providers Error:", error.message);
      return [];
    }
  },

  // 2. GET Appointments for a specific date
  async getAppointmentsByDate(date) {
    const facilityId = Session.getFacilityId();
    
    // FIX: Use local date string
    const dateStr = getLocalDateStr(date);
    const start = `${dateStr}T00:00:00`;
    const end = `${dateStr}T23:59:59`;

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          appointment_id,
          appointment_date,
          appointment_time,
          operatory,
          status,
          duration, 
          notes,
          provider_id,
          patient_id, 
          procedure_id,
          patients ( full_name ),
          procedures ( name )
        `)
        .eq('facility_id', facilityId)
        .gte('appointment_date', start)
        .lte('appointment_date', end)
        .neq('status', 'CANCELLED');

      if (error) throw error;

      // Transform for Scheduler UI
      return data.map(apt => {
        let hour = 8;
        if (apt.appointment_time) {
          const parts = apt.appointment_time.split(':');
          hour = parseInt(parts[0], 10);
        } else if (apt.appointment_date && apt.appointment_date.includes('T')) {
          const dateObj = new Date(apt.appointment_date);
          if (!isNaN(dateObj.getTime())) {
            hour = dateObj.getHours();
          }
        }

        return {
          id: apt.appointment_id,
          patientId: apt.patient_id,
          providerId: apt.provider_id,
          procedureId: apt.procedure_id,
          fullDate: apt.appointment_date,
          time: hour, 
          patient: apt.patients?.full_name || 'Unknown',
          procedure: apt.procedures?.name || 'General',
          status: apt.status || 'PENDING',
          operatory: apt.operatory || 'Room 101', 
          length: apt.duration || 30,
          notes: apt.notes || ''
        };
      });

    } catch (error) {
      console.error("Get Scheduler Appointments Error:", error.message);
      return [];
    }
  },

  // 3. Get Procedures for Dropdown
  async getProcedures() {
    try {
      const { data, error } = await supabase
        .from('procedures')
        .select('procedure_id, name');
      
      if (error) throw error;
      return data.map(p => ({ id: p.procedure_id, name: p.name }));
    } catch (error) {
      return [];
    }
  },

  // 4. Create Appointment
  async createAppointment(newAppointment) {
    const facilityId = Session.getFacilityId();
    
    try {
      const dateObj = new Date(newAppointment.date);
      const dateStr = getLocalDateStr(dateObj);
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}:00`;

      const { data, error } = await supabase
        .from('appointments')
        .insert([{
          facility_id: facilityId,
          patient_id: newAppointment.patientId,
          provider_id: newAppointment.providerId,
          procedure_id: newAppointment.procedureId,
          operatory: newAppointment.operatory || 'Room 101',
          appointment_date: dateStr,
          appointment_time: timeStr,
          duration: parseInt(newAppointment.duration) || 30,
          status: newAppointment.status || 'PENDING',
          notes: newAppointment.notes || ''
        }])
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Create Appointment Error:", error.message);
      return { success: false, error: error.message };
    }
  },

  // 5. Search Patients
  async searchPatients(query) {
    const facilityId = Session.getFacilityId();
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('patient_id, full_name')
        .eq('facility_id', facilityId)
        .ilike('full_name', `%${query}%`)
        .limit(5);

      if (error) throw error;
      return data.map(p => ({ id: p.patient_id, name: p.full_name }));
    } catch (error) {
      return [];
    }
  },

  // 6. Get Peak Hours Data
  async getPeakHoursData(dateInput = null) {
    const facilityId = Session.getFacilityId();
    // FIX: Use local date string
    const targetDate = dateInput ? getLocalDateStr(dateInput) : getLocalDateStr(new Date());
    const start = `${targetDate}T00:00:00`;
    const end = `${targetDate}T23:59:59`;

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('appointment_date')
        .eq('facility_id', facilityId)
        .gte('appointment_date', start)
        .lte('appointment_date', end)
        .neq('status', 'CANCELLED');

      if (error) throw error;

      const hoursMap = {};
      for (let i = 8; i <= 17; i++) {
        hoursMap[i] = 0;
      }

      data.forEach(app => {
        const date = new Date(app.appointment_date);
        const hour = date.getHours();
        if (hoursMap[hour] !== undefined) {
          hoursMap[hour]++;
        } else {
          hoursMap[hour] = (hoursMap[hour] || 0) + 1;
        }
      });

      const sortedHours = Object.keys(hoursMap).sort((a, b) => parseInt(a) - parseInt(b));
      
      return sortedHours.map(hour => {
        const h = parseInt(hour);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayHour = h % 12 || 12;
        return {
          time: `${displayHour} ${ampm}`,
          visits: hoursMap[hour]
        };
      });

    } catch (error) {
      console.error("Get Peak Hours Error:", error.message);
      return [];
    }
  },

  // 6b. Get Single Peak Hour String for a Date
  async getPeakHourForDate(date) {
    const data = await this.getPeakHoursData(date);
    if (!data || data.length === 0) return '-';
    
    const peak = data.reduce((max, current) => (current.visits > max.visits ? current : max), data[0]);
    return peak.visits > 0 ? peak.time : '-';
  },

  // 7. Get Upcoming Appointments for a Patient
  async getUpcomingAppointmentsByPatient(patientId) {
    const facilityId = Session.getFacilityId();
    // FIX: Use local date string
    const today = getLocalDateStr(new Date());
    const startOfToday = `${today}T00:00:00`;

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          appointment_id,
          appointment_date,
          status,
          procedures ( name ),
          providers ( name )
        `)
        .eq('facility_id', facilityId)
        .eq('patient_id', patientId)
        .gte('appointment_date', startOfToday)
        .neq('status', 'CANCELLED')
        .order('appointment_date', { ascending: true })
        .limit(5);

      if (error) throw error;

      return data.map(apt => ({
        id: apt.appointment_id,
        date: apt.appointment_date,
        procedure: apt.procedures?.name || 'General Checkup',
        provider: apt.providers?.name || 'Unknown Provider',
        status: apt.status
      }));
    } catch (error) {
      console.error("Get Patient Upcoming Appointments Error:", error.message);
      return [];
    }
  },

  // 8. Update Appointment
  async updateAppointment(id, updates) {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .update({
          provider_id: updates.providerId,
          procedure_id: updates.procedureId,
          operatory: updates.operatory,
          duration: parseInt(updates.duration),
          status: updates.status,
          notes: updates.notes
        })
        .eq('appointment_id', id)
        .select()
        .single();

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Update Appointment Error:", error.message);
      return { success: false, error: error.message };
    }
  }
};