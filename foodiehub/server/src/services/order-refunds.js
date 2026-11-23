'use strict';

const { syncCommissionForOrder } = require('./commission-ledger');

const fail = (status, message) => Object.assign(new Error(message), { status });
const toCents = (value) => Math.round(Number(value || 0) * 100);

function normalizedStatus(providerStatus) {
  if (providerStatus === 'processed') return 'processed';
  if (providerStatus === 'failed') return 'failed';
  return 'pending';
}

async function finalizeRefund({ refund, providerRefund, order, Order, transactionFactory, commissionSync = syncCommissionForOrder }) {
  if (!providerRefund?.id || providerRefund.payment_id !== order.razorpayPaymentId || Number(providerRefund.amount) !== toCents(refund.amount)) {
    throw fail(409, 'Razorpay refund details do not match the requested refund amount.');
  }
  const status = normalizedStatus(providerRefund.status);
  const transaction = await transactionFactory();
  try {
    const lockedRefund = await refund.constructor.findByPk(refund.id, { transaction, lock: transaction.LOCK.UPDATE });
    const lockedOrder = await Order.findByPk(lockedRefund.orderId, { transaction, lock: transaction.LOCK.UPDATE });
    const wasProcessed = lockedRefund.status === 'processed';
    await lockedRefund.update({
      razorpayRefundId: providerRefund.id,
      providerStatus: providerRefund.status || null,
      status,
      failureCode: providerRefund.error_code || null,
      processedAt: status === 'processed' ? new Date() : null,
    }, { transaction });
    if (status === 'processed') {
      const processedCents = toCents(await refund.constructor.sum('amount', { where: { orderId: lockedOrder.id, status: 'processed' }, transaction }));
      await lockedOrder.update({ paymentStatus: processedCents >= toCents(lockedOrder.total) ? 'refunded' : 'partially_refunded' }, { transaction });
      if (!wasProcessed) await commissionSync(lockedOrder, transaction);
    } else if (status === 'failed') {
      await lockedOrder.update({ paymentStatus: 'refund_failed' }, { transaction });
    }
    await transaction.commit();
    return lockedRefund;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

async function startFullRefund({ orderId, restaurantId, requestedByUserId, reason, amount = null, Order, OrderRefund, sequelize, gateway, audit, commissionSync = syncCommissionForOrder }) {
  let refund;
  let order;
  const transaction = await sequelize.transaction();
  try {
    order = await Order.findOne({ where: { id: orderId, restaurantId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) throw fail(404, 'Order not found.');
    if (order.paymentMethod !== 'razorpay' || !order.razorpayPaymentId) throw fail(409, 'Only captured Razorpay orders can be refunded through this workflow.');
    if (!['cancelled', 'rejected'].includes(order.status)) throw fail(409, 'Cancel or reject the order before issuing a refund.');
    refund = await OrderRefund.findOne({ where: { orderId: order.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (refund) {
      await transaction.commit();
      return { refund, repeated: true };
    }
    if (!['paid', 'partially_refunded'].includes(order.paymentStatus)) throw fail(409, 'Only captured Razorpay orders can be refunded through this workflow.');
    if (toCents(order.total) <= 0) throw fail(409, 'The order has no refundable amount.');
    const requestedCents = amount == null ? toCents(order.total) : toCents(amount);
    if (requestedCents <= 0 || requestedCents > toCents(order.total)) throw fail(400, 'Refund amount must be greater than zero and no more than the captured order amount.');
    refund = await OrderRefund.create({
      orderId: order.id,
      restaurantId: order.restaurantId,
      requestedByUserId,
      amount: (requestedCents / 100).toFixed(2),
      reason,
      status: 'requested',
    }, { transaction });
    await order.update({ paymentStatus: 'refund_pending' }, { transaction });
    if (audit) await audit({ order, refund, transaction });
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      const existing = await OrderRefund.findOne({ where: { orderId } });
      if (existing) return { refund: existing, repeated: true };
    }
    throw error;
  }

  try {
    const payment = await gateway.payments.fetch(order.razorpayPaymentId);
    if (payment.status !== 'captured' || Number(payment.amount) !== toCents(order.total) || payment.currency !== 'INR' || Number(payment.amount_refunded || 0) !== 0) {
      await refund.update({ status: 'failed', failureCode: 'payment_not_refundable' });
      await order.update({ paymentStatus: 'refund_failed' });
      return { refund, repeated: false };
    }
    const providerRefund = await gateway.payments.refund(order.razorpayPaymentId, {
      amount: toCents(refund.amount),
      notes: { foodiehubRefundId: refund.id, foodiehubOrderId: order.id, reason: reason.slice(0, 250) },
    });
    refund = await finalizeRefund({ refund, providerRefund, order, Order, transactionFactory: () => sequelize.transaction(), commissionSync });
  } catch (error) {
    // An interrupted provider request may have succeeded remotely. Never issue
    // another refund automatically; GET reconciliation searches Razorpay first.
    await refund.update({ status: 'unknown', failureCode: 'provider_result_unknown' });
    await order.update({ paymentStatus: 'refund_pending' });
    return { refund, repeated: false, providerUncertain: true };
  }
  return { refund, repeated: false };
}

async function reconcileRefund({ refund, order, Order, gateway, sequelize, commissionSync }) {
  let providerRefund = null;
  if (refund.razorpayRefundId) {
    providerRefund = await gateway.payments.fetchRefund(order.razorpayPaymentId, refund.razorpayRefundId);
  } else {
    const response = await gateway.payments.fetchMultipleRefund(order.razorpayPaymentId, { count: 100 });
    const refunds = response.items || response;
    providerRefund = refunds.find((item) => item.notes?.foodiehubRefundId === refund.id) || null;
  }
  if (!providerRefund) return refund;
  return finalizeRefund({ refund, providerRefund, order, Order, transactionFactory: () => sequelize.transaction(), commissionSync });
}

module.exports = { startFullRefund, reconcileRefund, normalizedStatus, toCents, finalizeRefund };
