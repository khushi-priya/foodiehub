const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBranch } = require('../src/modules/restaurants/branch.controller');

function validBranch(overrides = {}) {
  return {
    name: 'Central', branchCode: 'CENTRAL', phone: '9876543210', email: null,
    addressLine: '1 Main Road', city: 'Pune', state: 'Maharashtra', postalCode: '411001', country: 'India',
    openingTime: '18:00', closingTime: '02:00', overnight: true, timeZone: 'Asia/Kolkata',
    workingDays: ['Monday', 'Tuesday'], closedDays: ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    dineInEnabled: true, takeawayEnabled: false, deliveryEnabled: true, cashOnDeliveryEnabled: false,
    razorpayEnabled: true, isPrimary: false, isActive: true,
    ...overrides,
  };
}

test('branch validation accepts nullable optional fields and overnight hours', () => {
  assert.doesNotThrow(() => validateBranch(validBranch({ addressLine2: null, landmark: null })));
});

test('branch validation rejects null or invalid required operating settings', () => {
  for (const overrides of [
    { openingTime: null },
    { closingTime: '18:00' },
    { closingTime: '02:00', overnight: false },
    { timeZone: null },
    { timeZone: 'Mars/Olympus' },
    { workingDays: null },
    { deliveryEnabled: null },
    { isActive: null },
  ]) {
    assert.throws(() => validateBranch(validBranch(overrides)), { status: 400 });
  }
});

test('branch validation rejects equal opening and closing times even when overnight', () => {
  assert.throws(() => validateBranch(validBranch({ openingTime: '18:00', closingTime: '18:00' })), { status: 400 });
});

test('branch validation requires working and closed days to complement one another', () => {
  assert.throws(() => validateBranch(validBranch({ closedDays: ['Monday'] })), { status: 400 });
});
