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

module.exports = {
  PAYMENT_METHOD_LABELS,
  buildBreakdown,
  allocatePayments,
  derivePaymentStatus,
  getPatientBilling,
};
