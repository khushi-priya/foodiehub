'use strict';
const Razorpay = require('razorpay');
const { Order, OrderRefund } = require('../../models');
const sequelize = require('../../config/database');
const { recordAuditEvent } = require('../../services/audit-log');
const { startFullRefund, reconcileRefund } = require('../../services/order-refunds');
const { createCustomerNotification } = require('../../services/customer-notifications');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const respond = (res, refund, status = 200, message) => res.status(status).json({ success: true, ...(message ? { message } : {}), data: {
  id: refund.id,
  orderId: refund.orderId,
  amount: Number(refund.amount),
  reason: refund.reason,
  status: refund.status,
  providerStatus: refund.providerStatus,
  reference: refund.razorpayRefundId,
  requestedAt: refund.createdAt,
  processedAt: refund.processedAt,
} });

function gatewayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw fail(503, 'Razorpay is not configured for refunds.');
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

function assertBranchScope(req, order) {
  if (req.restaurantBranchIds && !req.restaurantBranchIds.includes(order.branchId)) throw fail(404, 'Order not found.');
}

exports.create = wrap(async (req, res) => {
  const reason = req.body?.reason;
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 1000) throw fail(400, 'Provide a refund reason between 3 and 1,000 characters.');
  const amount = req.body?.amount;
  if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Math.round(Number(amount) * 100) !== Number(amount) * 100)) throw fail(400, 'Refund amount must be a positive amount with at most two decimal places.');
  const order = await Order.findOne({ where: { id: req.params.orderId, restaurantId: req.restaurant.id } });
  if (!order) throw fail(404, 'Order not found.');
  assertBranchScope(req, order);
  const result = await startFullRefund({
    orderId: order.id,
    restaurantId: req.restaurant.id,
    requestedByUserId: req.authUser.id,
    reason: reason.trim(),
    amount: amount === undefined ? null : Number(amount),
    Order,
    OrderRefund,
    sequelize,
    gateway: gatewayClient(),
    audit: ({ order: beforeOrder, refund, transaction }) => recordAuditEvent(req, {
      action: 'order.refund.requested',
      entityType: 'order',
      entityId: beforeOrder.id,
      reason: refund.reason,
      beforeData: { paymentStatus: beforeOrder.paymentStatus, orderStatus: beforeOrder.status },
      afterData: { refundId: refund.id, amount: refund.amount, status: refund.status },
    }, { transaction }),
  });
  const status = result.providerUncertain ? 202 : result.repeated ? 200 : result.refund.status === 'processed' ? 200 : 202;
  if (result.refund.status === 'processed' && order.customerId) await createCustomerNotification({ app: req.app, customerId: order.customerId, category: 'payments', title: 'Refund processed', message: `The refund for order ${order.orderNumber} has been processed.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `refund-processed:${order.id}` });
  respond(res, result.refund, status, result.providerUncertain
    ? 'The provider response is uncertain. Check refund status before taking further action.'
    : result.repeated ? 'This order already has a refund record.' : 'Refund submitted to Razorpay.');
});

exports.get = wrap(async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.orderId, restaurantId: req.restaurant.id } });
  if (!order) throw fail(404, 'Order not found.');
  assertBranchScope(req, order);
  const refund = await OrderRefund.findOne({ where: { orderId: order.id, restaurantId: req.restaurant.id } });
  if (!refund) throw fail(404, 'No refund has been requested for this order.');
  if (['requested', 'unknown', 'pending'].includes(refund.status)) {
    const updated = await reconcileRefund({ refund, order, Order, gateway: gatewayClient(), sequelize });
    if (updated.status === 'processed' && order.customerId) await createCustomerNotification({ app: req.app, customerId: order.customerId, category: 'payments', title: 'Refund processed', message: `The refund for order ${order.orderNumber} has been processed.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `refund-processed:${order.id}` });
    return respond(res, updated, 200, 'Refund status synchronized with Razorpay.');
  }
  respond(res, refund);
});
