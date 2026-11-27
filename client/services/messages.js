import { supabase } from './gabayApi';
import { Session } from './session';

let subscriptionId = 0;

const branchAliases = new Map([['MAIN', 'main'], ['QC', 'branch-qc'], ['KAT', 'branch-katipunan']]);

export function getMessageBranchKey(branch) {
  return branchAliases.get(branch?.abbreviation?.toUpperCase()) ?? branch?.branch_id ?? 'main';
}

function mapBranchMessage(row) {
  return {
    id: row.id,
    senderBranch: row.sender_branch,
    isRead: row.is_read,
    text: row.content,
    timestamp: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

function formatRelativeTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}

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

export const messagesAPI = {
  // Count unread incoming messages (patient + inter-branch) for the active branch
  async getUnreadCount(branchKey = 'main') {
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
      if (!facilityId) return 0;

      const effectiveBranch = branchKey || 'main';
      const { data: facilityPatients } = await supabase
        .from('patients')
        .select('patient_id')
        .eq('facility_id', facilityId);

      const patientIds = (facilityPatients || []).map(p => p.patient_id);
      let patientUnread = 0;

      if (patientIds.length > 0) {
        const { data: unreadMsgs } = await supabase
          .from('messages')
          .select('id, branch_key')
          .in('patient_id', patientIds)
          .eq('sender_type', 'patient')
          .eq('is_read', false);

        patientUnread = (unreadMsgs || []).filter(m =>
          !m.branch_key ? effectiveBranch === 'main' : m.branch_key === effectiveBranch
        ).length;
      }

      let branchUnread = 0;
      try {
        const { count } = await supabase
          .from('branch_messages')
          .select('id', { head: true, count: 'exact' })
          .eq('recipient_branch', effectiveBranch)
          .eq('is_read', false);
        branchUnread = count || 0;
      } catch (_) {}

      return patientUnread + branchUnread;
    } catch {
      return 0;
    }
  },

  // Watch unread message changes in real time + polling fallback for Header badge
  watchUnread(branchKey, refresh) {
    let active = true;
    const reload = () => {
      if (active && typeof refresh === 'function') refresh();
    };

    const channel = supabase
      .channel(`clinic-unread-messages:${++subscriptionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branch_messages' }, () => reload())
      .subscribe(status => {
        if (status === 'SUBSCRIBED') reload();
      });

    const interval = setInterval(reload, 8000);
    return () => {
      active = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  },

  // Helper: Resolve all sibling patient_ids belonging to the same user profile in this facility
  async _resolvePatientGroupIds(patientId) {
    try {
      if (!patientId) return [];
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
      return [patientId].filter(Boolean);
    }
  },

  // 1. Get Conversations (List of facility patients with their last message in the active branch)
  async getConversations(branchKey = 'main') {
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
      console.warn('getConversations: No facilityId found in Session');
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
    const { data: allMessages, error } = await supabase
      .from('messages')
      .select('*')
      .in('patient_id', validPatientIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const effectiveBranch = branchKey || 'main';
    const branchMessages = (allMessages || []).filter(msg => {
      if (!msg.branch_key) return effectiveBranch === 'main';
      return msg.branch_key === effectiveBranch;
    });

    // Group patient records by profile_id (or patient_id if unlinked)
    const patientById = new Map(facilityPatients.map(p => [String(p.patient_id), p]));
    const groupKeyForPatient = p =>
      p.profile_id ? `profile:${p.profile_id}` : `patient:${p.patient_id}`;

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
    for (const msg of branchMessages) {
      const pat = patientById.get(String(msg.patient_id));
      if (!pat) continue;
      const key = groupKeyForPatient(pat);
      const group = groups.get(key);
      if (group && !group.latestMsg) {
        group.latestMsg = msg;
        group.canonicalPatient = pat;
      }
    }

    // Build conversation list (includes both existing chats and new patients to start a chat with)
    const conversations = [];
    for (const group of groups.values()) {
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
        lastMessage: lastMsg ? lastMsg.content : 'Start a conversation',
        timestamp: lastMsg ? formatRelativeTimestamp(lastMsg.created_at) : '',
        unread: lastMsg ? (!lastMsg.is_read && lastMsg.sender_type === 'patient') : false,
        rawTimestamp: lastMsg ? lastMsg.created_at : '',
      });
    }

    return conversations.sort((a, b) => {
      if (a.rawTimestamp && b.rawTimestamp) {
        return new Date(b.rawTimestamp) - new Date(a.rawTimestamp);
      }
      if (a.rawTimestamp) return -1;
      if (b.rawTimestamp) return 1;
      return a.patientName.localeCompare(b.patientName);
    });
  },

  // 2. Get Messages for a specific patient conversation (merges messages across all sibling patient_ids)
  async getMessages(patientId, branchKey = 'main') {
    const groupIds = await this._resolvePatientGroupIds(patientId);

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .in('patient_id', groupIds)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const effectiveBranch = branchKey || 'main';
    const filtered = (data || []).filter(msg => {
      if (!msg.branch_key) return effectiveBranch === 'main';
      return msg.branch_key === effectiveBranch;
    });

    return filtered.map(msg => ({
      id: msg.id,
      sender: msg.sender_type, // 'staff' or 'patient'
      text: msg.content,
      timestamp: new Date(msg.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      isRead: msg.is_read,
    }));
  },

  // 3. Send a Message
  async sendMessage(patientId, branchKey, text, id) {
    const data = await insertMessageOnce('messages', {
      id,
      patient_id: patientId,
      branch_key: branchKey || 'main',
      content: text,
      sender_type: 'staff',
    });
    return {
      success: true,
      message: {
        id: data.id,
        sender: data.sender_type,
        text: data.content,
        timestamp: new Date(data.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    };
  },

  // 4. Mark patient messages as read
  async markAsRead(patientId, branchKey = 'main') {
    try {
      const groupIds = await this._resolvePatientGroupIds(patientId);
      let query = supabase
        .from('messages')
        .update({ is_read: true })
        .in('patient_id', groupIds)
        .eq('sender_type', 'patient')
        .eq('is_read', false);

      if (branchKey && branchKey !== 'main') {
        query = query.eq('branch_key', branchKey);
      }

      const { error } = await query;
      if (error && (error.code === 'PGRST204' || /branch_key/i.test(error.message || ''))) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .in('patient_id', groupIds)
          .eq('sender_type', 'patient')
          .eq('is_read', false);
      }
      return { success: true };
    } catch (error) {
      console.error('Mark Read Error:', error);
      return { success: false };
    }
  },

  // 5. Branch-to-Branch Messaging
  async getBranchMessages(branchKey, otherBranchKey) {
    try {
      const facilityId = Session.getFacilityId();
      let query = supabase
        .from('branch_messages')
        .select('*')
        .or(
          `and(sender_branch.eq.${branchKey},recipient_branch.eq.${otherBranchKey}),and(sender_branch.eq.${otherBranchKey},recipient_branch.eq.${branchKey})`
        )
        .order('created_at', { ascending: true });

      if (facilityId) query = query.eq('facility_id', facilityId);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapBranchMessage);
    } catch (error) {
      console.error('Get Branch Messages Error:', error);
      return [];
    }
  },

  async sendBranchMessage(branchKey, otherBranchKey, text, id) {
    const data = await insertMessageOnce('branch_messages', {
      id,
      sender_branch: branchKey,
      recipient_branch: otherBranchKey,
      content: text,
    });
    return {
      success: true,
      message: mapBranchMessage(data),
    };
  },

  async markBranchAsRead(branchKey, otherBranchKey, messageIds = []) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return { success: true };
    try {
      await supabase
        .from('branch_messages')
        .update({ is_read: true })
        .in('id', messageIds)
        .eq('sender_branch', otherBranchKey)
        .eq('recipient_branch', branchKey);
      return { success: true };
    } catch {
      return { success: false };
    }
  },
};
