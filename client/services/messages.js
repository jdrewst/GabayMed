import { createClient } from '@supabase/supabase-js';
import { Session } from './session'; // Import Session service

// Helper to get env vars
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
const supabase = createClient(supabaseUrl, supabaseKey);
let subscriptionId = 0;

const branchAliases = new Map([['MAIN', 'main'], ['QC', 'branch-qc'], ['KAT', 'branch-katipunan']]);

export function getMessageBranchKey(branch) {
  return branchAliases.get(branch?.abbreviation?.toUpperCase()) ?? branch?.branch_id;
}

function mapBranchMessage(row) {
  return {
    id: row.id,
    senderBranch: row.sender_branch,
    isRead: row.is_read,
    text: row.content,
    timestamp: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
}

export const messagesAPI = {

  async getUnreadCount(branchKey) {
    const facilityId = Session.getFacilityId();
    const [patients, branches] = await Promise.all([
      supabase.from('messages').select('id, patients!inner(facility_id)', { head: true, count: 'exact' })
        .eq('patients.facility_id', facilityId).eq('branch_key', branchKey).eq('sender_type', 'patient').eq('is_read', false),
      supabase.from('branch_messages').select('id', { head: true, count: 'exact' })
        .eq('facility_id', facilityId).eq('recipient_branch', branchKey).eq('is_read', false),
    ]);
    if (patients.error) throw patients.error;
    return (patients.count ?? 0) + (branches.count ?? 0);
  },

  watchUnread(branchKey, refresh) {
    const channel = supabase.channel(`staff-unread-messages:${++subscriptionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `branch_key=eq.${branchKey}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branch_messages', filter: `recipient_branch=eq.${branchKey}` }, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    const fallback = setInterval(refresh, 10000);
    return () => {
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  },

  async markBranchAsRead(branchKey, otherBranchKey, ids) {
    if (!ids.length) return;
    const { error } = await supabase.from('branch_messages').update({ is_read: true })
      .eq('facility_id', Session.getFacilityId()).eq('recipient_branch', branchKey)
      .eq('sender_branch', otherBranchKey).eq('is_read', false).in('id', ids);
    if (error) throw error;
  },

  async getBranchMessages(branchKey, otherBranchKey) {
    const pair = [branchKey, otherBranchKey];
    const { data, error } = await supabase.from('branch_messages')
      .select('id, sender_branch, content, created_at, is_read')
      .eq('facility_id', Session.getFacilityId())
      .in('sender_branch', pair)
      .in('recipient_branch', pair)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    return data.map(mapBranchMessage);
  },

  async sendBranchMessage(branchKey, otherBranchKey, text) {
    const { data, error } = await supabase.from('branch_messages')
      .insert({ facility_id: Session.getFacilityId(), sender_branch: branchKey, recipient_branch: otherBranchKey, content: text })
      .select('id, sender_branch, content, created_at')
      .single();
    if (error) throw error;
    return { success: true, message: mapBranchMessage(data) };
  },
  
  async getConversations(branchKey) {
    const facilityId = Session.getFacilityId();
    const { data: patients, error: patientsError } = await supabase
      .from('patients')
      .select('patient_id, profile_id, full_name, first_name, middle_name, last_name')
      .eq('facility_id', facilityId);

    if (patientsError) throw patientsError;
    if (!patients.length) return [];

    const profileIds = [...new Set(patients.map(patient => patient.profile_id).filter(Boolean))];
    const [messageResult, profileResult] = await Promise.all([
      supabase.from('messages')
        .select('patient_id, content, created_at, is_read, sender_type')
        .in('patient_id', patients.map(patient => patient.patient_id))
        .eq('branch_key', branchKey)
        .order('created_at', { ascending: false }),
      profileIds.length ? supabase.from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', profileIds) : { data: [] },
    ]);

    const latestMessages = new Map();
    for (const message of messageResult.data || []) {
      if (!latestMessages.has(message.patient_id)) latestMessages.set(message.patient_id, message);
    }

    const profiles = new Map((profileResult.data || []).map(profile => [profile.id, profile]));
    return patients.map(patient => {
      const lastMessage = latestMessages.get(patient.patient_id);
      const profile = profiles.get(patient.profile_id);
      const structuredName = [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ');
      const patientName = (patient.full_name !== 'Unknown' && patient.full_name?.trim())
        || structuredName || profile?.full_name?.trim() || 'Unknown Patient';
      const rawTimestamp = lastMessage?.created_at || '';
      let timestamp = '';
      if (rawTimestamp) {
        const minutes = Math.floor((Date.now() - Date.parse(rawTimestamp)) / 60000);
        if (minutes < 1) timestamp = 'Just now';
        else if (minutes < 60) timestamp = `${minutes} min ago`;
        else if (minutes < 1440) timestamp = `${Math.floor(minutes / 60)} hours ago`;
        else timestamp = `${Math.floor(minutes / 1440)} days ago`;
      }

      return {
        id: patient.patient_id,
        patientName,
        avatar: profile?.avatar_url || null,
        initials: patientName.split(/\s+/).slice(0, 2).map(name => name[0]).join('').toUpperCase(),
        lastMessage: lastMessage?.content || '',
        timestamp,
        unread: lastMessage?.sender_type === 'patient' && !lastMessage.is_read,
        rawTimestamp,
      };
    }).sort((a, b) => b.rawTimestamp.localeCompare(a.rawTimestamp) || a.patientName.localeCompare(b.patientName));
  },

  // 2. Get Messages for a specific conversation
  async getMessages(patientId, branchKey) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('patient_id', patientId)
        .eq('branch_key', branchKey)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return data.map(msg => ({
        id: msg.id,
        sender: msg.sender_type, // 'staff' or 'patient'
        text: msg.content,
        timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: msg.is_read
      }));

    } catch (error) {
      console.error("Get Messages Error:", error);
      throw error;
    }
  },

  // 3. Send a Message
  async sendMessage(patientId, branchKey, text) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([{
          patient_id: patientId,
          content: text,
          sender_type: 'staff',
          branch_key: branchKey
        }])
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        message: {
          id: data.id,
          sender: data.sender_type,
          text: data.content,
          timestamp: new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      };
    } catch (error) {
      console.error("Send Message Error:", error);
      return { success: false, error: error.message };
    }
  },

  // 4. Mark messages as read
  async markAsRead(patientId, branchKey) {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('patient_id', patientId)
        .eq('branch_key', branchKey)
        .eq('sender_type', 'patient') // Only mark patient messages as read
        .eq('is_read', false);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Mark Read Error:", error);
      return { success: false };
    }
  }
};
