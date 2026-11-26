const { RequestError } = require('./provider-accounts');

/**
 * Patient Digital Claims Processing (US-3.9)
 *
 * Allows authenticated patients to view submitted claims & status updates,
 * see eligible healthcare charges from their ledger, and submit new digital
 * claims linked to their insurance plan.
 */

const ACTIVE_CLAIM_STATUSES = new Set(['SUBMITTED', 'PENDING', 'IN_REVIEW', 'IN REVIEW', 'PROCESSING', 'APPROVED', 'PAID']);

const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function normalizeStatus(status) {
  const raw = String(status || 'Submitted').trim().toUpperCase().replace(/\s+/g, '_');
  if (raw === 'APPROVED' || raw === 'PAID' || raw === 'SETTLED') return raw === 'PAID' ? 'PAID' : 'APPROVED';
  if (raw === 'DENIED' || raw === 'REJECTED') return 'DENIED';
  if (raw === 'IN_REVIEW' || raw === 'PROCESSING' || raw === 'UNDER_REVIEW') return 'IN_REVIEW';
  return 'SUBMITTED';
}

function isChargeRow(row) {
  const type = String(row.type || '').toUpperCase();
  if (type === 'PAYMENT') return false;
  if (type === 'CHARGE') return true;
  return num(row.total_bill_amount) > 0;
}

function procedureLabel(procedure, procedureId, fallbackDescription) {
  return procedure?.description || procedure?.name || procedure?.procedure_name ||
    fallbackDescription || (procedureId != null ? `Procedure #${procedureId}` : 'Healthcare Service');
}

async function lookupMap(admin, table, keyColumn, ids, columns = '*') {
  const unique = [...new Set(ids.filter(id => id != null).map(String))];
  if (unique.length === 0) return new Map();
  try {
    const { data, error } = await admin.from(table).select(columns).in(keyColumn, unique);
    if (error || !Array.isArray(data)) return new Map();
    return new Map(data.map(row => [String(row[keyColumn]), row]));
  } catch {
    return new Map();
  }
}

async function fetchClaimsRows(admin, patientIds) {
  const { data, error } = await admin
    .from('claims')
    .select('*')
    .in('patient_id', patientIds)
    .order('submission_date', { ascending: false });

  if (error) throw new RequestError(500, 'Failed to retrieve claims: ' + error.message);
  return data || [];
}

async function fetchLedgerCharges(admin, patientIds) {
  const withProviders = await admin
    .from('ledger')
    .select('*, providers ( name, specialization )')
    .in('patient_id', patientIds)
    .order('date', { ascending: false });

  if (!withProviders.error) {
    return (withProviders.data || []).filter(isChargeRow);
  }

  const plain = await admin
    .from('ledger')
    .select('*')
    .in('patient_id', patientIds)
    .order('date', { ascending: false });
  if (plain.error) throw new RequestError(500, 'Failed to retrieve eligible charges: ' + plain.error.message);
  return (plain.data || []).filter(isChargeRow);
}

async function fetchInsurancePlansMap(admin, insuranceIds) {
  const unique = [...new Set(insuranceIds.filter(id => id != null).map(String))];
  if (unique.length === 0) return new Map();
  try {
    const { data, error } = await admin
      .from('insurance_plans')
      .select('insurance_id, plan_name, carrier_id, max_limit, deductible, copay_amount, carrier ( carrier_id, name )')
      .in('insurance_id', unique);
    if (!error && Array.isArray(data)) {
      return new Map(data.map(row => [String(row.insurance_id), row]));
    }
  } catch {}

  // Fallback without nested carrier join
  return lookupMap(admin, 'insurance_plans', 'insurance_id', unique, 'insurance_id, plan_name, carrier_id');
}

async function fetchAvailablePlans(admin) {
  try {
    const { data, error } = await admin
      .from('insurance_plans')
      .select('insurance_id, plan_name, carrier ( name )')
      .order('plan_name', { ascending: true })
      .limit(50);
    if (!error && Array.isArray(data)) {
      return data.map(p => ({
        insuranceId: p.insurance_id,
        planName: p.plan_name || `Plan #${p.insurance_id}`,
        carrierName: p.carrier?.name || null,
      }));
    }
  } catch {}
  return [];
}

/**
 * Retrieve submitted claims, status summary, and eligible charges for the logged-in patient.
 */
