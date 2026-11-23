const test = require('node:test');
const assert = require('node:assert/strict');
const { reservationTransitionAllowed, reservationIntervalsOverlap, tableOccupancy, branchInScope } = require('../src/services/floor-policy');

test('table occupancy follows orders, seated guests, reservations, cleaning and active flag', () => {
  assert.equal(tableOccupancy({ isActive: true }), 'available');
  assert.equal(tableOccupancy({ isActive: true, futureReservations: 1 }), 'reserved');
  assert.equal(tableOccupancy({ isActive: true, activeOrders: 1 }), 'occupied');
  assert.equal(tableOccupancy({ isActive: true, seatedReservations: 1, futureReservations: 1 }), 'occupied');
  assert.equal(tableOccupancy({ isActive: true, preferredStatus: 'cleaning' }), 'cleaning');
  assert.equal(tableOccupancy({ isActive: false, activeOrders: 1 }), 'inactive');
});

test('reservation intervals reject overlaps but allow adjacent bookings', () => {
  const start = '2026-11-20T18:00:00.000Z';
  const end = '2026-11-20T19:30:00.000Z';
  assert.equal(reservationIntervalsOverlap(start, end, '2026-11-20T19:00:00.000Z', '2026-11-20T20:00:00.000Z'), true);
  assert.equal(reservationIntervalsOverlap(start, end, '2026-11-20T19:30:00.000Z', '2026-11-20T21:00:00.000Z'), false);
});

test('reservation workflow enforces confirm, check-in, seated, completed and terminal states', () => {
  assert.equal(reservationTransitionAllowed('pending', 'confirmed'), true);
  assert.equal(reservationTransitionAllowed('pending', 'rejected'), true);
  assert.equal(reservationTransitionAllowed('confirmed', 'checked_in'), true);
  assert.equal(reservationTransitionAllowed('checked_in', 'seated'), true);
  assert.equal(reservationTransitionAllowed('seated', 'completed'), true);
  assert.equal(reservationTransitionAllowed('completed', 'confirmed'), false);
  assert.equal(reservationTransitionAllowed('cancelled', 'seated'), false);
});

test('restaurant and branch scope rejects cross-restaurant and cross-branch tables', () => {
  assert.equal(branchInScope('restaurant-a', 'restaurant-a', ['branch-1'], 'branch-1'), true);
  assert.equal(branchInScope('restaurant-a', 'restaurant-a', ['branch-1'], 'branch-2'), false);
  assert.equal(branchInScope('restaurant-a', 'restaurant-b', null, 'branch-1'), false);
  assert.equal(branchInScope('restaurant-b', 'restaurant-b', null, 'branch-2'), true);
});
