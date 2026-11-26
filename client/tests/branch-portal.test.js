import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchAPI, DEFAULT_BRANCHES } from '../services/branch.js';

test('DEFAULT_BRANCHES includes Katipunan Branch and QC Branch', () => {
  const katipunan = DEFAULT_BRANCHES.find(b => b.abbreviation === 'KAT' || b.name.includes('Katipunan'));
  const qc = DEFAULT_BRANCHES.find(b => b.abbreviation === 'QC' || b.name.includes('QC'));

  assert.ok(katipunan, 'Katipunan Branch should exist');
  assert.equal(katipunan.name, 'Katipunan Branch');
  assert.ok(katipunan.address.includes('Katipunan'));

  assert.ok(qc, 'QC Branch should exist');
  assert.equal(qc.name, 'QC Branch');
  assert.ok(qc.address.includes('Diliman') || qc.address.includes('Quezon'));
});

test('getRoomsForBranch returns branch-specific rooms for Katipunan', async () => {
  const katipunanRooms = await branchAPI.getRoomsForBranch('branch-katipunan');
  assert.ok(katipunanRooms.length > 0, 'Katipunan should have rooms configured');
  assert.ok(katipunanRooms.some(r => r.name.includes('Katipunan') || r.code.includes('KAT')));

  // None of Katipunan rooms should be QC rooms
  assert.ok(!katipunanRooms.some(r => r.name.includes('QC -') || r.code.includes('QC-')));
});

test('getRoomsForBranch returns branch-specific rooms for QC Branch', async () => {
  const qcRooms = await branchAPI.getRoomsForBranch('branch-qc');
  assert.ok(qcRooms.length > 0, 'QC Branch should have rooms configured');
  assert.ok(qcRooms.some(r => r.name.includes('QC') || r.code.includes('QC')));

  // None of QC rooms should be Katipunan rooms
  assert.ok(!qcRooms.some(r => r.name.includes('Katipunan') || r.code.includes('KAT-')));
});

test('getRoomsForBranch for "all" returns rooms from all branches', async () => {
  const allRooms = await branchAPI.getRoomsForBranch('all');
  assert.ok(allRooms.length >= 8, 'All branches combined should return all rooms');
  assert.ok(allRooms.some(r => r.name.includes('Katipunan')));
  assert.ok(allRooms.some(r => r.name.includes('QC')));
});

test('branchAPI.getBranches returns both Katipunan and QC branches', async () => {
  const branches = await branchAPI.getBranches();
  const katipunan = branches.find(b => b.abbreviation === 'KAT');
  const qc = branches.find(b => b.abbreviation === 'QC');

  assert.ok(katipunan, 'Katipunan branch must be in branches list');
  assert.ok(qc, 'QC branch must be in branches list');
});
