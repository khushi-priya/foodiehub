const test = require('node:test');
const assert = require('node:assert/strict');
const { assertApprovalTransition, ownerResubmissionFields, ownerCreateApprovalFields, ownerBranchWhere, isCustomerEligibleBranch } = require('../src/services/branch-policy');

const openApproved = {
  isActive: true,
  approvalStatus: 'approved',
  operationalStatus: 'open',
  openingTime: '00:00:00',
  closingTime: '23:59:00',
  timeZone: 'Asia/Kolkata',
  workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

test('Super Admin can approve or reject a pending branch', () => {
  assert.doesNotThrow(() => assertApprovalTransition('pending', 'approved'));
  assert.doesNotThrow(() => assertApprovalTransition('pending', 'rejected'));
});

test('approval transition policy blocks invalid owner/admin state bypasses', () => {
  assert.throws(() => assertApprovalTransition('approved', 'rejected'), { status: 409 });
  assert.throws(() => assertApprovalTransition('pending', 'suspended'), { status: 409 });
  assert.throws(() => assertApprovalTransition('pending', 'active'), { status: 400 });
});

test('editing a rejected branch resubmits it as pending and clears its reason', () => {
  assert.deepEqual(ownerCreateApprovalFields(), { approvalStatus: 'pending', rejectionReason: null });
  assert.deepEqual(ownerResubmissionFields('rejected'), { approvalStatus: 'pending', rejectionReason: null });
  assert.deepEqual(ownerResubmissionFields('approved'), {});
});

test('owner branch lookup is always scoped to the authenticated restaurant', () => {
  assert.deepEqual(ownerBranchWhere('restaurant-a', 'branch-1'), {
    id: 'branch-1',
    restaurantId: 'restaurant-a',
  });
});

test('only approved, active, currently open branches are eligible for customer ordering', () => {
  assert.equal(isCustomerEligibleBranch(openApproved), true);
  assert.equal(isCustomerEligibleBranch({ ...openApproved, approvalStatus: 'pending' }), false);
  assert.equal(isCustomerEligibleBranch({ ...openApproved, approvalStatus: 'suspended' }), false);
  assert.equal(isCustomerEligibleBranch({ ...openApproved, operationalStatus: 'closed' }), true);
  assert.equal(isCustomerEligibleBranch({ ...openApproved, operationalStatus: 'temporarily_closed' }), false);
  assert.equal(isCustomerEligibleBranch({ ...openApproved, isActive: false }), false);
});
