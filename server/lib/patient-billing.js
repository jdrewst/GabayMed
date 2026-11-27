const { RequestError } = require('./provider-accounts');

/**
 * Patient Billing & Payment Status (US-3.8)
 *
 * Reads the clinic ledger for the logged-in patient only. Patient identity is
 * always resolved server-side from the verified auth user (profile_id), never
 * from a client-supplied patient_id.
 */

const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  check: 'Check',
  cc: 'Credit Card',
  ins_check: 'Insurance Check',
  ins_eft: 'Insurance EFT',
  gcash: 'GCash',
  maya: 'Maya',
};

const EPSILON = 0.005;

const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function isPayment(row) {
  const type = String(row.type || '').toUpperCase();
  if (type === 'PAYMENT') return true;
  if (type === 'CHARGE') return false;
  return num(row.total_bill_amount) < 0;
}

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function methodLabel(method) {
  if (!method) return 'Payment';
  return PAYMENT_METHOD_LABELS[String(method).toLowerCase()] || String(method);
}

function procedureLabel(procedure, procedureId) {
  return procedure?.description || procedure?.name || procedure?.procedure_name ||
    (procedureId != null ? `Procedure #${procedureId}` : null);
}

/**
 * Build the charge breakdown for a ledger CHARGE row.
 * patientPayable = gross - PhilHealth - HMO - discount (unless explicitly stored).
 */
function buildBreakdown(row) {
  const gross = Math.abs(num(row.total_bill_amount));
  const philhealth = Math.abs(num(row.philhealth_deduction));
  const hmo = Math.abs(num(row.hmo_deduction));
  const discount = Math.abs(num(row.discount_amount));
  const stored = row.patient_payable_amount;
  const patientPayable = stored != null && stored !== ''
    ? Math.max(0, Math.abs(num(stored)))
    : Math.max(0, gross - philhealth - hmo - discount);

  return {
    grossAmount: round2(gross),
    philhealthDeduction: round2(philhealth),
    hmoDeduction: round2(hmo),
    discountAmount: round2(discount),
    totalCoverage: round2(philhealth + hmo + discount),
    patientPayable: round2(patientPayable),
  };
}

/**
 * Allocate payments to charges.
 * 1. Explicit tags: "[Charge #<ledger_id>]" in the payment description (used by the clinic web ledger).
 * 2. Same appointment (and procedure when both are set).
 * 3. Same procedure when the charge has no appointment.
 * Amounts are capped at each charge's remaining balance so a payment is never counted twice.
 */
