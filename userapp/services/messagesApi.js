import { supabase } from '../lib/supabase';
import Session from './session';

let subscriptionId = 0;

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

      if (patientError) throw patientError;
      if (!patientRecords || patientRecords.length === 0) return [];

      const patientIds = patientRecords.map(p => p.patient_id);

      // B. Fetch all messages for these patient IDs
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .in('patient_id', patientIds)
        .order('created_at', { ascending: false });

      if (msgError) throw msgError;

      const patients = new Map(patientRecords.map(patient => [patient.patient_id, patient]));
      const branchNames = new Map([
        ['main', 'Main'],
        ['branch-qc', 'QC Branch'],
        ['branch-katipunan', 'Katipunan Branch'],
      ]);
      const extraBranches = [...new Set(messages.map(message => message.branch_key))]
        .filter(key => key && !branchNames.has(key));
      if (extraBranches.length) {
        const { data: branches } = await supabase.from('clinic_branches')
          .select('branch_id, name').in('branch_id', extraBranches);
        for (const branch of branches || []) branchNames.set(String(branch.branch_id), branch.name);
      }

      const conversations = new Map();
      function addConversation(patient, branchKey, message) {
        if (!patient) return;
        const id = `${patient.patient_id}:${branchKey}`;
        if (conversations.has(id)) {
          if (message?.sender_type === 'staff' && !message.is_read) conversations.get(id).unread = true;
          return;
        }

        const name = patient.facilities?.name || 'Linked clinic';
        const branchName = branchNames.get(branchKey) || 'Clinic branch';
        conversations.set(id, {
          id,
          patientId: patient.patient_id,
          branchKey,
          name,
          branchName,
          lastMessage: message?.content || '',
          timestamp: message ? new Date(message.created_at).toLocaleDateString() : '',
          unread: message?.sender_type === 'staff' && !message.is_read,
        });
      }

      for (const message of messages) {
        addConversation(patients.get(message.patient_id), message.branch_key, message);
      }
      for (const patient of patientRecords) addConversation(patient, 'main');

      return [...conversations.values()];

    } catch (error) {
      console.error("Get Conversations Error:", error);
      throw error;
    }
  },

  // 2. Get Messages for a specific conversation (using patient_id as conversation ID)
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
          branch_key: branchKey,
          content: text,
          sender_type: 'patient' // Always 'patient' from user app
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