async function getPatientClaims(admin, userId, options = {}) {
  if (!userId) throw new RequestError(401, 'User authentication required.');

  const { data: patientRows, error: pError } = await admin
    .from('patients')
    .select('patient_id, facility_id, insurance_id')
    .eq('profile_id', userId);

  if (pError) throw new RequestError(500, 'Failed to fetch patient records: ' + pError.message);

  const emptySummary = {
    totalClaims: 0,
    submitted: 0,
    inReview: 0,
    approved: 0,
    denied: 0,
    totalClaimedAmount: 0,
    eligibleCount: 0,
  };

  if (!patientRows || patientRows.length === 0) {
    return { summary: emptySummary, claims: [], eligibleCharges: [], insurancePlans: [] };
  }

  const patientIds = patientRows.map(p => p.patient_id);
  const patientById = new Map(patientRows.map(p => [String(p.patient_id), p]));

  const [claimRows, chargeRows, availablePlans] = await Promise.all([
    fetchClaimsRows(admin, patientIds),
    fetchLedgerCharges(admin, patientIds),
    fetchAvailablePlans(admin),
  ]);

  const allInsuranceIds = [
    ...patientRows.map(p => p.insurance_id),
    ...claimRows.map(c => c.insurance_id),
  ];
  const allFacilityIds = [
    ...patientRows.map(p => p.facility_id),
    ...chargeRows.map(r => r.facility_id),
  ];

  const [procedures, facilities, insurancePlans] = await Promise.all([
    lookupMap(admin, 'procedures', 'procedure_id', chargeRows.map(r => r.procedure_id)),
    lookupMap(admin, 'facilities', 'facility_id', allFacilityIds, 'facility_id, name, contact_num'),
    fetchInsurancePlansMap(admin, allInsuranceIds),
  ]);

  const chargeByLedgerId = new Map(chargeRows.map(r => [String(r.ledger_id), r]));

  const insuranceInfoFor = insuranceId => {
    const plan = insurancePlans.get(String(insuranceId));
    return {
      insuranceId: insuranceId ?? null,
      planName: plan?.plan_name || (insuranceId != null ? `Plan #${insuranceId}` : null),
      carrierName: plan?.carrier?.name || null,
    };
  };

  const facilityInfoFor = (patientId, fallbackFacilityId) => {
    const pat = patientById.get(String(patientId));
    const fid = fallbackFacilityId || pat?.facility_id || null;
    const fac = facilities.get(String(fid));
    return {
      facilityId: fid,
      facilityName: fac?.name || 'Medical Facility',
      facilityPhone: fac?.contact_num || '',
    };
  };

  // Track which ledger charges already have an active (non-denied) claim
  const activeClaimedLedgerIds = new Set();

  const claims = claimRows.map(row => {
    const ledger = chargeByLedgerId.get(String(row.ledger_id));
    const status = normalizeStatus(row.status);
    if (ACTIVE_CLAIM_STATUSES.has(status) && row.ledger_id != null) {
      activeClaimedLedgerIds.add(String(row.ledger_id));
    }
    const procedure = ledger ? procedures.get(String(ledger.procedure_id)) : null;
    const amount = round2(Math.abs(num(row.claimed_amount ?? ledger?.total_bill_amount ?? 0)));
    const ins = insuranceInfoFor(row.insurance_id ?? patientById.get(String(row.patient_id))?.insurance_id);
    const fac = facilityInfoFor(row.patient_id, ledger?.facility_id);
    const rawDate = row.submission_date || row.created_at;

    return {
      id: row.claim_id ?? row.id ?? `${row.ledger_id}-${rawDate}`,
      ledgerId: row.ledger_id ?? null,
      status,
      rawStatus: row.status || 'Submitted',
      submissionDate: formatDate(rawDate),
      rawSubmissionDate: rawDate || null,
      serviceDate: formatDate(ledger?.date || ledger?.created_at),
      procedureName: procedureLabel(procedure, ledger?.procedure_id, ledger?.description),
      providerName: ledger?.providers?.name || null,
      amount,
      approvedAmount: row.approved_amount != null ? round2(Math.abs(num(row.approved_amount))) : null,
      notes: row.notes || row.remarks || row.denial_reason || null,
      ...ins,
      ...fac,
    };
  });

  // Eligible charges: ledger CHARGE items not currently under an active claim
  const eligibleCharges = chargeRows
    .filter(r => !activeClaimedLedgerIds.has(String(r.ledger_id)))
    .map(r => {
      const pat = patientById.get(String(r.patient_id));
      const procedure = procedures.get(String(r.procedure_id));
      const ins = insuranceInfoFor(pat?.insurance_id);
      const fac = facilityInfoFor(r.patient_id, r.facility_id);
      return {
        ledgerId: r.ledger_id,
        date: formatDate(r.date || r.created_at),
        rawDate: r.date || r.created_at || null,
        procedureName: procedureLabel(procedure, r.procedure_id, r.description),
        description: r.description || procedureLabel(procedure, r.procedure_id),
        providerName: r.providers?.name || null,
        amount: round2(Math.abs(num(r.total_bill_amount))),
        paymentStatus: String(r.payment_status || 'UNPAID').toUpperCase(),
        ...ins,
        ...fac,
      };
    });

  const summary = {
    totalClaims: claims.length,
    submitted: claims.filter(c => c.status === 'SUBMITTED').length,
    inReview: claims.filter(c => c.status === 'IN_REVIEW').length,
    approved: claims.filter(c => c.status === 'APPROVED' || c.status === 'PAID').length,
    denied: claims.filter(c => c.status === 'DENIED').length,
    totalClaimedAmount: round2(claims.reduce((acc, c) => acc + c.amount, 0)),
    eligibleCount: eligibleCharges.length,
  };

  let filteredClaims = claims;
  if (options.status) {
    const wanted = normalizeStatus(options.status);
    filteredClaims = claims.filter(c =>
      c.status === wanted || (wanted === 'APPROVED' && c.status === 'PAID')
    );
  }

  return {
    summary,
    claims: filteredClaims,
    eligibleCharges,
    insurancePlans: availablePlans,
  };
}

