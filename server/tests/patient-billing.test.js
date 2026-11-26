const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBreakdown,
  derivePaymentStatus,
  getPatientBilling,
} = require('../lib/patient-billing');

// Minimal chainable Supabase mock: every builder method returns the builder; awaiting resolves to the table result.
function mockAdmin(tables, calls = []) {
  return {
    from(table) {
      const state = { table, filters: [] };
      const builder = {
        select() { return builder; },
        eq(col, val) { state.filters.push(['eq', col, val]); return builder; },
        in(col, val) { state.filters.push(['in', col, val]); return builder; },
        order() { return builder; },
        then(resolve, reject) {
          calls.push(state);
          const value = typeof tables[table] === 'function' ? tables[table](state) : tables[table];
          return Promise.resolve(value || { data: [], error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

test('buildBreakdown subtracts PhilHealth, HMO and discount from the gross charge', () => {
  const b = buildBreakdown({ total_bill_amount: 5000, philhealth_deduction: 1500, hmo_deduction: 1000, discount_amount: 500 });
  assert.equal(b.grossAmount, 5000);
  assert.equal(b.totalCoverage, 3000);
  assert.equal(b.patientPayable, 2000);
});

test('buildBreakdown honours an explicitly stored patient_payable_amount', () => {
  const b = buildBreakdown({ total_bill_amount: 1000, patient_payable_amount: 800 });
  assert.equal(b.patientPayable, 800);
});

test('derivePaymentStatus only marks PAID when the balance reaches zero', () => {
  assert.equal(derivePaymentStatus('UNPAID', 1000, 0), 'UNPAID');
  assert.equal(derivePaymentStatus('UNPAID', 1000, 400), 'PARTIALLY_PAID');
  assert.equal(derivePaymentStatus('UNPAID', 1000, 1000), 'PAID');
  assert.equal(derivePaymentStatus('PAID', 1000, 0), 'PAID');
});

test('getPatientBilling rejects requests without an authenticated user', async () => {
  await assert.rejects(() => getPatientBilling(mockAdmin({}), null), err => err.status === 401);
});

test('getPatientBilling returns empty results when the user has no patient records', async () => {
  const result = await getPatientBilling(mockAdmin({ patients: { data: [], error: null } }), 'user-1');
  assert.deepEqual(result.charges, []);
  assert.equal(result.summary.outstandingBalance, 0);
});

test('getPatientBilling scopes the ledger to the logged-in user and computes statuses', async () => {
  const calls = [];
  const admin = mockAdmin({
    patients: { data: [{ patient_id: 'p-1', facility_id: 'fac-1' }], error: null },
    ledger: {
      data: [
        { ledger_id: 1, patient_id: 'p-1', type: 'CHARGE', procedure_id: 10, appointment_id: 'a-1', date: '2026-11-01', total_bill_amount: 1500, payment_status: 'UNPAID', providers: { name: 'Dr. Santos' } },
        { ledger_id: 2, patient_id: 'p-1', type: 'PAYMENT', date: '2026-11-02', total_bill_amount: -500, payment_method: 'cash', description: 'Payment - Cash [Charge #1]' },
        { ledger_id: 3, patient_id: 'p-1', type: 'CHARGE', procedure_id: 11, date: '2026-11-03', total_bill_amount: 800, payment_status: 'UNPAID' },
        { ledger_id: 4, patient_id: 'p-1', type: 'PAYMENT', procedure_id: 11, date: '2026-11-04', total_bill_amount: -800, payment_method: 'gcash' },
      ],
      error: null,
    },
    procedures: { data: [{ procedure_id: 10, description: 'Consultation' }, { procedure_id: 11, description: 'CBC' }], error: null },
    facilities: { data: [{ facility_id: 'fac-1', name: 'Manila Clinic' }], error: null },
    appointments: { data: [], error: null },
  }, calls);

  const result = await getPatientBilling(admin, 'user-1');

  const patientLookup = calls.find(c => c.table === 'patients');
  assert.deepEqual(patientLookup.filters[0], ['eq', 'profile_id', 'user-1']);
  const ledgerLookup = calls.find(c => c.table === 'ledger');
  assert.deepEqual(ledgerLookup.filters[0], ['in', 'patient_id', ['p-1']]);

  const consult = result.charges.find(c => c.id === 1);
  assert.equal(consult.procedureName, 'Consultation');
  assert.equal(consult.facilityName, 'Manila Clinic');
  assert.equal(consult.amountPaid, 500);
  assert.equal(consult.balance, 1000);
  assert.equal(consult.paymentStatus, 'PARTIALLY_PAID');

  const cbc = result.charges.find(c => c.id === 3);
  assert.equal(cbc.paymentStatus, 'PAID');
  assert.equal(cbc.balance, 0);

  assert.equal(result.summary.totalCharges, 2300);
  assert.equal(result.summary.totalPaid, 1300);
  assert.equal(result.summary.outstandingBalance, 1000);
  assert.deepEqual(result.summary.counts, { paid: 1, partiallyPaid: 1, unpaid: 0 });
  assert.equal(result.transactions.length, 4);
  assert.equal(result.transactions[0].id, 4); // newest first
  assert.equal(result.charges[0].patientId, undefined); // internal ids are not exposed
});

test('getPatientBilling filters outstanding charges', async () => {
  const admin = mockAdmin({
    patients: { data: [{ patient_id: 'p-1', facility_id: 'fac-1' }], error: null },
    ledger: { data: [
      { ledger_id: 1, patient_id: 'p-1', type: 'CHARGE', date: '2026-11-01', total_bill_amount: 100, payment_status: 'PAID' },
      { ledger_id: 2, patient_id: 'p-1', type: 'CHARGE', date: '2026-11-02', total_bill_amount: 200, payment_status: 'UNPAID' },
    ], error: null },
  });
  const result = await getPatientBilling(admin, 'user-1', { status: 'outstanding' });
  assert.deepEqual(result.charges.map(c => c.id), [2]);
});
