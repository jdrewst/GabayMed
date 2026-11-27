import { supabase } from '../lib/supabase';
import Session from './session';

const MessagesAPI = {
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
            name,
            image_url
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

      // C. Group/Map messages to Facilities
      const conversations = [];
      
      // Create a map of patient_id -> facility details
      const facilityMap = {};
      patientRecords.forEach(p => {
        facilityMap[p.patient_id] = p.facilities;
      });

      // Track processed patient_ids to avoid duplicates (we only want the latest message per facility)
      const processedPatientIds = new Set();

      messages.forEach(msg => {
        if (!processedPatientIds.has(msg.patient_id)) {
          const facility = facilityMap[msg.patient_id];
          
          if (facility) {
            // Calculate relative time
            const date = new Date(msg.created_at);
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
              id: msg.patient_id, // We use patient_id as the conversation ID (unique per facility-user pair)
              facilityId: patientRecords.find(p => p.patient_id === msg.patient_id)?.facility_id,
              name: facility.name || 'Unknown Facility',
              avatar: facility.image_url || null,
              initials: (facility.name || 'U').charAt(0).toUpperCase(),
              lastMessage: msg.content,
              timestamp: timestamp,
              unread: !msg.is_read && msg.sender_type === 'staff', // Unread if from staff and not read
              rawTimestamp: msg.created_at
            });
            
            processedPatientIds.add(msg.patient_id);
          }
        }
      });

      for (const patient of patientRecords) {
        if (processedPatientIds.has(patient.patient_id) || !patient.facilities) continue;
        conversations.push({
          id: patient.patient_id,
          facilityId: patient.facility_id,
          name: patient.facilities.name || 'Unknown Facility',
          avatar: patient.facilities.image_url || null,
          lastMessage: '',
          timestamp: '',
          unread: false,
        });
      }
      return conversations;

    } catch (error) {
      console.error("Get Conversations Error:", error);
      throw error;
    }
  },

  // 2. Get Messages for a specific conversation (using patient_id as conversation ID)
  async getMessages(patientId) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('patient_id', patientId)
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
      return [];
    }
  },

  // 3. Send a Message
  async sendMessage(patientId, text) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([{
          patient_id: patientId,
          content: text,
          sender_type: 'patient', // Always 'patient' from user app
          is_read: false
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
  async markAsRead(patientId) {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('patient_id', patientId)
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