/**
 * Submit a new digital claim for one of the logged-in patient's eligible ledger charges.
 */
async function submitPatientClaim(admin, userId, payload = {}) {
  if (!userId) throw new RequestError(401, 'User authentication required.');

  const ledgerId = payload.ledgerId ?? payload.ledger_id;
  if (ledgerId == null || ledgerId === '') {
    throw new RequestError(400, 'Please select a healthcare charge to claim.');
  }

  // 1. Resolve all patient records owned by this user
  const { data: patientRows, error: pError } = await admin
    .from('patients')
    .select('patient_id, facility_id, insurance_id')
    .eq('profile_id', userId);

  if (pError) throw new RequestError(500, 'Failed to verify patient identity: ' + pError.message);
  if (!patientRows || patientRows.length === 0) {
    throw new RequestError(404, 'No patient records found for your account.');
  }

  const patientById = new Map(patientRows.map(p => [String(p.patient_id), p]));

  // 2. Fetch the target ledger row and verify ownership
  const { data: ledgerRow, error: lError } = await admin
    .from('ledger')
    .select('*')
    .eq('ledger_id', ledgerId)
    .maybeSingle();

  if (lError) throw new RequestError(500, 'Failed to verify charge record: ' + lError.message);
  if (!ledgerRow) throw new RequestError(404, 'Healthcare charge not found.');

  const ownerPatient = patientById.get(String(ledgerRow.patient_id));
  if (!ownerPatient) {
    throw new RequestError(403, 'You are not authorized to submit a claim for this charge.');
  }

  if (!isChargeRow(ledgerRow)) {
    throw new RequestError(400, 'Only healthcare charges can be submitted as insurance claims.');
  }

  // 3. Prevent duplicate active claims on the same ledger charge
  const { data: existingClaims, error: existError } = await admin
    .from('claims')
    .select('*')
    .eq('ledger_id', ledgerRow.ledger_id);

  if (existError) throw new RequestError(500, 'Failed to check existing claims: ' + existError.message);

  const hasActiveClaim = (existingClaims || []).some(c => ACTIVE_CLAIM_STATUSES.has(normalizeStatus(c.status)));
  if (hasActiveClaim) {
    throw new RequestError(409, 'A claim has already been submitted for this charge.');
  }

  // 4. Link to the patient's insurance plan (or user-selected plan if patient has none)
  const insuranceId = payload.insuranceId ?? payload.insurance_id ?? ownerPatient.insurance_id ?? null;
  if (insuranceId == null || insuranceId === '') {
    throw new RequestError(400, 'No insurance plan is linked to your profile. Please select an insurance plan before submitting.');
  }

  // 5. Insert into claims table (with graceful fallback if optional notes column doesn't exist)
  const cleanNotes = typeof payload.notes === 'string' ? payload.notes.trim().slice(0, 400) : '';
  const basePayload = {
    ledger_id: ledgerRow.ledger_id,
    patient_id: ownerPatient.patient_id,
    insurance_id: !isNaN(Number(insuranceId)) ? Number(insuranceId) : insuranceId,
    submission_date: new Date().toISOString(),
    status: 'Submitted',
  };

  let insertPayload = cleanNotes ? { ...basePayload, notes: cleanNotes } : basePayload;
  let { data: created, error: insertError } = await admin
    .from('claims')
    .insert([insertPayload])
    .select()
    .single();

  if (insertError && cleanNotes && /notes|column/i.test(insertError.message || '')) {
    const retry = await admin
      .from('claims')
      .insert([basePayload])
      .select()
      .single();
    created = retry.data;
    insertError = retry.error;
  }

  if (insertError) {
    throw new RequestError(500, 'Failed to submit claim: ' + insertError.message);
  }

  return {
    success: true,
    message: 'Your digital claim has been submitted for processing.',
    claim: {
      id: created?.claim_id ?? created?.id ?? null,
      ledgerId: created?.ledger_id ?? ledgerRow.ledger_id,
      insuranceId: created?.insurance_id ?? basePayload.insurance_id,
      status: normalizeStatus(created?.status || 'Submitted'),
      submissionDate: formatDate(created?.submission_date || basePayload.submission_date),
      amount: round2(Math.abs(num(ledgerRow.total_bill_amount))),
    },
  };
}

module.exports = {
  normalizeStatus,
  getPatientClaims,
  submitPatientClaim,
};