function allocatePayments(charges, payments) {
  const balances = new Map(charges.map(c => [c.id, c.breakdown.patientPayable]));
  const allocations = new Map(charges.map(c => [c.id, []]));

  const apply = (payment, charge, remaining) => {
    const open = balances.get(charge.id) || 0;
    if (open <= EPSILON || remaining <= EPSILON) return remaining;
    const applied = Math.min(open, remaining);
    balances.set(charge.id, round2(open - applied));
    allocations.get(charge.id).push({ paymentId: payment.id, amount: round2(applied), date: payment.date, method: payment.method });
    payment.appliedTo.push({ chargeId: charge.id, amount: round2(applied) });
    return round2(remaining - applied);
  };

  const sortedCharges = [...charges].sort((a, b) => String(a.rawDate || '').localeCompare(String(b.rawDate || '')));

  for (const payment of payments) {
    let remaining = payment.amount;
    const tag = /\[Charge #([^\]]+)\]/i.exec(payment.description || '');
    if (tag) {
      const target = charges.find(c => String(c.id) === tag[1].trim());
      if (target) remaining = apply(payment, target, remaining);
    }

    if (remaining > EPSILON) {
      for (const charge of sortedCharges) {
        if (remaining <= EPSILON) break;
        if (String(charge.patientId) !== String(payment.patientId)) continue;
        const sameAppointment = charge.appointmentId != null && payment.appointmentId != null &&
          String(charge.appointmentId) === String(payment.appointmentId) &&
          (charge.procedureId == null || payment.procedureId == null || String(charge.procedureId) === String(payment.procedureId));
        const sameProcedure = charge.appointmentId == null && charge.procedureId != null &&
          payment.procedureId != null && String(charge.procedureId) === String(payment.procedureId);
        if (sameAppointment || sameProcedure) remaining = apply(payment, charge, remaining);
      }
    }
    payment.unappliedAmount = round2(Math.max(0, remaining));
  }

  return { balances, allocations };
}

function derivePaymentStatus(storedStatus, payable, paid) {
  const stored = String(storedStatus || '').toUpperCase();
  if (stored === 'PAID' || stored === 'WAIVED') return stored;
  if (payable <= EPSILON) return 'PAID';
  if (paid >= payable - EPSILON) return 'PAID';
  if (paid > EPSILON) return 'PARTIALLY_PAID';
  if (stored === 'OVERDUE') return 'OVERDUE';
  return 'UNPAID';
}

async function fetchLedgerRows(admin, patientIds) {
  const withJoins = await admin
    .from('ledger')
    .select('*, providers ( name, specialization )')
    .in('patient_id', patientIds)
    .order('date', { ascending: false });

  if (!withJoins.error) return withJoins.data || [];

  // Fallback when the providers relationship is unavailable.
  const plain = await admin
    .from('ledger')
    .select('*')
    .in('patient_id', patientIds)
    .order('date', { ascending: false });
  if (plain.error) throw new RequestError(500, 'Failed to retrieve billing records: ' + plain.error.message);
  return plain.data || [];
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

/**
 * Retrieve transaction history, charge breakdowns, and payment statuses for the logged-in patient.
 */
async function getPatientBilling(admin, userId, options = {}) {
  if (!userId) throw new RequestError(401, 'User authentication required.');

  const { data: patientRows, error: pError } = await admin
    .from('patients')
    .select('patient_id, facility_id')
    .eq('profile_id', userId);

  if (pError) throw new RequestError(500, 'Failed to fetch patient records: ' + pError.message);

  const emptySummary = {
    totalCharges: 0, totalCoverage: 0, totalPayable: 0, totalPaid: 0,
    outstandingBalance: 0, counts: { paid: 0, partiallyPaid: 0, unpaid: 0 },
  };
  if (!patientRows || patientRows.length === 0) {
    return { summary: emptySummary, charges: [], payments: [], transactions: [] };
  }

  const patientIds = patientRows.map(p => p.patient_id);
  const facilityByPatient = new Map(patientRows.map(p => [String(p.patient_id), p.facility_id]));

  const rows = await fetchLedgerRows(admin, patientIds);

  const [procedures, facilities, appointments] = await Promise.all([
    lookupMap(admin, 'procedures', 'procedure_id', rows.map(r => r.procedure_id)),
    lookupMap(admin, 'facilities', 'facility_id', [...facilityByPatient.values()], 'facility_id, name, location, contact_num'),
    lookupMap(admin, 'appointments', 'appointment_id', rows.map(r => r.appointment_id), 'appointment_id, appointment_date, status, procedure_id'),
  ]);

  const facilityFor = row => {
    const fid = row.facility_id || facilityByPatient.get(String(row.patient_id));
    const f = facilities.get(String(fid));
    return { facilityId: fid || null, facilityName: f?.name || 'Medical Facility', facilityPhone: f?.contact_num || '' };
  };

  const charges = [];
  const payments = [];

  for (const row of rows) {
    const rawDate = row.date || row.created_at;
    const appointment = appointments.get(String(row.appointment_id));
    const procedureId = row.procedure_id ?? appointment?.procedure_id ?? null;
    const base = {
      id: row.ledger_id,
      patientId: row.patient_id,
      appointmentId: row.appointment_id ?? null,
      procedureId,
      rawDate,
      date: formatDate(rawDate),
      createdAt: row.created_at || null,
      providerName: row.providers?.name || null,
      providerSpecialty: row.providers?.specialization || null,
      ...facilityFor(row),
    };

    if (isPayment(row)) {
      payments.push({
        ...base,
        type: 'PAYMENT',
        amount: round2(Math.abs(num(row.total_bill_amount))),
        method: row.payment_method || null,
        methodLabel: methodLabel(row.payment_method),
        description: row.description || `Payment - ${methodLabel(row.payment_method)}`,
        appliedTo: [],
      });
    } else {
      const procedure = procedures.get(String(procedureId));
      charges.push({
        ...base,
        type: 'CHARGE',
        procedureName: procedureLabel(procedure, procedureId) || row.description || 'Healthcare Service',
        description: row.description || procedureLabel(procedure, procedureId) || 'Visit Charge',
        appointmentDate: appointment?.appointment_date || null,
        storedStatus: row.payment_status || null,
        breakdown: buildBreakdown(row),
      });
    }
  }

  const { balances, allocations } = allocatePayments(charges, payments);

  for (const charge of charges) {
    const payable = charge.breakdown.patientPayable;
    const paidFromLedger = round2(payable - (balances.get(charge.id) ?? payable));
    const status = derivePaymentStatus(charge.storedStatus, payable, paidFromLedger);
    const settled = status === 'PAID' || status === 'WAIVED';
    charge.payments = allocations.get(charge.id) || [];
    charge.amountPaid = settled ? payable : paidFromLedger;
    charge.balance = settled ? 0 : round2(Math.max(0, payable - paidFromLedger));
    charge.paymentStatus = status;
    delete charge.storedStatus;
  }

  const sum = (list, pick) => round2(list.reduce((acc, item) => acc + pick(item), 0));
  const summary = {
    totalCharges: sum(charges, c => c.breakdown.grossAmount),
    totalCoverage: sum(charges, c => c.breakdown.totalCoverage),
    totalPayable: sum(charges, c => c.breakdown.patientPayable),
    totalPaid: sum(payments, p => p.amount),
    outstandingBalance: sum(charges, c => c.balance),
    counts: {
      paid: charges.filter(c => c.paymentStatus === 'PAID' || c.paymentStatus === 'WAIVED').length,
      partiallyPaid: charges.filter(c => c.paymentStatus === 'PARTIALLY_PAID').length,
      unpaid: charges.filter(c => c.paymentStatus === 'UNPAID' || c.paymentStatus === 'OVERDUE').length,
    },
  };

  let filteredCharges = charges;
  if (options.status) {
    const wanted = String(options.status).toUpperCase();
    filteredCharges = charges.filter(c => c.paymentStatus === wanted ||
      (wanted === 'OUTSTANDING' && c.balance > EPSILON));
  }

  const byDateDesc = (a, b) => String(b.rawDate || '').localeCompare(String(a.rawDate || ''));
  const strip = ({ rawDate, patientId, ...rest }) => ({ ...rest, rawDate });
  const transactions = [...charges, ...payments].sort(byDateDesc).map(t => ({
    id: t.id,
    type: t.type,
    date: t.date,
    rawDate: t.rawDate,
    description: t.type === 'CHARGE' ? t.procedureName : t.description,
    providerName: t.providerName,
    facilityName: t.facilityName,
    amount: t.type === 'CHARGE' ? t.breakdown.patientPayable : -t.amount,
    paymentStatus: t.type === 'CHARGE' ? t.paymentStatus : 'PAID',
  }));

  return {
    summary,
    charges: filteredCharges.sort(byDateDesc).map(strip),
    payments: payments.sort(byDateDesc).map(strip),
    transactions,
  };
}

/**
 * Post a patient payment into the clinic ledger using the exact same format & allocation tags
 * as the clinic HIS (`Payment - <Method> [Charge #<ledger_id>]`), updating `payment_status` to
 * `PAID` (or `PARTIALLY_PAID`) and syncing linked `claims` to `Paid` when settled.
 */
async function submitPatientPayment(admin, userId, payload = {}) {
  if (!userId) throw new RequestError(401, 'User authentication required.');

  const chargeId = payload.chargeId ?? payload.ledgerId ?? payload.ledger_id ?? null;
  const amountNum = round2(Math.abs(num(payload.amount)));
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new RequestError(400, 'Please enter a valid payment amount greater than 0.');
  }

  const rawMethod = String(payload.method || 'cash').trim().toLowerCase();
  const methodCodeMap = {
    cash: 'cash',
    'pay at counter': 'cash',
    check: 'check',
    cc: 'cc',
    'credit/debit card': 'cc',
    'credit card': 'cc',
    gcash: 'gcash',
    maya: 'maya',
    'online banking': 'cc',
  };
  const methodCode = methodCodeMap[rawMethod] || rawMethod;
  const methodText = PAYMENT_METHOD_LABELS[methodCode] || payload.method || 'Cash';

  // Verify the logged-in patient owns the target patient record / charge
  const { data: patientRows, error: pError } = await admin
    .from('patients')
    .select('patient_id, facility_id')
    .eq('profile_id', userId);

  if (pError) throw new RequestError(500, 'Failed to verify patient record: ' + pError.message);
  if (!patientRows || patientRows.length === 0) {
    throw new RequestError(404, 'No patient record linked to your account.');
  }

  const ownedPatientIds = new Set(patientRows.map(p => String(p.patient_id)));

  let targetCharge = null;
  if (chargeId != null && chargeId !== '') {
    const { data: chargeRow, error: cErr } = await admin
      .from('ledger')
      .select('*')
      .eq('ledger_id', chargeId)
      .maybeSingle();

    if (cErr) throw new RequestError(500, 'Failed to look up charge: ' + cErr.message);
    if (!chargeRow || !ownedPatientIds.has(String(chargeRow.patient_id))) {
      throw new RequestError(404, 'Selected charge was not found on your account.');
    }
    targetCharge = chargeRow;
  }

  const targetPatientId = targetCharge
    ? targetCharge.patient_id
    : (payload.patientId && ownedPatientIds.has(String(payload.patientId))
        ? payload.patientId
        : patientRows[0].patient_id);

  const desc = targetCharge
    ? `Payment - ${methodText} [Charge #${targetCharge.ledger_id}]`
    : `Payment - ${methodText}`;

  const nowIso = new Date().toISOString();
  const todayStr = nowIso.split('T')[0];

  const { data: inserted, error: insError } = await admin
    .from('ledger')
    .insert([{
      patient_id: targetPatientId,
      appointment_id: targetCharge?.appointment_id || payload.appointmentId || null,
      provider_id: targetCharge?.provider_id || payload.providerId || null,
      procedure_id: targetCharge?.procedure_id || payload.procedureId || null,
      created_at: nowIso,
      date: payload.date || todayStr,
      type: 'PAYMENT',
      payment_method: methodCode,
      description: desc,
      total_bill_amount: -Math.abs(amountNum),
      payment_status: 'PAID',
    }])
    .select()
    .single();

  if (insError) throw new RequestError(500, 'Failed to record payment: ' + insError.message);

  // Re-evaluate charge balance and update charge status in HIS ledger & claims table
  if (targetCharge) {
    const { data: patientLedgerRows } = await admin
      .from('ledger')
      .select('*')
      .eq('patient_id', targetPatientId);

    const chargeGross = Math.abs(num(targetCharge.total_bill_amount));
    const totalPaidOnCharge = (patientLedgerRows || [])
      .filter(r => isPayment(r) && (
        (r.description && r.description.includes(`[Charge #${targetCharge.ledger_id}]`)) ||
        (targetCharge.appointment_id && r.appointment_id && String(r.appointment_id) === String(targetCharge.appointment_id) &&
         (!targetCharge.procedure_id || !r.procedure_id || String(r.procedure_id) === String(targetCharge.procedure_id))) ||
        (!targetCharge.appointment_id && targetCharge.procedure_id && r.procedure_id && String(r.procedure_id) === String(targetCharge.procedure_id))
      ))
      .reduce((sum, p) => sum + Math.abs(num(p.total_bill_amount)), 0);

    if (chargeGross - totalPaidOnCharge <= 0.01) {
      await admin
        .from('ledger')
        .update({ payment_status: 'PAID' })
        .eq('ledger_id', targetCharge.ledger_id);

      try {
        await admin
          .from('claims')
          .update({ status: 'Paid' })
          .eq('ledger_id', targetCharge.ledger_id)
          .neq('status', 'Denied');
      } catch (_) {}
    }
  }

  return {
    success: true,
    payment: inserted,
  };
}

module.exports = {
  PAYMENT_METHOD_LABELS,
  buildBreakdown,
  allocatePayments,
  derivePaymentStatus,
  getPatientBilling,
  submitPatientPayment,
};
