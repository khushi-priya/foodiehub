'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startFullRefund, reconcileRefund } = require('../src/services/order-refunds');

function setup({ providerResponse = { id: 'rfnd_1', payment_id: 'pay_1', amount: 12550, status: 'pending' }, providerError = null } = {}) {
  const state = { rows: new Map(), providerCalls: 0, commissionCalls: 0, commits: 0 };
  const tx = () => ({ LOCK: { UPDATE: 'UPDATE' }, finished: false, async commit() { this.finished = 'commit'; state.commits += 1; }, async rollback() { this.finished = 'rollback'; } });
  const order = { id: 'order-1', restaurantId: 'restaurant-1', status: 'cancelled', paymentMethod: 'razorpay', paymentStatus: 'paid', razorpayPaymentId: 'pay_1', total: '125.50', async update(values) { Object.assign(this, values); } };
  const Order = { async findOne() { return order; }, async findByPk() { return order; } };
  class Refund {
    constructor(values) { Object.assign(this, values); this.createdAt = new Date('2026-11-22T10:00:00Z'); }
    async update(values) { Object.assign(this, values); return this; }
    static async findOne({ where }) { return [...state.rows.values()].find((refund) => refund.orderId === where.orderId) || null; }
    static async create(values) { const refund = new Refund({ id: `refund-${state.rows.size + 1}`, ...values }); state.rows.set(refund.id, refund); return refund; }
    static async findByPk(id) { return state.rows.get(id) || null; }
    static async sum(_field, { where }) { return [...state.rows.values()].filter((refund) => refund.orderId === where.orderId && refund.status === where.status).reduce((sum, refund) => sum + Number(refund.amount || 0), 0); }
  }
  const sequelize = { async transaction() { return tx(); } };
  const gateway = { payments: {
    async fetch() { return { id: 'pay_1', amount: 12550, currency: 'INR', status: 'captured', amount_refunded: 0 }; },
    async refund(paymentId, payload) {
      state.providerCalls += 1;
      state.providerPayload = { paymentId, ...payload };
      if (providerError) throw providerError;
      return providerResponse;
    },
    async fetchRefund(_paymentId, id) { return { id, payment_id: 'pay_1', amount: 12550, status: 'processed', notes: { foodiehubRefundId: 'refund-1' } }; },
    async fetchMultipleRefund() { return { items: [{ id: 'rfnd_1', payment_id: 'pay_1', amount: 12550, status: 'processed', notes: { foodiehubRefundId: 'refund-1' } }] }; },
  } };
  const commissionSync = async () => { state.commissionCalls += 1; };
  return { state, order, Order, OrderRefund: Refund, sequelize, gateway, commissionSync };
}

test('refund requires a cancelled or rejected, paid Razorpay order', async () => {
  const deps = setup();
  deps.order.status = 'preparing';
  await assert.rejects(startFullRefund({ ...deps, orderId: 'order-1', restaurantId: 'restaurant-1', requestedByUserId: 'owner-1', reason: 'Customer cancelled', audit: null }), { status: 409 });
  assert.equal(deps.state.providerCalls, 0);
  assert.equal(deps.state.rows.size, 0);
});

test('creates one full amount refund and keeps payment pending while Razorpay reports pending', async () => {
  const deps = setup();
  const result = await startFullRefund({ ...deps, orderId: 'order-1', restaurantId: 'restaurant-1', requestedByUserId: 'owner-1', reason: 'Order cancelled', audit: null });
  assert.equal(result.refund.status, 'pending');
  assert.equal(result.refund.amount, '125.50');
  assert.equal(deps.state.providerPayload.amount, 12550);
  assert.equal(deps.order.paymentStatus, 'refund_pending');
  assert.equal(deps.state.providerCalls, 1);
});

test('a repeated refund request never creates a second provider refund', async () => {
  const deps = setup();
  await startFullRefund({ ...deps, orderId: 'order-1', restaurantId: 'restaurant-1', requestedByUserId: 'owner-1', reason: 'Order cancelled', audit: null });
  const retry = await startFullRefund({ ...deps, orderId: 'order-1', restaurantId: 'restaurant-1', requestedByUserId: 'owner-1', reason: 'Retry', audit: null });
  assert.equal(retry.repeated, true);
  assert.equal(deps.state.providerCalls, 1);
  assert.equal(deps.state.rows.size, 1);
});

test('an uncertain Razorpay response is recorded and not automatically retried', async () => {
  const deps = setup({ providerError: new Error('socket reset') });
  const result = await startFullRefund({ ...deps, orderId: 'order-1', restaurantId: 'restaurant-1', requestedByUserId: 'owner-1', reason: 'Order cancelled', audit: null });
  assert.equal(result.providerUncertain, true);
  assert.equal(result.refund.status, 'unknown');
  const retry = await startFullRefund({ ...deps, orderId: 'order-1', restaurantId: 'restaurant-1', requestedByUserId: 'owner-1', reason: 'Retry', audit: null });
  assert.equal(retry.repeated, true);
  assert.equal(deps.state.providerCalls, 1);
});

test('reconciliation records a processed refund, marks the order refunded and reverses commission once', async () => {
  const deps = setup();
  const created = await startFullRefund({ ...deps, orderId: 'order-1', restaurantId: 'restaurant-1', requestedByUserId: 'owner-1', reason: 'Order cancelled', audit: null });
  created.refund.status = 'unknown';
  const reconciled = await reconcileRefund({ refund: created.refund, order: deps.order, Order: deps.Order, gateway: deps.gateway, sequelize: deps.sequelize, commissionSync: deps.commissionSync });
  assert.equal(reconciled.status, 'processed');
  assert.equal(deps.order.paymentStatus, 'refunded');
  assert.equal(deps.state.commissionCalls, 1);
  await reconcileRefund({ refund: reconciled, order: deps.order, Order: deps.Order, gateway: deps.gateway, sequelize: deps.sequelize, commissionSync: deps.commissionSync });
  assert.equal(deps.state.commissionCalls, 1);
});
