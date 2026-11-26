const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeStatus,
  getPatientClaims,
  submitPatientClaim,
} = require('../lib/patient-claims');

function mockAdmin(handlers, calls = []) {
  return {
    from(table) {
      const state = { table, op: 'select', filters: [], payload: null };
      const resolveTable = () => {
        calls.push(state);
        const h = handlers[table];
        const value = typeof h === 'function' ? h(state) : h;
        return Promise.resolve(value || { data: [], error: null });
      };
      const builder = {
        select() { return builder; },
        insert(rows) { state.op = 'insert'; state.payload = rows; return builder; },
        eq(col, val) { state.filters.push(['eq', col, val]); return builder; },
        in(col, val) { state.filters.push(['in', col, val]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { return resolveTable(); },
        single() { return resolveTable(); },
        then(resolve, reject) { return resolveTable().then(resolve, reject); },
      };
      return builder;
    },
  };
}

test('normalizeStatus maps database claim statuses consistently', () => {
  assert.equal(normalizeStatus('Submitted'), 'SUBMITTED');
  assert.equal(normalizeStatus('In Review'), 'IN_REVIEW');
  assert.equal(normalizeStatus('Approved'), 'APPROVED');
  assert.equal(normalizeStatus('Paid'), 'PAID');
  assert.equal(normalizeStatus('Rejected'), 'DENIED');
});

test('getPatientClaims requires authentication', async () => {
  await assert.rejects(() => getPatientClaims(mockAdmin({}), null), err => err.status === 401);
});

test('getPatientClaims returns empty structure when user has no patient records', async () => {
  const res = await getPatientClaims(mockAdmin({ patients: { data: [], error: null } }), 'user-1');
  assert.deepEqual(res.claims, []);
  assert.deepEqual(res.eligibleCharges, []);
  assert.equal(res.summary.totalClaims, 0);
});

test('getPatientClaims enriches submitted claims and excludes active claimed charges from eligible list', async () => {
  const calls = [];
  const admin = mockAdmin({
    patients: { data: [{ patient_id: 'p-1', facility_id: 'fac-1', insurance_id: 5 }], error: null },
    claims: {
      data: [
        { claim_id: 100, ledger_id: 1, patient_id: 'p-1', insurance_id: 5, submission_date: '2026-11-10T08:00:00Z', status: 'In Review' },
        { claim_id: 101, ledger_id: 3, patient_id: 'p-1', insurance_id: 5, submission_date: '2026-11-05T08:00:00Z', status: 'Denied' },
      ],
      error: null,
    },
    ledger: {
      data: [
        { ledger_id: 1, patient_id: 'p-1', type: 'CHARGE', procedure_id: 10, date: '2026-11-09', total_bill_amount: 2000, providers: { name: 'Dr. Reyes' } },
        { ledger_id: 2, patient_id: 'p-1', type: 'CHARGE', procedure_id: 11, date: '2026-11-12', total_bill_amount: 1200, providers: { name: 'Dr. Cruz' } },
        { ledger_id: 3, patient_id: 'p-1', type: 'CHARGE', procedure_id: 12, date: '2026-11-04', total_bill_amount: 500 },
        { ledger_id: 4, patient_id: 'p-1', type: 'PAYMENT', date: '2026-11-12', total_bill_amount: -500 },
      ],
      error: null,
    },
    procedures: {
      data: [
        { procedure_id: 10, description: 'MRI Scan' },
        { procedure_id: 11, description: 'Blood Chemistry' },
        { procedure_id: 12, description: 'X-Ray' },
      ],
      error: null,
    },
    facilities: { data: [{ facility_id: 'fac-1', name: 'Manila Medical Center' }], error: null },
    insurance_plans: {
      data: [{ insurance_id: 5, plan_name: 'Gold Health', carrier: { carrier_id: 1, name: 'Maxicare' } }],
      error: null,
    },
  }, calls);

  const res = await getPatientClaims(admin, 'user-1');

  assert.equal(res.claims.length, 2);
  assert.equal(res.claims[0].procedureName, 'MRI Scan');
  assert.equal(res.claims[0].carrierName, 'Maxicare');
  assert.equal(res.claims[0].planName, 'Gold Health');
  assert.equal(res.claims[0].status, 'IN_REVIEW');
  assert.equal(res.claims[0].amount, 2000);

  // Charge #1 has an active In Review claim -> excluded. Charge #2 (unclaimed) and Charge #3 (Denied) -> eligible. Payment #4 -> excluded.
  assert.deepEqual(res.eligibleCharges.map(c => c.ledgerId), [2, 3]);
  assert.equal(res.summary.totalClaims, 2);
  assert.equal(res.summary.inReview, 1);
  assert.equal(res.summary.denied, 1);
  assert.equal(res.summary.totalClaimedAmount, 2500);
  assert.equal(res.summary.eligibleCount, 2);
});

test('submitPatientClaim submits a valid claim linked to patient insurance', async () => {
  let insertedRow = null;
  const admin = mockAdmin({
    patients: { data: [{ patient_id: 'p-1', facility_id: 'fac-1', insurance_id: 7 }], error: null },
    ledger: { data: { ledger_id: 55, patient_id: 'p-1', type: 'CHARGE', total_bill_amount: 1850 }, error: null },
    claims: (state) => {
      if (state.op === 'insert') {
        insertedRow = state.payload[0];
        return { data: { claim_id: 901, ...insertedRow }, error: null };
      }
      return { data: [], error: null };
    },
  });

  const res = await submitPatientClaim(admin, 'user-1', { ledgerId: 55 });
  assert.equal(res.success, true);
  assert.equal(res.claim.id, 901);
  assert.equal(res.claim.insuranceId, 7);
  assert.equal(res.claim.status, 'SUBMITTED');
  assert.equal(insertedRow.patient_id, 'p-1');
  assert.equal(insertedRow.insurance_id, 7);
});

test('submitPatientClaim blocks submitting a claim for another patient charge (403)', async () => {
  const admin = mockAdmin({
    patients: { data: [{ patient_id: 'p-1', insurance_id: 7 }], error: null },
    ledger: { data: { ledger_id: 55, patient_id: 'p-OTHER', type: 'CHARGE', total_bill_amount: 1000 }, error: null },
  });

  await assert.rejects(() => submitPatientClaim(admin, 'user-1', { ledgerId: 55 }), err => err.status === 403);
});

test('submitPatientClaim rejects duplicate active claim for the same charge (409)', async () => {
  const admin = mockAdmin({
    patients: { data: [{ patient_id: 'p-1', insurance_id: 7 }], error: null },
    ledger: { data: { ledger_id: 55, patient_id: 'p-1', type: 'CHARGE', total_bill_amount: 1000 }, error: null },
    claims: { data: [{ claim_id: 1, ledger_id: 55, status: 'Submitted' }], error: null },
  });

  await assert.rejects(() => submitPatientClaim(admin, 'user-1', { ledgerId: 55 }), err => err.status === 409);
});

test('submitPatientClaim rejects when no insurance plan is linked or provided (400)', async () => {
  const admin = mockAdmin({
    patients: { data: [{ patient_id: 'p-1', insurance_id: null }], error: null },
    ledger: { data: { ledger_id: 55, patient_id: 'p-1', type: 'CHARGE', total_bill_amount: 1000 }, error: null },
    claims: { data: [], error: null },
  });

  await assert.rejects(() => submitPatientClaim(admin, 'user-1', { ledgerId: 55 }), err => err.status === 400);
});
