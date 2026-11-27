import { supabase } from '../lib/supabase';
import Session from './session';

let subscriptionId = 0;
const branchAliases = new Map([['MAIN', 'main'], ['QC', 'branch-qc'], ['KAT', 'branch-katipunan']]);

function getBranchKey(branch) {
  return branchAliases.get(branch?.abbreviation?.toUpperCase()) ?? branch?.branch_id ?? 'main';
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
    let result = await supabase
      .from(table)
      .insert(record)
      .select()
      .abortSignal(controller.signal)
      .maybeSingle();

    // Fallback if branch_key or client-supplied id column is not present on messages table
    if (
      result.error &&
      (result.error.code === 'PGRST204' || /branch_key/i.test(result.error.message || ''))
    ) {
      const { branch_key, ...withoutBranchKey } = record;
      result = await supabase
        .from(table)
        .insert(withoutBranchKey)
        .select()
        .abortSignal(controller.signal)
        .maybeSingle();
    }

    const { content, ...identity } = record;
    const { data, error } =
      result.error?.code === '23505'
        ? await supabase
            .from(table)
            .select()
            .match({ patient_id: identity.patient_id })
            .order('created_at', { ascending: false })
            .limit(1)
            .abortSignal(controller.signal)
            .maybeSingle()
        : result;

    if (error) throw error;
    return (
      data || {
        id: record.id || Date.now(),
        patient_id: record.patient_id,
        branch_key: record.branch_key || 'main',
        content: record.content,
        sender_type: record.sender_type || 'patient',
        created_at: new Date().toISOString(),
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

const MessagesAPI = {
  subscribeToMessages(refresh, { patientId, branchKey, includeReadUpdates = false } = {}) {
    let active = true;
    const reload = () => {
      if (active) refresh();
    };
    const changes = {
      event: includeReadUpdates ? '*' : 'INSERT',
      schema: 'public',
      table: 'messages',
    };
    if (patientId) changes.filter = `patient_id=eq.${patientId}`;

    const channel = supabase
      .channel(`patient-messages:${++subscriptionId}`)
      .on('postgres_changes', changes, ({ new: message }) => {
        if (!branchKey || !message?.branch_key || message.branch_key === branchKey) reload();
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') reload();
      });

    reload();
    // Catch up if the socket is reconnecting or Realtime is unavailable.
    const fallback = setInterval(reload, 5000);
    return () => {
      active = false;
      clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  },

  async getUnreadCount() {
    const profileId = Session.getUserId();
    if (!profileId) return 0;
    const { count, error } = await supabase
      .from('messages')
      .select('id, patients!inner(profile_id)', { head: true, count: 'exact' })
      .eq('patients.profile_id', profileId)
      .eq('sender_type', 'staff')
      .eq('is_read', false);
    if (error) throw error;
    return count ?? 0;
  },

  // Helper: Resolve all sibling patient_ids for the same user & facility as the given patientId
  async _resolveFacilityPatientIds(patientId) {
    try {
      const userId = Session.getUserId();
      if (!userId || !patientId) return [patientId].filter(Boolean);

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
      return [patientId].filter(Boolean);
    }
  },

  // 1. Get Conversations (Grouped by Facility & Branch, consolidated across sibling patient_ids)
  async getConversations() {
    const userId = Session.getUserId();
    if (!userId) return [];

    // A. Get all patient records for this user to identify which facilities they are connected to
    const [{ data: patientRecords, error: patientError }, { data: appointmentsData }] =
      await Promise.all([
        supabase
          .from('patients')
          .select(`
            patient_id,
            facility_id,
            created_at,
            facilities (
              facility_id,
              name
            )
          `)
          .eq('profile_id', userId)
          .order('created_at', { ascending: false }),
        supabase.from('appointments').select('patient_id, appointment_id'),
      ]);

    if (patientError) throw patientError;
    if (!patientRecords || patientRecords.length === 0) return [];

    const apptCountByPatient = {};
    (appointmentsData || []).forEach(a => {
      if (a.patient_id) {
        apptCountByPatient[a.patient_id] = (apptCountByPatient[a.patient_id] || 0) + 1;
      }
    });

    // Group patientRecords by facility_id and select canonical patient_id per facility
    const facilityGroups = new Map();
    patientRecords.forEach(p => {
      const facId = p.facility_id || `unassigned-${p.patient_id}`;
      if (!facilityGroups.has(facId)) {
        facilityGroups.set(facId, {
          facilityId: p.facility_id,
          facilityName: p.facilities?.name || 'Healthcare Facility',
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
    const facilityIds = [...new Set(patientRecords.map(p => p.facility_id).filter(Boolean))];

    // B. Fetch branches for these facilities and all messages for this patient
    const [branchesResult, messagesResult] = await Promise.all([
      facilityIds.length > 0
        ? supabase
            .from('clinic_branches')
            .select('branch_id, facility_id, name, abbreviation, is_active')
            .in('facility_id', facilityIds)
            .order('name')
        : Promise.resolve({ data: [] }),
      supabase
        .from('messages')
        .select('*')
        .in('patient_id', allPatientIds)
        .order('created_at', { ascending: false }),
    ]);

    if (messagesResult.error) throw messagesResult.error;
    const branches = branchesResult.data || [];
    const messages = messagesResult.data || [];

    // Map each patient_id to its facility group key
    const patientToFacKey = {};
    for (const [facKey, group] of facilityGroups.entries()) {
      group.patientIds.forEach(pid => {
        patientToFacKey[pid] = facKey;
      });
    }

    // Build branch list per facility (always include Main + active clinic branches)
    const branchesByFacKey = new Map();
    for (const [facKey, group] of facilityGroups.entries()) {
      const list = [{ branchKey: 'main', branchName: 'Main' }];
      const seenKeys = new Set(['main']);
      branches
        .filter(b => b.facility_id === group.facilityId && b.is_active !== false)
        .forEach(b => {
          const bKey = getBranchKey(b);
          if (bKey && !seenKeys.has(bKey)) {
            seenKeys.add(bKey);
            list.push({ branchKey: bKey, branchName: b.name || bKey });
          }
        });
      branchesByFacKey.set(facKey, list);
    }

    // Find latest message per (facilityKey, branchKey)
    const latestMsgByThread = new Map();
    messages.forEach(msg => {
      const facKey = patientToFacKey[msg.patient_id];
      if (!facKey) return;
      const bKey = msg.branch_key || 'main';
      const threadKey = `${facKey}:${bKey}`;
      if (!latestMsgByThread.has(threadKey)) {
        latestMsgByThread.set(threadKey, msg);
      }
      // Ensure any custom branch_key present in messages is also represented
      const facBranches = branchesByFacKey.get(facKey) || [];
      if (!facBranches.some(b => b.branchKey === bKey)) {
        facBranches.push({ branchKey: bKey, branchName: bKey === 'main' ? 'Main' : bKey });
        branchesByFacKey.set(facKey, facBranches);
      }
    });

    // C. Build conversations list expected by MessagesPage & ConversationView
    const conversations = [];
    for (const [facKey, group] of facilityGroups.entries()) {
      const facBranches = branchesByFacKey.get(facKey) || [{ branchKey: 'main', branchName: 'Main' }];
      for (const b of facBranches) {
        const threadKey = `${facKey}:${b.branchKey}`;
        const msg = latestMsgByThread.get(threadKey) || null;
        // Prefer the patient_id that has messages in this thread so replies land on the exact same row
        const threadPatientId = msg?.patient_id || group.canonicalPatientId;

        conversations.push({
          id: `${threadPatientId}:${b.branchKey}`,
          patientId: threadPatientId,
          patientIds: group.patientIds,
          facilityId: group.facilityId,
          branchKey: b.branchKey,
          name: group.facilityName,
          branchName: b.branchName,
          initials: (group.facilityName || 'H').charAt(0).toUpperCase(),
          lastMessage: msg ? msg.content : '',
          timestamp: msg?.created_at ? formatRelativeTimestamp(msg.created_at) : '',
          unread: msg ? (!msg.is_read && msg.sender_type === 'staff') : false,
          rawTimestamp: msg?.created_at || '',
        });
      }
    }

    return conversations.sort((a, b) => {
      if (a.rawTimestamp && b.rawTimestamp) {
        return new Date(b.rawTimestamp) - new Date(a.rawTimestamp);
      }
      if (a.rawTimestamp) return -1;
      if (b.rawTimestamp) return 1;
      return a.name.localeCompare(b.name);
    });
  },

  // 2. Get Messages for a specific conversation (merges messages across all sibling patient_ids for that facility & branch)
  async getMessages(patientId, branchKey = 'main') {
    const targetIds = await this._resolveFacilityPatientIds(patientId);

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .in('patient_id', targetIds)
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

  // 3. Send a Message (Supports both (patientId, branchKey, text, id) and legacy (patientId, text))
  async sendMessage(patientId, branchKeyOrText, maybeText, maybeId) {
    const hasBranchArg = maybeText !== undefined;
    const branchKey = hasBranchArg ? (branchKeyOrText || 'main') : 'main';
    const text = hasBranchArg ? maybeText : branchKeyOrText;
    const id = hasBranchArg ? maybeId : undefined;

    const record = {
      ...(id ? { id } : {}),
      patient_id: patientId,
      branch_key: branchKey,
      content: text,
      sender_type: 'patient',
      is_read: false,
    };

    const data = await insertMessageOnce('messages', record);
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

  // 4. Mark messages as read
  async markAsRead(patientId, branchKey = 'main') {
    try {
      const targetIds = await this._resolveFacilityPatientIds(patientId);
      let query = supabase
        .from('messages')
        .update({ is_read: true })
        .in('patient_id', targetIds)
        .eq('sender_type', 'staff')
        .eq('is_read', false);

      if (branchKey && branchKey !== 'main') {
        query = query.eq('branch_key', branchKey);
      }

      const { error } = await query;
      if (error && (error.code === 'PGRST204' || /branch_key/i.test(error.message || ''))) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .in('patient_id', targetIds)
          .eq('sender_type', 'staff')
          .eq('is_read', false);
      }
      return { success: true };
    } catch (error) {
      console.error('Mark Read Error:', error);
      return { success: false };
    }
  },
};

export default MessagesAPI;
