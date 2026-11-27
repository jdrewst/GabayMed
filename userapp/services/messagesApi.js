import { supabase } from '../lib/supabase';
import Session from './session';

let subscriptionId = 0;

async function insertMessageOnce(table, record) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const result = await supabase.from(table).insert(record).select().abortSignal(controller.signal).single();
    // An earlier request may have committed before its response reached the sender.
    const { content, ...identity } = record;
    const { data, error } = result.error?.code === '23505'
      ? await supabase.from(table).select().match(identity).abortSignal(controller.signal).single()
      : result;
    if (error) throw error;
    if (data?.content !== content) throw new Error('Message could not be verified.');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const MessagesAPI = {
  subscribeToMessages(refresh, { patientId, branchKey, includeReadUpdates = false } = {}) {
    let active = true;
    const reload = () => { if (active) refresh(); };
    const changes = { event: includeReadUpdates ? '*' : 'INSERT', schema: 'public', table: 'messages' };
    if (patientId) changes.filter = `patient_id=eq.${patientId}`;

    const channel = supabase.channel(`patient-messages:${++subscriptionId}`)
      .on('postgres_changes', changes, ({ new: message }) => {
        if (!branchKey || message.branch_key === branchKey) reload();
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') reload();
      });

    reload();
    // Catch up if the socket is reconnecting or Realtime is unavailable.
    const fallback = setInterval(reload, 10000);
    return () => {
      active = false;
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  },

  async getUnreadCount() {
    const profileId = Session.getUserId();
    if (!profileId) return 0;
    const { count, error } = await supabase.from('messages')
      .select('id, patients!inner(profile_id)', { head: true, count: 'exact' })
      .eq('patients.profile_id', profileId).eq('sender_type', 'staff').eq('is_read', false);
    if (error) throw error;
    return count ?? 0;
  },

  // 1. Get Conversations (Grouped by Facility)
  async getConversations() {
    try {
      const userId = Session.getUserId();
      if (!userId) return [];

      // A. Get all patient records for this user to identify which facilities they are connected to
      const { data: patientRecords, error: patientError } = await supabase
        .from('patients')
        .select(`
          patient_id,
          facility_id,
          facilities (
            name
          )
        `)
        .eq('profile_id', userId);
      const [{ data: patientRecords, error: patientError }, { data: appointmentsData }] = await Promise.all([
        supabase
          .from('patients')
          .select(`
            patient_id,
            facility_id,
            created_at,
            facilities (
              facility_id,
              name,
              image_url
            )
          `)
          .eq('profile_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('appointments')
          .select('patient_id, appointment_id')
      ]);

      if (patientError) throw patientError;
      if (!patientRecords || patientRecords.length === 0) return [];

      // Count appointments per patient_id so we pick the canonical patient_id per facility (matching HIS deduplication)
      const apptCountByPatient = {};
      (appointmentsData || []).forEach(a => {
        if (a.patient_id) {
          apptCountByPatient[a.patient_id] = (apptCountByPatient[a.patient_id] || 0) + 1;
        }
      });

      // Group patientRecords by facility_id
      const facilityGroups = new Map();
      patientRecords.forEach(p => {
        const facId = p.facility_id || `unassigned-${p.patient_id}`;
        if (!facilityGroups.has(facId)) {
          facilityGroups.set(facId, {
            facilityId: p.facility_id,
            facility: p.facilities,
            patientIds: [],
            canonicalPatientId: p.patient_id,
          });
        }
        const group = facilityGroups.get(facId);
        group.patientIds.push(p.patient_id);

        const currCount = apptCountByPatient[p.patient_id] || 0;
        const bestCount = apptCountByPatient[group.canonicalPatientId] || 0;
        if (currCount > bestCount) {
          group.canonicalPatientId = p.patient_id;
        }
      });

      const allPatientIds = patientRecords.map(p => p.patient_id);

      // B. Fetch all messages across all patient IDs belonging to this user
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .in('patient_id', allPatientIds)
        .order('created_at', { ascending: false });

      if (msgError) throw msgError;

      // Map each patient_id to its facility group key
      const patientToFacKey = {};
      for (const [facKey, group] of facilityGroups.entries()) {
        group.patientIds.forEach(pid => {
          patientToFacKey[pid] = facKey;
        });
      }

      // Find latest message per facility group
      const latestMsgByFacKey = new Map();
      (messages || []).forEach(msg => {
        const facKey = patientToFacKey[msg.patient_id];
        if (facKey && !latestMsgByFacKey.has(facKey)) {
          latestMsgByFacKey.set(facKey, msg);
        }
      });

      // C. Build one conversation entry per facility (including linked facilities with no prior messages yet)
      const conversations = [];

      for (const [facKey, group] of facilityGroups.entries()) {
        const facility = group.facility;
        if (!facility) continue;

        const msg = latestMsgByFacKey.get(facKey) || null;
        let timestamp = '';
        if (msg?.created_at) {
          const date = new Date(msg.created_at);
          const now = new Date();
          const diffMs = now - date;
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMins / 60);
          const diffDays = Math.floor(diffHours / 24);

          if (diffMins < 1) timestamp = 'Just now';
          else if (diffMins < 60) timestamp = `${diffMins} min ago`;
          else if (diffHours < 24) timestamp = `${diffHours} hours ago`;
          else timestamp = `${diffDays} days ago`;
        }

        conversations.push({
          id: group.canonicalPatientId,
          patientIds: group.patientIds,
          facilityId: group.facilityId,
          name: facility.name || 'Healthcare Facility',
          avatar: facility.image_url || null,
          initials: (facility.name || 'H').charAt(0).toUpperCase(),
          lastMessage: msg ? msg.content : 'Tap to start a conversation with the clinic',
          timestamp,
          unread: msg ? (!msg.is_read && msg.sender_type === 'staff') : false,
          rawTimestamp: msg?.created_at || '1970-01-01T00:00:00Z',
        });
      }

      return conversations.sort((a, b) => new Date(b.rawTimestamp) - new Date(a.rawTimestamp));

    } catch (error) {
      console.error("Get Conversations Error:", error);
      throw error;
    }
  },

  // 2. Get Messages for a specific conversation (using patient_id as conversation ID)
  async getMessages(patientId, branchKey) {
  // Helper: Resolve all sibling patient_ids for the same user & facility as the given patientId
  async _resolveFacilityPatientIds(patientId) {
    try {
      const userId = Session.getUserId();
      if (!userId) return [patientId];

      const { data: targetRow } = await supabase
        .from('patients')
        .select('patient_id, facility_id, profile_id')
        .eq('patient_id', patientId)
        .maybeSingle();

      if (!targetRow?.facility_id) return [patientId];

      const { data: siblingRows } = await supabase
        .from('patients')
        .select('patient_id')
        .eq('profile_id', targetRow.profile_id || userId)
        .eq('facility_id', targetRow.facility_id);

      const ids = (siblingRows || []).map(r => r.patient_id).filter(Boolean);
      return ids.length > 0 ? ids : [patientId];
    } catch {
      return [patientId];
    }
  },

  // 2. Get Messages for a specific conversation (merges messages across all sibling patient_ids for that facility)
  async getMessages(patientId) {
    try {
      const targetIds = await this._resolveFacilityPatientIds(patientId);

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('patient_id', patientId)
        .eq('branch_key', branchKey)
        .in('patient_id', targetIds)
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
      throw error;
    }
  },

  // 3. Send a Message
  async sendMessage(patientId, branchKey, text, id) {
    const data = await insertMessageOnce('messages', {
      id, patient_id: patientId, branch_key: branchKey, content: text, sender_type: 'patient',
    });
    return {
      success: true,
      message: {
        id: data.id,
        sender: data.sender_type,
        text: data.content,
        timestamp: new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    };
  async sendMessage(patientId, text) {
    try {
      const { data: rows, error } = await supabase
        .from('messages')
        .insert([{
          patient_id: patientId,
          content: text,
          sender_type: 'patient', // Always 'patient' from user app
          is_read: false
        }])
        .select();

      if (error) throw error;
      const data = Array.isArray(rows) && rows.length > 0 ? rows[0] : {
        id: Date.now(),
        sender_type: 'patient',
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
  async markAsRead(patientId, branchKey) {
    try {
      const targetIds = await this._resolveFacilityPatientIds(patientId);
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('patient_id', patientId)
        .eq('branch_key', branchKey)
        .in('patient_id', targetIds)
        .eq('sender_type', 'staff') // Only mark staff messages as read
        .eq('is_read', false);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error("Mark Read Error:", error);
      return { success: false };
    }
  }
};

export default MessagesAPI;
