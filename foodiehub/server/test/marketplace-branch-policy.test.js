const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { pendingBranchesVisibleForDevelopment, marketplaceBranchWhere, orderEligibleBranchWhere } = require('../src/services/marketplace-branch-policy');

const originalNodeEnv = process.env.NODE_ENV;
const originalPendingFlag = process.env.FOODIEHUB_DEV_SHOW_PENDING_BRANCHES;

test.after(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalPendingFlag === undefined) delete process.env.FOODIEHUB_DEV_SHOW_PENDING_BRANCHES;
  else process.env.FOODIEHUB_DEV_SHOW_PENDING_BRANCHES = originalPendingFlag;
});

test('development flag adds pending branches to listings without including rejected or suspended', () => {
  process.env.NODE_ENV = 'development';
  process.env.FOODIEHUB_DEV_SHOW_PENDING_BRANCHES = 'true';
  assert.equal(pendingBranchesVisibleForDevelopment(), true);
  assert.deepEqual(marketplaceBranchWhere().approvalStatus[Op.in], ['approved', 'pending']);
});

test('pending test mode cannot be enabled in production or by request parameters', () => {
  process.env.NODE_ENV = 'production';
  process.env.FOODIEHUB_DEV_SHOW_PENDING_BRANCHES = 'true';
  assert.equal(pendingBranchesVisibleForDevelopment(), false);
  assert.equal(marketplaceBranchWhere().approvalStatus, 'approved');
});

test('production marketplace query lists approved active branches even while closed', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.FOODIEHUB_DEV_SHOW_PENDING_BRANCHES;
  const where = marketplaceBranchWhere();
  assert.equal(where.isActive, true);
  assert.equal(where.approvalStatus, 'approved');
  assert.deepEqual(where.operationalStatus[Op.notIn], ['inactive', 'temporarily_closed']);
});

test('order eligibility stays approved-only even when pending branches are visible for development', () => {
  process.env.NODE_ENV = 'development';
  process.env.FOODIEHUB_DEV_SHOW_PENDING_BRANCHES = 'true';
  const where = orderEligibleBranchWhere();
  assert.equal(where.isActive, true);
  assert.equal(where.approvalStatus, 'approved');
  assert.deepEqual(where.operationalStatus[Op.notIn], ['inactive', 'temporarily_closed']);
});
