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

export const messagesAPI = {
  
  // Helper: Resolve all sibling patient_ids belonging to the same user profile in this facility
  async _resolvePatientGroupIds(patientId) {
    try {
      const facilityId = Session.getFacilityId();
      const { data: targetRow } = await supabase
        .from('patients')
        .select('patient_id, profile_id, facility_id')
        .eq('patient_id', patientId)
        .maybeSingle();

      if (!targetRow?.profile_id) return [patientId];

      let query = supabase
        .from('patients')
        .select('patient_id')
        .eq('profile_id', targetRow.profile_id);

      const facId = facilityId || targetRow.facility_id;
      if (facId) {
        query = query.eq('facility_id', facId);
      }

      const { data: siblings } = await query;
      const ids = (siblings || []).map(r => r.patient_id).filter(Boolean);
      return ids.length > 0 ? ids : [patientId];
    } catch {
      return [patientId];
    }
  },

  // 1. Get Conversations (List of patients with their last message)
  // Consolidates multiple patient rows sharing the same profile_id so mobile & HIS always share one thread
  async getConversations() {
    try {
      let facilityId = Session.getFacilityId();
      if (!facilityId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            const { data: acct } = await supabase
              .from('users')
              .select('facility_id')
              .eq('id', user.id)
              .maybeSingle();
            if (acct?.facility_id) {
              facilityId = acct.facility_id;
              Session.setFacilityId(facilityId);
            }
          }
        } catch (_) {}
      }

      if (!facilityId) {
        console.warn("getConversations: No facilityId found in Session");
        return [];
      }

      // Step 1: Get all patients linked to this facility
      const { data: facilityPatients, error: patientsError } = await supabase
        .from('patients')
        .select(`
          patient_id,
          profile_id,
          full_name,
          first_name,
          middle_name,
          last_name,
          profiles ( id, full_name, first_name, middle_name, last_name, avatar_url )
        `)
        .eq('facility_id', facilityId);

      if (patientsError) throw patientsError;
      if (!facilityPatients || facilityPatients.length === 0) return [];

      const validPatientIds = facilityPatients.map(p => p.patient_id);

      // Step 2: Fetch messages for all patient rows in this facility
      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          id,
          patient_id,
          content,
          created_at,
          is_read,
          sender_type
        `)
        .in('patient_id', validPatientIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group patient records by profile_id (or patient_id if unlinked)
      const patientById = new Map(facilityPatients.map(p => [String(p.patient_id), p]));
      const groupKeyForPatient = (p) => (p.profile_id ? `profile:${p.profile_id}` : `patient:${p.patient_id}`);

      const groups = new Map();
      for (const p of facilityPatients) {
        const key = groupKeyForPatient(p);
        if (!groups.has(key)) {
          groups.set(key, {
            canonicalPatient: p,
            patientIds: [p.patient_id],
            latestMsg: null,
          });
        } else {
          groups.get(key).patientIds.push(p.patient_id);
        }
      }

      // Attach the newest message across any sibling patient_id in each group
      for (const msg of messages || []) {
        const pat = patientById.get(String(msg.patient_id));
        if (!pat) continue;
        const key = groupKeyForPatient(pat);
        const group = groups.get(key);
        if (group && !group.latestMsg) {
          group.latestMsg = msg;
          // Prefer the patient row that received the latest message as canonical id
          group.canonicalPatient = pat;
        }
      }

      // Build conversation list for groups that have at least one message
      const conversations = [];
      for (const group of groups.values()) {
        if (!group.latestMsg) continue;
        const p = group.canonicalPatient;
        const lastMsg = group.latestMsg;
        const profile = p.profiles;

        const fullName =
          [
            profile?.first_name ?? p.first_name,
            profile?.middle_name ?? p.middle_name,
            profile?.last_name ?? p.last_name,
          ]
            .filter(Boolean)
            .join(' ') ||
          profile?.full_name ||
          p.full_name ||
          'Unknown Patient';

        const date = new Date(lastMsg.created_at);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        let timestamp = '';
        if (diffMins < 1) timestamp = 'Just now';
        else if (diffMins < 60) timestamp = `${diffMins} min ago`;
        else if (diffHours < 24) timestamp = `${diffHours} hours ago`;
        else timestamp = `${diffDays} days ago`;

        conversations.push({
          id: p.patient_id,
          patientIds: group.patientIds,
          patientName: fullName,
          avatar: profile?.avatar_url || null,
          initials: (fullName || 'U')
            .split(' ')
            .filter(Boolean)
            .map(n => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase(),
          lastMessage: lastMsg.content,
          timestamp,
          unread: !lastMsg.is_read && lastMsg.sender_type === 'patient',
          rawTimestamp: lastMsg.created_at,
        });
      }

      return conversations.sort((a, b) => new Date(b.rawTimestamp) - new Date(a.rawTimestamp));
    } catch (error) {
      console.error("Get Conversations Error:", error);
      return [];
    }
  },

  // 2. Get Messages for a specific conversation (merges messages across all sibling patient_ids for that user)
  async getMessages(patientId) {
    try {
      const groupIds = await this._resolvePatientGroupIds(patientId);

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .in('patient_id', groupIds)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map(msg => ({
        id: msg.id,
        sender: msg.sender_type, // 'staff' or 'patient'
        text: msg.content,
        timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: msg.is_read
      }));

    } catch (error) {
      console.error("Get Messages Error:", error);
      return [];
    }
  },

  // 3. Send a Message
  async sendMessage(patientId, text, senderType = 'staff') {
    try {
      const { data: rows, error } = await supabase
        .from('messages')
        .insert([{
          patient_id: patientId,
          content: text,
          sender_type: senderType,
          is_read: false
        }])
        .select();

      if (error) throw error;
      const data = Array.isArray(rows) && rows.length > 0 ? rows[0] : {
        id: Date.now(),
        sender_type: senderType,
        content: text,
        created_at: new Date().toISOString()
      };

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
  async markAsRead(patientId) {
    try {
      const groupIds = await this._resolvePatientGroupIds(patientId);
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .in('patient_id', groupIds)
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
