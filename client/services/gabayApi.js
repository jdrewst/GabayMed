import { createClient } from '@supabase/supabase-js';
import { Session } from './session'; // Import Session Service

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

export const GabayAPI = {
  // 1. AUTH AND PROFILE

  /**
   * Registers a new user and creates their public profile.
   * @param {string} email 
   * @param {string} password 
   * @param {string} fullName 
   * @param {string} address 
   */
  // POST User
  async register(email, password, fullName, address) {
    try {
      // A. Create the Auth User (Standard Supabase Auth)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      // B. Create the Profile Entry (Linked to Auth ID)
      // We do this immediately so the user has a name in the app.
      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            {
              id: authData.user.id, // STRICTLY Link to Auth ID
              full_name: fullName,
              address: address,
              // Location defaults to null until permission granted
            }
          ]);

        if (profileError) {
          console.error("Profile Creation Failed:", profileError);
          // Optional: Rollback auth user here if strict consistency is needed
          throw profileError;
        }
      }

      return authData;
    } catch (error) {
      console.error('Registration Error:', error);
      throw error;
    }
  },

  /**
   * Log In
   * @returns {Promise<Object>} Session data
   */
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    try {
      const account = await this.getClinicAccount();
      return { ...data, account };
    } catch (accountError) {
      await supabase.auth.signOut();
      throw accountError;
    }
  },

  async getClinicAccount() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('Please sign in with a clinic account.');
    const { data: account, error: accountError } = await supabase.from('users')
      .select('id, email, role, facility_id').eq('id', user.id).single();
    if (accountError || !account?.facility_id || !['IT Admin', 'Hospital Staff'].includes(account.role)) {
      throw new Error('Your account needs an IT Admin or Hospital Staff role and a clinic assignment.');
    }
    Session.setFacilityId(account.facility_id);
    return account;
  },

  /**
   * Log Out
   */
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    localStorage.removeItem('gabay_auth');
    localStorage.removeItem('gabay_facility_id');
    localStorage.removeItem('gabay_facility_data');
  },

  /**
   * GET User Profile
   * @param {string} userId - The UUID from the auth session
   */
  async getUserProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  // 2. AI CHATBOT (Calls Vercel Backend)

  /**
   * Sends symptoms to the Llama-3 Triage endpoint.
   * @param {string} symptoms - "Chest pain", "Fever", etc.
   * @param {Object} medicalHistory - { allergies: [], chronic_conditions: [] }
   * @returns {Promise<Object>} { likely_condition, suggested_specialty, urgency_level }
   */
  async submitTriage(symptoms, medicalHistory) {
    try {
      const response = await fetch(`${API_BASE_URL}/triage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symptoms,
          medical_history: medicalHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI API Error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Triage Service Error:', error);
      throw error;
    }
  },

  // 3. GEOLOCATION ENGINE (Calls Database RPC)

  /**
   * Finds the nearest medical facilities based on specialization.
   * Uses the 'find_nearest_facilities' SQL function in Supabase.
   * @param {number} userLat 
   * @param {number} userLong 
   * @param {string} specialty - e.g. "Cardiologist" (from AI response)
   */
  async findFacilities(userLat, userLong, specialty) {
    try {
      const { data, error } = await supabase.rpc('find_nearest_facilities', {
        user_lat: userLat,
        user_long: userLong,
        specialty_query: specialty 
      });

      if (error) throw error;
      return data; // Returns array sorted by distance_km
    } catch (error) {
      console.error('Map Service Error:', error);
      return []; // Return empty list gracefully so app doesn't crash
    }
  },
  // 4. FINANCIAL TRANSPARENCY (Calls Vercel Backend)

  /**
   * Fetches the patient's billing ledger with auto-calculated transparency.
   * @param {string} patientId - Note: This is usually the UUID from the 'patients' table
   */
  async getBilling(patientId) {
    try {
      const response = await fetch(`${API_BASE_URL}/billing?patient_id=${patientId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Billing API Error: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Billing Service Error:', error);
      throw error;
    }
  },
  //GET Dashboard
  async getDashboardStats(){ // Removed facilityID param
    const facilityID = Session.getFacilityId(); // Get from Session
    const today = new Date().toISOString().split('T')[0];
    const start = `${today}T00:00:00`;
    const end = `${today}T23:59:59`;

    try{
        const [appointments, staff, income, patients]  = await Promise.all([
            // 1. Number of Appointments TODAY
            supabase
                .from('appointments')
                .select('*', {count: 'exact', head: true})
                .eq('facility_id', facilityID)
                .gte('appointment_date', start)
                .lte('appointment_date', end),

            // 2. Number of staffs
            supabase.from('providers').select('*', {count: "exact", head: true}).eq('facility_id', facilityID),
            
            // 3. Total Income (TODAY ONLY)
            // We use !inner to ensure we only get ledger entries linked to appointments at this facility
            supabase
                .from('ledger')
                .select('total_bill_amount, patients!inner(facility_id)')
                .eq('payment_status', 'PAID')
                .eq('patients.facility_id', facilityID)
                .gte('date', start) // Filter for today start
                .lte('date', end),  // Filter for today end

            // 4. Total Patients (From Patients Table)
            supabase
                .from('patients')
                .select('*', {count: 'exact', head: true})
                .eq('facility_id', facilityID)
        ]);

        // Calculate Income: Convert negative payment amounts to positive
        const totalIncome = income.data 
        ? income.data.reduce((sum, row) => sum + Math.abs(row.total_bill_amount || 0), 0): 0;

        return {
            totalPatients: patients.count || 0,
            appointmentsToday: appointments.count || 0,
            staffPresent: staff.count || 0,
            totalIncome: totalIncome
        };

    } catch (error) {
        console.error("Stats Error:", error);
        return { totalPatients: 0, appointmentsToday: 0, staffPresent: 0, totalIncome: 0 };
    }
  },

  //GET All Schedule
  async getFacilitySchedule(dateString) { // Removed facilityId param
    const facilityId = Session.getFacilityId(); // Get from Session
    //get facility schedule for the day
    const start = `${dateString}T00:00:00`;
    const end = `${dateString}T23:59:59`;

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        appointment_id,
        appointment_date,
        status,
        patients ( full_name ), 
        procedures ( name ),
        providers ( name, specialization )
      `)
      .eq('facility_id', facilityId) 
      .gte('appointment_date', start)
      .lte('appointment_date', end)
      .order('appointment_date', { ascending: true });

    if (error) throw error;
    return data;
  },

  //GET Upcoming Schedule
  async getUpcomingSchedule(dateString) { // Removed facilityId param
    const facilityId = Session.getFacilityId(); // Get from Session
    
    const startDate = new Date(dateString);
    const futureDate = new Date(startDate);
    futureDate.setDate(startDate.getDate() + 5); 

    const start = `${dateString}T00:00:00`;
    const end = `${futureDate.toISOString().split('T')[0]}T23:59:59`;

    const { data, error } = await supabase
      .from('appointments')
      .select('appointment_date')
      .eq('facility_id', facilityId)
      .gte('appointment_date', start)
      .lte('appointment_date', end);

    if (error) throw error;
    const result = [];
    
    // Loop through the next 5 days to ensure even days with 0 appointments are returned
    for (let i = 0; i < 5; i++) {
        const current = new Date(startDate);
        current.setDate(startDate.getDate() + i);
        
        const dateKey = current.toISOString().split('T')[0]; 
        
        const count = data.filter(appt => 
            appt.appointment_date.startsWith(dateKey)
        ).length;

        result.push({
            date: dateKey,
            count: count,
            day: current.toLocaleDateString('en-US', { weekday: 'short' })
        });
    }

    return result;
  },

  //GET Patients
  async getPatients() { // Removed facilityId param
    const facilityId = Session.getFacilityId(); // Get from Session
    try {
      // 1. Fetch ALL patients linked to this facility
      // REMOVED: .eq('appointments.status', 'COMPLETED') to prevent hiding patients
      const { data, error } = await supabase
        .from('patients')
        .select(`
          patient_id,
          full_name,
          age,
          date_of_birth,
          gender,
          appointments (
            appointment_date,
            status
          )
        `)
        .eq('facility_id', facilityId);

      if (error) throw error;

      // 2. Process data
      const patientsList = data.map(patient => {
        
        // A. Calculate Age
        let age = patient.age || 'N/A';
        if (patient.date_of_birth) {
            const dob = new Date(patient.date_of_birth);
            const diff_ms = Date.now() - dob.getTime();
            const age_dt = new Date(diff_ms);
            age = Math.abs(age_dt.getUTCFullYear() - 1970);
        }

        // B. Find Latest Visit Date (Client-side filtering)
        let lastVisit = 'N/A';
        if (patient.appointments && patient.appointments.length > 0) {
            // Filter for COMPLETED appointments here in JS
            const completedAppts = patient.appointments.filter(a => a.status === 'COMPLETED');
            
            if (completedAppts.length > 0) {
                const sortedAppts = completedAppts.sort((a, b) => 
                    new Date(b.appointment_date) - new Date(a.appointment_date)
                );
                lastVisit = sortedAppts[0].appointment_date;
            }
        }

        return {
          user_id: patient.patient_id,
          full_name: patient.full_name || 'Unknown',
          age: age,
          gender: patient.gender || 'N/A',
          date_of_birth: patient.date_of_birth,
          visit_date: lastVisit 
        };
      });

      return {
        count: patientsList.length,
        patients: patientsList
      };

    } catch (error) {
      console.error("Get Patients Error:", error);
      return { count: 0, patients: [] };
    }
  },

  // GET Insurance Carriers
  async getCarriers() {
    try {
      // We select carrier details and the actual insurance plans data
      const { data, error } = await supabase
        .from('carrier')
        .select(`
          carrier_id,
          name,
          street_address,
          status,
          type,
          insurance_plans (
            insurance_id,
            plan_name
          )
        `);

      if (error) throw error;

      // Transform the data to a flat structure for the UI
      return data.map(carrier => ({
        id: carrier.carrier_id,
        name: carrier.name,
        address: carrier.street_address,
        status: carrier.status,
        type: carrier.type,
        // 1. The Count (Calculated from the array length)
        plans: carrier.insurance_plans?.length || 0,
        // 2. The Actual Data (Array of plans)
        insurance_plans: carrier.insurance_plans || []
      }));

    } catch (error) {
      console.error("Get Carriers Error:", error);
      return [];
    }
  },

  // GET Insurance Plans for Dropdown
  async getInsurancePlans() {
    try {
      const { data, error } = await supabase
        .from('insurance_plans')
        .select(`
          insurance_id,
          plan_name,
          carrier ( name )
        `);

      if (error) throw error;

      return data.map(plan => ({
        id: plan.insurance_id,
        name: plan.plan_name,
        carrier: plan.carrier?.name
      }));

    } catch (error) {
      console.error("Get Plans Error:", error);
      return [];
    }
  },

  // ADD Patient Insurance
  async addPatientInsurance(patientId, planData) {
    try {
      const { error } = await supabase
        .from('patient_insurance')
        .insert([{
          patient_id: patientId,
          insurance_id: planData.planId,
          subscriber_id: planData.subscriberId,
          coverage_type: planData.coverageType,
          coverage_start_date: planData.coverageStartDate,
          coverage_end_date: planData.coverageEndDate,
          notes: planData.notes,
          status: 'active'
        }]);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Add Insurance Error:", error.message);
      return { success: false, error: error.message };
    }
  }
};