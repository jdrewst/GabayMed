import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFeeForm, feeFormPayload, feeScheduleStatus } from '../src/lib/fee-schedules.js'

const today = '2026-10-23'
const procedures = Array.from({ length: 10 }, (_, i) => ({ id: 101 + i, description: `Procedure ${i}`, price: 100, officeFee: 20 }))
const standard = { id: 1, facilityId: 'clinic', insuranceId: '', scheduleName: 'Standard', effectiveFrom: '2026-01-01', effectiveTo: '', procedureFees: [{ code: 101, scheduleFee: 0 }, { code: 102, scheduleFee: 95 }] }

test('new form includes every procedure and preserves zero Standard prices', () => {
  const form = buildFeeForm(procedures, [standard], null, today)
  assert.equal(form.procedureFees.length, 10)
  assert.equal(form.procedureFees[0].scheduleFee, '0')
  assert.equal(form.procedureFees[1].scheduleFee, '95')
  assert.equal(form.procedureFees[2].scheduleFee, '120')
})

test('edit preserves partial HMO coverage and zero rates without enabling missing items', () => {
  const hmo = { ...standard, id: 2, insuranceId: '5', procedureFees: [{ code: 102, scheduleFee: 0 }] }
  const form = buildFeeForm(procedures, [standard, hmo], hmo, today)
  assert.equal(form.procedureFees[0].included, false)
  assert.equal(form.procedureFees[1].included, true)
  assert.equal(form.procedureFees[1].scheduleFee, '0')
  assert.deepEqual(feeFormPayload(form).procedureFees, [{ code: 102, scheduleFee: '0' }])
})

test('editing retains stored items missing from the available catalog', () => {
  const form = buildFeeForm([], [], standard, today)
  assert.equal(form.procedureFees.length, 2)
  assert.equal(form.procedureFees[0].included, true)
})

test('future and expired Standard versions are not used as defaults', () => {
  const future = { ...standard, effectiveFrom: '2027-01-01' }
  const expired = { ...standard, effectiveTo: today }
  assert.equal(buildFeeForm(procedures, [future, expired], null, today).procedureFees[0].scheduleFee, '120')
})

test('latest active Standard version supplies defaults', () => {
  const newer = { ...standard, id: 3, effectiveFrom: '2026-10-01', procedureFees: [{ code: 101, scheduleFee: 55 }] }
  assert.equal(buildFeeForm(procedures, [standard, newer], null, today).procedureFees[0].scheduleFee, '55')
})

test('reject invalid prices and empty schedules; allow zero', () => {
  const form = { ...buildFeeForm(procedures.slice(0, 1), [], null, today), scheduleName: ' Test ' }
  for (const price of ['', '-1', 'NaN', '1.001', '10000000000']) {
    assert.throws(() => feeFormPayload({ ...form, procedureFees: [{ ...form.procedureFees[0], scheduleFee: price }] }))
  }
  assert.throws(() => feeFormPayload({ ...form, procedureFees: [] }))
  assert.equal(feeFormPayload({ ...form, procedureFees: [{ ...form.procedureFees[0], scheduleFee: '0' }] }).scheduleName, 'Test')
})

test('end date is exclusive and must follow start date', () => {
  const form = { ...buildFeeForm(procedures, [], null, today), scheduleName: 'Test', effectiveTo: today }
  assert.throws(() => feeFormPayload(form))
  assert.equal(feeScheduleStatus({ ...standard, effectiveTo: today }, [], today), 'Expired')
})

test('status distinguishes upcoming and superseded versions within the same clinic and plan', () => {
  const newer = { ...standard, id: 3, effectiveFrom: '2026-10-01' }
  assert.equal(feeScheduleStatus(standard, [standard, newer], today), 'Superseded')
  assert.equal(feeScheduleStatus(newer, [standard, newer], today), 'Active')
  assert.equal(feeScheduleStatus({ ...standard, effectiveFrom: '2027-01-01' }, [], today), 'Upcoming')
  assert.equal(feeScheduleStatus(standard, [{ ...newer, insuranceId: '5' }], today), 'Active')
  assert.equal(feeScheduleStatus(standard, [{ ...newer, facilityId: 'another' }], today), 'Active')
})
