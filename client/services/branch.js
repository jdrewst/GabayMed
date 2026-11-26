import { createClient } from '@supabase/supabase-js';
import { Session } from './session.js';

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL');
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');
const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

// Built-in default branches representing the facility's branch network
export const DEFAULT_BRANCHES = [
  {
    branch_id: 'branch-katipunan',
    name: 'Katipunan Branch',
    abbreviation: 'KAT',
    address: '324 Katipunan Ave, Loyola Heights, Quezon City',
    contact_num: '+63 2 8920 1234',
    email: 'katipunan@gabaymed.ph',
    is_active: true,
    timezone: 'Asia/Manila',
    operating_hours: 'Mon - Sat: 8:00 AM - 6:00 PM',
    default_rooms: [
      { room_id: 'room-kat-101', code: 'KAT-101', name: 'Room 101 (Katipunan - Consultation)', floor: '1st Floor' },
      { room_id: 'room-kat-102', code: 'KAT-102', name: 'Room 102 (Katipunan - Examination)', floor: '1st Floor' },
      { room_id: 'room-kat-103', code: 'KAT-103', name: 'Room 103 (Katipunan - Dental Suite)', floor: '2nd Floor' },
      { room_id: 'room-kat-104', code: 'KAT-104', name: 'Room 104 (Katipunan - Triage & Vitals)', floor: 'Ground Floor' }
    ]
  },
  {
    branch_id: 'branch-qc',
    name: 'QC Branch',
    abbreviation: 'QC',
    address: 'East Avenue, Diliman, Quezon City',
    contact_num: '+63 2 8928 5678',
    email: 'qc@gabaymed.ph',
    is_active: true,
    timezone: 'Asia/Manila',
    operating_hours: 'Mon - Sun: 7:00 AM - 8:00 PM',
    default_rooms: [
      { room_id: 'room-qc-201', code: 'QC-201', name: 'Room 201 (QC - General Clinic)', floor: '1st Floor' },
      { room_id: 'room-qc-202', code: 'QC-202', name: 'Room 202 (QC - Minor Procedure)', floor: '2nd Floor' },
      { room_id: 'room-qc-203', code: 'QC-203', name: 'Room 203 (QC - Diagnostics & Lab)', floor: 'Ground Floor' },
      { room_id: 'room-qc-204', code: 'QC-204', name: 'Room 204 (QC - Specialty Suite)', floor: '3rd Floor' }
    ]
  }
];

export const branchAPI = {
  /**
   * Fetch all branches for the logged-in clinic facility.
   * Merges database branches with default Katipunan and QC branches.
   */
  async getBranches() {
    let facilityId = null;
    try {
      facilityId = Session.getFacilityId();
    } catch {}

    let dbBranches = [];
    if (facilityId && supabaseUrl && supabaseKey) {
      try {
        const { data, error } = await supabase
          .from('clinic_branches')
          .select('*')
          .eq('facility_id', facilityId)
          .order('name');
        if (!error && Array.isArray(data) && data.length > 0) {
          dbBranches = data;
        }
      } catch (err) {
        console.warn('Could not fetch clinic_branches from Supabase:', err?.message);
      }
    }

    // Merge DB branches with default Katipunan and QC branches so both are always available
    const merged = [...DEFAULT_BRANCHES];
    for (const dbBranch of dbBranches) {
      const existingIdx = merged.findIndex(
        b => b.branch_id === dbBranch.branch_id ||
             b.abbreviation.toLowerCase() === (dbBranch.abbreviation || '').toLowerCase() ||
             b.name.toLowerCase() === (dbBranch.name || '').toLowerCase()
      );
      if (existingIdx >= 0) {
        merged[existingIdx] = { ...merged[existingIdx], ...dbBranch };
      } else {
        merged.push({
          ...dbBranch,
          default_rooms: [
            { room_id: `${dbBranch.branch_id}-101`, code: `${dbBranch.abbreviation || 'RM'}-101`, name: `Room 101 (${dbBranch.name})` },
            { room_id: `${dbBranch.branch_id}-102`, code: `${dbBranch.abbreviation || 'RM'}-102`, name: `Room 102 (${dbBranch.name})` }
          ]
        });
      }
    }

    return merged;
  },

  /**
   * Get rooms specifically configured for a given branch.
   */
  async getRoomsForBranch(branchId, allBranches = DEFAULT_BRANCHES) {
    if (!branchId || branchId === 'all') {
      // Return rooms from all active branches
      return allBranches.flatMap(b => (b.default_rooms || []).map(r => ({ ...r, branchName: b.name, branchId: b.branch_id })));
    }

    // Try fetching from operatory_rooms table if available
    let facilityId = null;
    try { facilityId = Session.getFacilityId(); } catch {}

    if (facilityId && supabaseUrl && supabaseKey) {
      try {
        const { data, error } = await supabase
          .from('operatory_rooms')
          .select('*')
          .eq('facility_id', facilityId)
          .eq('branch_id', branchId);
        if (!error && Array.isArray(data) && data.length > 0) {
          return data.map(r => ({
            room_id: r.room_id,
            code: r.code,
            name: `${r.name} (${r.code})`,
            floor: r.floor_location,
            branchId: r.branch_id
          }));
        }
      } catch {}
    }

    // Fall back to branch default rooms
    const branch = allBranches.find(
      b => b.branch_id === branchId ||
           b.abbreviation.toLowerCase() === branchId.toLowerCase() ||
           b.name.toLowerCase().includes(branchId.toLowerCase().replace(/-branch$/, ''))
    );

    if (branch && branch.default_rooms) {
      return branch.default_rooms.map(r => ({ ...r, branchName: branch.name, branchId: branch.branch_id }));
    }

    return [
      { room_id: `${branchId}-room-101`, code: '101', name: `Room 101 (${branch?.name || 'Selected Branch'})` },
      { room_id: `${branchId}-room-102`, code: '102', name: `Room 102 (${branch?.name || 'Selected Branch'})` }
    ];
  },

  /**
   * Get the current active branch ID from URL query or localStorage.
   */
  getActiveBranchId() {
    if (typeof window === 'undefined') return 'all';
    
    // Check URL search parameters first (?branch=katipunan or ?branch=qc or ?branch=all)
    try {
      const params = new URLSearchParams(window.location.search);
      const urlBranch = params.get('branch');
      if (urlBranch) {
        const normalized = urlBranch.toLowerCase();
        if (normalized === 'katipunan' || normalized === 'kat') return 'branch-katipunan';
        if (normalized === 'qc' || normalized === 'quezon') return 'branch-qc';
        return urlBranch;
      }
    } catch {}

    // Fall back to localStorage
    const saved = localStorage.getItem('gabay_selected_branch');
    if (saved) return saved;

    return 'all';
  },

  /**
   * Save the active branch ID and dispatch an update event.
   */
  setActiveBranchId(branchId) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('gabay_selected_branch', branchId);

    // Update URL query parameter seamlessly
    try {
      const url = new URL(window.location.href);
      if (branchId === 'all') {
        url.searchParams.delete('branch');
      } else {
        const slug = branchId.replace(/^branch-/, '');
        url.searchParams.set('branch', slug);
      }
      window.history.replaceState({}, '', url.toString());
    } catch {}

    window.dispatchEvent(new CustomEvent('branchChanged', { detail: { branchId } }));
  }
};
