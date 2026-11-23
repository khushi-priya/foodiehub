'use strict';
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const {
  Order, OrderItem, CustomerCart, CustomerCartItem, Branch, DeliveryAssignment, RestaurantMember, User, CodCollection,
  CashHandover, CashHandoverItem, CommissionRecord, CommissionSettlement,
  CommissionSettlementItem, OrderRefund, OrderPaymentAttempt, RazorpayWebhookEvent,
} = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');
const { createCustomerNotification } = require('../../services/customer-notifications');
const { syncCommissionForOrder } = require('../../services/commission-ledger');
const { reconcileRefund } = require('../../services/order-refunds');
const { changeOrderCouponStatus } = require('../../services/food-coupons');
const Razorpay = require('razorpay');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const cents = (amount) => Math.round(Number(amount || 0) * 100);
const cash = (minor) => Number((minor / 100).toFixed(2));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageArgs = (query) => ({ page: Math.max(1, parseInt(query.page, 10) || 1), limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20)) });

function emitDeliveryCashUpdate(req, branchId, event) {
  const io = req.app.get('io');
  if (!io) return;
  io.to(`delivery:${req.restaurant.id}:${branchId}`).emit('delivery:cash-handover-updated', event);
  if (req.restaurantMembership?.id) io.to(`delivery-employee:${req.restaurant.id}:${req.restaurantMembership.id}`).emit('delivery:cash-handover-updated', event);
}

function filteredWhere(req, { includeBranch = true } = {}) {
  const where = { restaurantId: req.restaurant.id };
  if (req.restaurantBranchIds) where.branchId = { [Op.in]: req.restaurantBranchIds };
  if (includeBranch && req.query.branchId) {
    if (req.restaurantBranchIds && !req.restaurantBranchIds.includes(req.query.branchId)) throw fail(403, 'You do not have access to this branch.');
    where.branchId = req.query.branchId;
  }
  if (req.query.from || req.query.to) {
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime()))) throw fail(400, 'Date filter is invalid.');
    where.createdAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
  }
  return where;
}
function moneyFilter(value, label) {
  const amount = Number(value);
  if (typeof value !== 'number' && typeof value !== 'string' || value === '' || !Number.isFinite(amount) || amount < 0 || Math.round(amount * 100) !== amount * 100) throw fail(400, `${label} must be a non-negative amount with at most two decimal places.`);
  return Math.round(amount * 100);
}
function assertBranch(req, branchId) {
  if (req.restaurantBranchIds && !req.restaurantBranchIds.includes(branchId)) throw fail(403, 'You do not have access to this branch.');
}

exports.overview = wrap(async (req, res) => {
  const where = filteredWhere(req);
  if (req.query.method && req.query.method !== 'all') where.paymentMethod = req.query.method;
  if (req.query.status && req.query.status !== 'all') where.paymentStatus = req.query.status;
  const orders = await Order.findAll({ where, attributes: ['id', 'orderNumber', 'branchId', 'total', 'subtotal', 'discount', 'paymentMethod', 'paymentStatus', 'razorpayOrderId', 'razorpayPaymentId', 'createdAt', 'status'], include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }], order: [['createdAt', 'DESC']], limit: 5000 });
  const ids = orders.map((order) => order.id);
  const [collections, records, recentSettlements] = await Promise.all([
    ids.length ? CodCollection.findAll({ where: { orderId: { [Op.in]: ids } }, order: [['createdAt', 'DESC']] }) : [],
    CommissionRecord.findAll({ where: { restaurantId: req.restaurant.id, ...(req.restaurantBranchIds ? { branchId: { [Op.in]: req.restaurantBranchIds } } : {}), status: { [Op.in]: ['pending', 'settled'] } }, attributes: ['restaurantPayable', 'status', 'orderId'], order: [['transactionAt', 'DESC']], limit: 5000 }),
    CommissionSettlement.findAll({ where: { restaurantId: req.restaurant.id }, order: [['settledAt', 'DESC']], limit: 5 }),
  ]);
  const collectionByOrder = new Map();
  for (const collection of collections) if (!collectionByOrder.has(collection.orderId)) collectionByOrder.set(collection.orderId, collection);
  const valid = orders.filter((order) => !['cancelled', 'rejected'].includes(order.status));
  const onlineCollected = valid.filter((order) => order.paymentMethod === 'razorpay' && ['paid', 'refunded', 'partially_refunded', 'refund_pending', 'refund_failed'].includes(order.paymentStatus)).reduce((sum, order) => sum + cents(order.total), 0);
  const codCollected = collections.filter((row) => ['collected', 'reconciled', 'disputed'].includes(row.status)).reduce((sum, row) => sum + cents(row.collectedAmount), 0);
  const codExpected = valid.filter((order) => order.paymentMethod === 'cash_on_delivery').reduce((sum, order) => sum + cents(order.total), 0);
  const pendingCod = Math.max(0, codExpected - codCollected);
  const refunds = await OrderRefund.findAll({ where: { restaurantId: req.restaurant.id, orderId: { [Op.in]: ids.length ? ids : ['00000000-0000-4000-8000-000000000000'] }, status: { [Op.in]: ['pending', 'processed', 'unknown'] } }, attributes: ['amount', 'status'] });
  const refundTotal = refunds.filter((refund) => refund.status === 'processed').reduce((sum, refund) => sum + cents(refund.amount), 0);
  const confirmedHandoverItems = await CashHandoverItem.findAll({ where: { codCollectionId: { [Op.in]: collections.map((row) => row.id) } }, include: [{ model: CashHandover, as: 'handover', where: { status: 'confirmed' }, attributes: ['id'], required: true }] });
  const confirmedHandoverCents = confirmedHandoverItems.reduce((sum, item) => sum + cents(item.amount), 0);
  const pendingPayable = records.filter((record) => record.status === 'pending').reduce((sum, record) => sum + cents(record.restaurantPayable), 0);
  const settledAmount = records.filter((record) => record.status === 'settled').reduce((sum, record) => sum + cents(record.restaurantPayable), 0);
  const failedPayments = ids.length ? await OrderPaymentAttempt.count({ where: { orderId: { [Op.in]: ids }, status: 'failed' } }) : 0;
  send(res, {
    period: { from: req.query.from || null, to: req.query.to || null },
    totals: {
      eligibleRestaurantSales: cash(valid.filter((order) => order.status === 'completed').reduce((sum, order) => sum + cents(order.total), 0)),
      onlineCollected: cash(onlineCollected), codCollected: cash(codCollected), codAwaitingCollection: cash(pendingCod),
      pendingCodHandover: cash(Math.max(0, codCollected - confirmedHandoverCents)),
      refunds: cash(refundTotal), pendingSettlement: cash(pendingPayable), successfullySettled: cash(settledAmount), failedPayments,
      customerPayments: cash(onlineCollected + codCollected),
    },
    recentTransactions: orders.slice(0, 8).map((order) => ({ ...order.toJSON(), codCollection: collectionByOrder.get(order.id) || null })),
    recentSettlements,
    settlementNote: 'Settlements shown are externally transferred amounts recorded by the platform. FoodieHub does not initiate bank payouts.',
  });
});

exports.transactions = wrap(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const where = filteredWhere(req);
  if (req.query.method && req.query.method !== 'all') where.paymentMethod = req.query.method;
  if (req.query.status && req.query.status !== 'all') where.paymentStatus = req.query.status;
  if (req.query.search?.trim()) {
    const search = `%${req.query.search.trim()}%`;
    where[Op.or] = [{ orderNumber: { [Op.like]: search } }, { razorpayOrderId: { [Op.like]: search } }, { razorpayPaymentId: { [Op.like]: search } }];
  }
  const result = await Order.findAndCountAll({ where, attributes: ['id', 'orderNumber', 'branchId', 'total', 'paymentMethod', 'paymentStatus', 'razorpayOrderId', 'razorpayPaymentId', 'createdAt'], include: [{ model: Branch, as: 'branch', attributes: ['name'], required: false }, { model: OrderRefund, as: 'refund', attributes: ['amount', 'status', 'razorpayRefundId', 'createdAt'], required: false }], order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true });
  send(res, { items: result.rows, pagination: { total: result.count, page, limit, totalPages: Math.ceil(result.count / limit) } });
});

exports.transactionDetails = wrap(async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.orderId, restaurantId: req.restaurant.id, ...(req.restaurantBranchIds ? { branchId: { [Op.in]: req.restaurantBranchIds } } : {}) }, include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }, { model: OrderRefund, as: 'refund', required: false }, { model: OrderPaymentAttempt, as: 'paymentAttempts', attributes: ['gateway', 'gatewayOrderId', 'gatewayPaymentId', 'amount', 'currency', 'status', 'failureCode', 'failureDescription', 'capturedAt', 'createdAt'], required: false }, { model: CodCollection, as: 'codCollections', order: [['createdAt', 'DESC']], required: false }] });
  if (!order) throw fail(404, 'Transaction not found.');
  const result = order.toJSON();
  if (!result.paymentAttempts?.length && order.razorpayOrderId) result.paymentAttempts = [{ gateway: 'razorpay', gatewayOrderId: order.razorpayOrderId, gatewayPaymentId: order.razorpayPaymentId, status: order.paymentStatus, amount: order.total, currency: 'INR', createdAt: order.createdAt }];
  send(res, result);
});

exports.codCollections = wrap(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const where = { ...filteredWhere(req), paymentMethod: 'cash_on_delivery' };
  if (req.query.search?.trim()) where.orderNumber = { [Op.like]: `%${req.query.search.trim()}%` };
  const result = await Order.findAll({ where, attributes: ['id', 'orderNumber', 'branchId', 'customerName', 'customerPhone', 'total', 'paymentStatus', 'status', 'createdAt'], include: [{ model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }], order: [['createdAt', 'DESC']], limit: 5000, distinct: true });
  const ids = result.map((order) => order.id);
  const [collections, assignments] = ids.length ? await Promise.all([
    CodCollection.findAll({ where: { orderId: { [Op.in]: ids } }, order: [['createdAt', 'DESC']] }),
    DeliveryAssignment.findAll({ where: { orderId: { [Op.in]: ids }, restaurantId: req.restaurant.id }, include: [{ model: RestaurantMember, as: 'deliveryEmployee', attributes: ['id', 'employeeId'], include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }] }], order: [['assignedAt', 'DESC']] }),
  ]) : [[], []];
  const colByOrder = new Map(); for (const row of collections) if (!colByOrder.has(row.orderId)) colByOrder.set(row.orderId, row);
  const assByOrder = new Map(); for (const row of assignments) if (!assByOrder.has(row.orderId)) assByOrder.set(row.orderId, row);
  let items = result.map((order) => {
    const collection = colByOrder.get(order.id) || null;
    const assignment = assByOrder.get(order.id) || null;
    return { ...order.toJSON(), collection, assignment, expectedAmount: Number(order.total), actualAmount: collection?.collectedAmount == null ? null : Number(collection.collectedAmount), collectionStatus: collection?.status || 'awaiting_collection', handoverStatus: collection?.status === 'reconciled' ? 'reconciled' : collection?.status === 'disputed' ? 'disputed' : collection?.status === 'collected' ? 'pending_handover' : 'not_handed_over', outstandingAmount: collection && ['collected', 'reconciled'].includes(collection.status) ? 0 : Number(order.total) };
  });
  if (req.query.collectionStatus && req.query.collectionStatus !== 'all') items = items.filter((item) => item.collectionStatus === req.query.collectionStatus);
  if (req.query.handoverStatus && req.query.handoverStatus !== 'all') items = items.filter((item) => item.handoverStatus === req.query.handoverStatus);
  const total = items.length;
  send(res, { items: items.slice((page - 1) * limit, page * limit), pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
});

exports.cashReconciliation = wrap(async (req, res) => {
  if (req.query.branchId) assertBranch(req, req.query.branchId);
  const where = { ...filteredWhere(req), status: { [Op.in]: ['collected', 'reconciled', 'disputed'] } };
  if (req.query.employeeId) where.restaurantMemberId = req.query.employeeId;
  const collections = await CodCollection.findAll({ where, include: [{ model: Order, as: 'order', attributes: ['orderNumber', 'createdAt'] }, { model: Branch, as: 'branch', attributes: ['name'] }, { model: RestaurantMember, as: 'deliveryEmployee', attributes: ['id', 'employeeId'], include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }] }], order: [['createdAt', 'DESC']], limit: 1000 });
  const handoverWhere = { restaurantId: req.restaurant.id, ...(req.restaurantBranchIds ? { branchId: { [Op.in]: req.restaurantBranchIds } } : {}), ...(req.query.branchId ? { branchId: req.query.branchId } : {}), ...(req.query.employeeId ? { restaurantMemberId: req.query.employeeId } : {}) };
  const handovers = await CashHandover.findAll({ where: handoverWhere, include: [{ model: Branch, as: 'branch', attributes: ['name'] }, { model: RestaurantMember, as: 'deliveryEmployee', attributes: ['employeeId'], include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }] }, { model: User, as: 'receiver', attributes: ['firstName', 'lastName'], required: false }, { model: CashHandoverItem, as: 'items', include: [{ model: CodCollection, as: 'collection', include: [{ model: Order, as: 'order', attributes: ['orderNumber'] }] }] }], order: [['submittedAt', 'DESC']], limit: 100 });
  const groupMap = new Map();
  for (const row of collections) {
    const day = new Date(row.collectedAt || row.createdAt).toISOString().slice(0, 10);
    const key = `${day}:${row.branchId}:${row.restaurantMemberId}`;
    const group = groupMap.get(key) || { date: day, branchId: row.branchId, branchName: row.branch?.name, employeeId: row.restaurantMemberId, employee: `${row.deliveryEmployee?.user?.firstName || ''} ${row.deliveryEmployee?.user?.lastName || ''}`.trim(), orders: 0, expectedCents: 0, collectedCents: 0, reconciledCents: 0 };
    group.orders += 1; group.expectedCents += cents(row.expectedAmount); group.collectedCents += cents(row.collectedAmount); if (row.status === 'reconciled') group.reconciledCents += cents(row.collectedAmount); groupMap.set(key, group);
  }
  send(res, { summaries: [...groupMap.values()].map((group) => ({ ...group, expectedCash: cash(group.expectedCents), collectedCash: cash(group.collectedCents), outstandingCash: cash(Math.max(0, group.expectedCents - group.collectedCents)), reconciledCash: cash(group.reconciledCents) })), handovers });
});

exports.settlements = wrap(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  if (req.query.branchId) assertBranch(req, req.query.branchId);
  const where = { restaurantId: req.restaurant.id };
  const [pendingRecords, settlements] = await Promise.all([
    CommissionRecord.findAll({ where: { ...where, status: 'pending', ...(req.restaurantBranchIds ? { branchId: { [Op.in]: req.restaurantBranchIds } } : {}), ...(req.query.branchId ? { branchId: req.query.branchId } : {}) }, include: [{ model: Order, as: 'order', attributes: ['orderNumber', 'completedAt'] }, { model: Branch, as: 'branch', attributes: ['name'], required: false }], order: [['transactionAt', 'DESC']], limit: 500 }),
    CommissionSettlement.findAndCountAll({ where, include: [{ model: CommissionSettlementItem, as: 'items', include: [{ model: CommissionRecord, as: 'commissionRecord', ...(req.restaurantBranchIds || req.query.branchId ? { where: { branchId: req.query.branchId || { [Op.in]: req.restaurantBranchIds } }, required: true } : {}), include: [{ model: Order, as: 'order', attributes: ['orderNumber'] }, { model: Branch, as: 'branch', attributes: ['name'], required: false }] }] }], order: [['settledAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true }),
  ]);
  const settledRows = settlements.rows.map((row) => {
    const value = row.toJSON();
    const allowedItems = value.items || [];
    value.visibleAmount = cash(allowedItems.reduce((sum, item) => sum + cents(item.amount), 0));
    value.amount = value.visibleAmount;
    return value;
  });
  send(res, { pendingRecords, pendingAmount: cash(pendingRecords.reduce((sum, row) => sum + cents(row.restaurantPayable), 0)), settlements: settledRows, pagination: { total: settlements.count, page, limit, totalPages: Math.ceil(settlements.count / limit) }, payoutMode: 'manual_external_transfer', message: 'Settlement batches are recorded only after an external bank transfer is made and its reference is supplied.' });
});

exports.refunds = wrap(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const where = { restaurantId: req.restaurant.id, status: { [Op.in]: ['cancelled', 'rejected'] }, paymentMethod: 'razorpay', paymentStatus: { [Op.in]: ['paid', 'refunded', 'partially_refunded', 'refund_pending', 'refund_failed'] }, ...(req.restaurantBranchIds ? { branchId: { [Op.in]: req.restaurantBranchIds } } : {}) };
  if (req.query.branchId) { assertBranch(req, req.query.branchId); where.branchId = req.query.branchId; }
  const result = await Order.findAndCountAll({ where, include: [{ model: OrderRefund, as: 'refund', required: false }, { model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }], order: [['updatedAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true });
  send(res, { items: result.rows, pagination: { total: result.count, page, limit, totalPages: Math.ceil(result.count / limit) }, note: 'Refunds are processed through the existing Razorpay refund service.' });
});

exports.confirmCodCollection = wrap(async (req, res) => {
  const { outcome, amount, reason, requestKey } = req.body || {};
  if (!['collected', 'collection_failed'].includes(outcome)) throw fail(400, 'Choose collected or collection_failed.');
  if (!UUID.test(requestKey || '')) throw fail(400, 'A valid collection request key is required.');
  if (outcome === 'collection_failed' && (typeof reason !== 'string' || reason.trim().length < 3)) throw fail(400, 'Provide a reason for the failed cash collection.');
  const transaction = await Order.sequelize.transaction();
  try {
    const assignment = await DeliveryAssignment.findOne({ where: { id: req.params.assignmentId, restaurantId: req.restaurant.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!assignment || assignment.restaurantMemberId !== req.restaurantMembership.id) throw fail(404, 'Assigned delivery not found.');
    assertBranch(req, assignment.branchId);
    if (assignment.status !== 'at_customer') throw fail(409, 'COD can only be recorded after the associate confirms arrival at the customer.');
    const order = await Order.findOne({ where: { id: assignment.orderId, restaurantId: req.restaurant.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order || order.paymentMethod !== 'cash_on_delivery') throw fail(409, 'This delivery does not have a COD balance.');
    const repeated = await CodCollection.findOne({ where: { requestKey }, transaction, lock: transaction.LOCK.UPDATE });
    if (repeated) {
      if (repeated.orderId !== order.id || repeated.assignmentId !== assignment.id || repeated.restaurantMemberId !== req.restaurantMembership.id) throw fail(409, 'This collection request key has already been used.');
      await transaction.commit(); return send(res, repeated, 200);
    }
    const alreadyCollected = await CodCollection.findOne({ where: { orderId: order.id, status: { [Op.in]: ['collected', 'reconciled', 'disputed'] } }, transaction, lock: transaction.LOCK.UPDATE });
    if (alreadyCollected) throw fail(409, 'COD collection is already recorded for this order.');
    const expected = cents(order.total);
    const actual = outcome === 'collected' ? moneyFilter(amount, 'Collected amount') : null;
    if (actual !== null && actual !== expected) throw fail(409, 'Collected amount must match the full COD amount. Partial collection is not enabled.');
    const row = await CodCollection.create({ orderId: order.id, assignmentId: assignment.id, restaurantId: order.restaurantId, branchId: order.branchId, restaurantMemberId: assignment.restaurantMemberId, expectedAmount: cash(expected), collectedAmount: actual === null ? null : cash(actual), status: outcome, reason: reason?.trim().slice(0, 1000) || null, requestKey, collectedAt: actual === null ? null : new Date() }, { transaction });
    if (outcome === 'collected') await order.update({ paymentStatus: 'paid' }, { transaction });
    await recordAuditEvent(req, { action: `cod.${outcome}`, entityType: 'order', entityId: order.id, reason: row.reason, afterData: { collectionId: row.id, expectedAmount: row.expectedAmount, collectedAmount: row.collectedAmount, status: row.status } }, { transaction });
    await transaction.commit();
    emitDeliveryCashUpdate(req, assignment.branchId, { orderId: order.id, assignmentId: assignment.id, collectionId: row.id, status: row.status });
    if (order.customerId) await createCustomerNotification({ app: req.app, customerId: order.customerId, category: 'payments', title: outcome === 'collected' ? 'Cash payment collected' : 'Cash collection issue', message: outcome === 'collected' ? `Cash payment for order ${order.orderNumber} was collected.` : `There was an issue collecting cash for order ${order.orderNumber}.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `cod:${row.id}` });
    send(res, row, 201);
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.resolveCodCollection = wrap(async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5) throw fail(400, 'Explain how the failed cash collection was resolved (at least 5 characters).');
  const transaction = await Order.sequelize.transaction();
  try {
    const collection = await CodCollection.findOne({ where: { id: req.params.collectionId, restaurantId: req.restaurant.id, ...(req.restaurantBranchIds ? { branchId: { [Op.in]: req.restaurantBranchIds } } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!collection) throw fail(404, 'COD collection record not found.');
    assertBranch(req, collection.branchId);
    if (collection.status !== 'collection_failed' || collection.resolutionStatus === 'resolved') throw fail(409, 'Only an unresolved failed COD collection can be resolved.');
    await collection.update({ resolutionStatus: 'resolved', resolutionReason: reason.slice(0, 1000), resolvedByUserId: req.authUser.id, resolvedAt: new Date() }, { transaction });
    await recordAuditEvent(req, { action: 'cod.collection_failure.resolved', entityType: 'cod_collection', entityId: collection.id, reason, afterData: { resolutionStatus: 'resolved', paymentRemainsPending: true } }, { transaction });
    await transaction.commit();
    emitDeliveryCashUpdate(req, collection.branchId, { orderId: collection.orderId, collectionId: collection.id, status: collection.status, resolutionStatus: 'resolved' });
    send(res, collection);
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.submitCashHandover = wrap(async (req, res) => {
  const { branchId, amount, idempotencyKey, notes } = req.body || {};
  if (!UUID.test(idempotencyKey || '')) throw fail(400, 'A valid handover idempotency key is required.');
  const submittedCents = moneyFilter(amount, 'Handover amount');
  const transaction = await Order.sequelize.transaction();
  try {
    assertBranch(req, branchId);
    const branch = await Branch.findOne({ where: { id: branchId, restaurantId: req.restaurant.id }, transaction });
    if (!branch) throw fail(404, 'Branch not found.');
    const repeated = await CashHandover.findOne({ where: { idempotencyKey }, transaction, lock: transaction.LOCK.UPDATE });
    if (repeated) {
      if (repeated.restaurantId !== req.restaurant.id || repeated.branchId !== branchId || repeated.restaurantMemberId !== req.restaurantMembership.id) throw fail(409, 'This handover request key has already been used.');
      await transaction.commit(); return send(res, repeated, 200);
    }
    const collections = await CodCollection.findAll({ where: { restaurantId: req.restaurant.id, branchId, restaurantMemberId: req.restaurantMembership.id, status: 'collected' }, include: [{ model: CashHandoverItem, as: 'handoverItems', required: false }], transaction, lock: transaction.LOCK.UPDATE });
    const eligible = collections.filter((row) => !row.handoverItems?.length);
    if (!eligible.length) throw fail(409, 'There is no unhanded collected cash for this branch.');
    const expectedCents = eligible.reduce((sum, row) => sum + cents(row.collectedAmount), 0);
    if (submittedCents > expectedCents) throw fail(409, 'Submitted cash cannot exceed COD amounts actually collected and eligible for handover.');
    const handover = await CashHandover.create({ restaurantId: req.restaurant.id, branchId, restaurantMemberId: req.restaurantMembership.id, expectedAmount: cash(expectedCents), submittedAmount: cash(submittedCents), status: 'pending', idempotencyKey, submittedAt: new Date(), notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) : null }, { transaction });
    await CashHandoverItem.bulkCreate(eligible.map((row) => ({ handoverId: handover.id, codCollectionId: row.id, amount: row.collectedAmount })), { transaction });
    await recordAuditEvent(req, { action: 'cod.cash_handover.submitted', entityType: 'cash_handover', entityId: handover.id, afterData: { expectedAmount: handover.expectedAmount, submittedAmount: handover.submittedAmount, collectionIds: eligible.map((row) => row.id) } }, { transaction });
    await transaction.commit();
    emitDeliveryCashUpdate(req, handover.branchId, { handoverId: handover.id, status: handover.status, submittedAmount: handover.submittedAmount });
    send(res, handover, 201);
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.confirmCashHandover = wrap(async (req, res) => {
  const { receivedAmount, disputeReason } = req.body || {};
  if ((receivedAmount === undefined) === (typeof disputeReason !== 'string' || disputeReason.trim().length < 3)) throw fail(400, 'Enter the actual amount received or provide a dispute reason.');
  const transaction = await Order.sequelize.transaction();
  try {
    const handover = await CashHandover.findOne({ where: { id: req.params.handoverId, restaurantId: req.restaurant.id, ...(req.restaurantBranchIds ? { branchId: { [Op.in]: req.restaurantBranchIds } } : {}) }, include: [{ model: RestaurantMember, as: 'deliveryEmployee', attributes: ['id', 'userId'] }, { model: CashHandoverItem, as: 'items' }], transaction, lock: transaction.LOCK.UPDATE });
    if (!handover) throw fail(404, 'Cash handover not found.');
    assertBranch(req, handover.branchId);
    if (handover.status !== 'pending') throw fail(409, 'This handover has already been verified or disputed.');
    if (handover.deliveryEmployee?.userId === req.authUser.id) throw fail(403, 'The associate who submitted cash cannot verify their own handover.');
    let status = 'disputed'; let actualCents = null;
    if (receivedAmount !== undefined) {
      actualCents = moneyFilter(receivedAmount, 'Received amount');
      status = actualCents === cents(handover.expectedAmount) && cents(handover.submittedAmount) === cents(handover.expectedAmount) ? 'confirmed' : 'disputed';
    }
    await handover.update({ status, receivedAmount: actualCents === null ? null : cash(actualCents), receivedByUserId: req.authUser.id, receivedAt: new Date(), notes: disputeReason?.trim().slice(0, 1000) || handover.notes }, { transaction });
    const collectionIds = handover.items.map((item) => item.codCollectionId);
    if (collectionIds.length) await CodCollection.update({ status: status === 'confirmed' ? 'reconciled' : 'disputed' }, { where: { id: { [Op.in]: collectionIds }, status: { [Op.in]: ['collected', 'disputed'] } }, transaction });
    await recordAuditEvent(req, { action: status === 'confirmed' ? 'cod.cash_handover.confirmed' : 'cod.cash_handover.disputed', entityType: 'cash_handover', entityId: handover.id, reason: disputeReason || null, beforeData: { status: 'pending' }, afterData: { status, expectedAmount: handover.expectedAmount, submittedAmount: handover.submittedAmount, receivedAmount: handover.receivedAmount, receivedByUserId: req.authUser.id } }, { transaction });
    await transaction.commit();
    emitDeliveryCashUpdate(req, handover.branchId, { handoverId: handover.id, status, submittedAmount: handover.submittedAmount, receivedAmount: handover.receivedAmount });
    send(res, handover);
  } catch (error) { if (!transaction.finished) await transaction.rollback(); throw error; }
});

exports.razorpayWebhook = wrap(async (req, res) => {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) throw fail(503, 'Razorpay webhook is not configured.');
  const rawBody = req.rawBody;
  const signature = req.get('x-razorpay-signature');
  const eventId = req.get('x-razorpay-event-id');
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !eventId || eventId.length > 100) throw fail(400, 'Webhook signature or event identifier is missing.');
  const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest();
  let receivedSignature;
  try { receivedSignature = Buffer.from(signature, 'hex'); } catch { throw fail(400, 'Webhook signature is invalid.'); }
  if (receivedSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(receivedSignature, expectedSignature)) throw fail(400, 'Webhook signature is invalid.');
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); } catch { throw fail(400, 'Webhook body is invalid.'); }
  const eventType = payload.event;
  const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity || payload.payload?.refund?.entity || {};
  const gatewayOrderId = entity.order_id || entity.id || null;
  const gatewayPaymentId = entity.payment_id || entity.id || null;
  let event;
  try {
    event = await RazorpayWebhookEvent.create({ eventId, eventType, gatewayOrderId, gatewayPaymentId, status: 'processing' });
  } catch (error) {
    if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    event = await RazorpayWebhookEvent.findOne({ where: { eventId } });
    if (event?.status === 'processed' || event?.status === 'ignored') return res.status(200).json({ success: true, duplicate: true });
    if (!event) throw fail(500, 'Webhook could not be safely recorded.');
    await event.update({ status: 'processing', result: null });
  }
  try {
    const supported = ['payment.captured', 'order.paid', 'payment.failed', 'refund.created', 'refund.processed', 'refund.failed'];
    if (!supported.includes(eventType)) { await event.update({ status: 'ignored', result: 'Unsupported event type.', processedAt: new Date() }); return res.status(200).json({ success: true, ignored: true }); }
    const lookupOrderId = payload.payload?.payment?.entity?.order_id || payload.payload?.order?.entity?.id;
    const matchingAttempt = lookupOrderId ? await OrderPaymentAttempt.findOne({ where: { gatewayOrderId: lookupOrderId } }) : null;
    const order = lookupOrderId ? await Order.findOne({ where: { ...(matchingAttempt ? { id: matchingAttempt.orderId } : { razorpayOrderId: lookupOrderId }), paymentMethod: 'razorpay' } }) : null;
    if (!order && ['payment.captured', 'order.paid', 'payment.failed'].includes(eventType)) throw fail(404, 'Payment order is not yet available for this webhook.');
    if (order && ['payment.captured', 'order.paid'].includes(eventType)) {
      const gateway = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      let paymentId = payload.payload?.payment?.entity?.id || payload.payload?.order?.entity?.payments?.[0]?.id;
      if (!paymentId && eventType === 'order.paid' && gateway.orders.fetchPayments) {
        const paymentList = await gateway.orders.fetchPayments(lookupOrderId);
        paymentId = (paymentList.items || []).find((entry) => entry.status === 'captured')?.id;
      }
      if (!paymentId) throw fail(409, 'Captured payment identifier is missing.');
      const payment = await gateway.payments.fetch(paymentId);
      if (payment.order_id !== lookupOrderId || Number(payment.amount) !== cents(order.total) || payment.currency !== 'INR' || payment.status !== 'captured') throw fail(409, 'Gateway payment does not match a captured full order payment.');
      await Order.sequelize.transaction(async (transaction) => {
        const locked = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
        const wasPaid = locked.paymentStatus === 'paid';
        if (!wasPaid) await locked.update({ paymentStatus: 'paid', razorpayOrderId: lookupOrderId, razorpayPaymentId: payment.id }, { transaction });
        await OrderPaymentAttempt.update({ gatewayPaymentId: payment.id, status: 'captured', capturedAt: new Date(), failureCode: null, failureDescription: null }, { where: { orderId: locked.id, gatewayOrderId: lookupOrderId }, transaction });
        await syncCommissionForOrder(locked, transaction);
        if (!['cancelled', 'rejected'].includes(locked.status)) {
          await changeOrderCouponStatus(locked.id, 'redeemed', transaction);
          const cart = await CustomerCart.findOne({ where: { customerId: locked.customerId, restaurantId: locked.restaurantId, branchId: locked.branchId, tableId: locked.tableId }, include: [{ model: CustomerCartItem, as: 'items' }], transaction, lock: transaction.LOCK.UPDATE });
          if (cart?.items?.length) {
            const orderItems = await OrderItem.findAll({ where: { orderId: locked.id }, transaction });
            const lineKey = (line) => JSON.stringify([line.menuItemId, line.variantOptionId || null, [...(line.addonOptionIds || [])].sort(), line.quantity]);
            const cartLines = cart.items.map(lineKey).sort();
            const orderedLines = orderItems.map((line) => JSON.stringify([line.menuItemId, line.variantOptionId || null, (line.addonsSnapshot || []).map((addon) => addon.id).sort(), line.quantity])).sort();
            if (JSON.stringify(cartLines) === JSON.stringify(orderedLines)) await cart.destroy({ transaction });
          }
        }
        if (!wasPaid && locked.customerId) await createCustomerNotification({ app: req.app, customerId: locked.customerId, category: 'payments', title: 'Payment received', message: `Payment for order ${locked.orderNumber} was confirmed by Razorpay.`, href: `/customer/orders/${locked.id}`, entityId: locked.id, dedupeKey: `payment-paid:${locked.id}`, transaction });
        if (wasPaid && locked.razorpayPaymentId && locked.razorpayPaymentId !== payment.id) await recordAuditEvent(req, { action: 'payment.duplicate_capture_detected', entityType: 'order', entityId: locked.id, reason: 'A second captured Razorpay payment was reported for the same order.', afterData: { existingPaymentId: locked.razorpayPaymentId, additionalPaymentId: payment.id, gatewayOrderId: lookupOrderId } }, { transaction });
        await event.update({ status: 'processed', result: 'Captured payment verified.', processedAt: new Date() }, { transaction });
      });
    } else if (order && eventType === 'payment.failed') {
      await Order.sequelize.transaction(async (transaction) => {
        const locked = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
        await OrderPaymentAttempt.update({ gatewayPaymentId: payload.payload?.payment?.entity?.id || null, status: 'failed', failureCode: entity.error_code || null, failureDescription: String(entity.error_description || entity.error_reason || '').slice(0, 500) || null }, { where: { orderId: order.id, gatewayOrderId: lookupOrderId }, transaction });
        if (locked.paymentStatus !== 'paid' && locked.razorpayOrderId === lookupOrderId) {
          await locked.update({ paymentStatus: 'failed' }, { transaction });
          if (locked.customerId) await createCustomerNotification({ app: req.app, customerId: locked.customerId, category: 'payments', title: 'Payment did not complete', message: `Payment for order ${locked.orderNumber} was not completed. You can retry from order details.`, href: `/customer/orders/${locked.id}`, entityId: locked.id, dedupeKey: `payment-failed:${locked.id}:${payload.payload?.payment?.entity?.id || 'webhook'}`, transaction });
        }
      });
      await event.update({ status: 'processed', result: 'Failed payment recorded unless superseded by a captured payment.', processedAt: new Date() });
    } else if (eventType.startsWith('refund.') && entity.payment_id) {
      const gateway = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      await gateway.payments.fetch(entity.payment_id);
      const refundOrder = await Order.findOne({ where: { razorpayPaymentId: entity.payment_id, paymentMethod: 'razorpay' } });
      const refund = refundOrder ? await OrderRefund.findOne({ where: { orderId: refundOrder.id, restaurantId: refundOrder.restaurantId } }) : null;
      if (refundOrder && refund) await reconcileRefund({ refund, order: refundOrder, Order, gateway, sequelize: Order.sequelize });
      await event.update({ status: refund ? 'processed' : 'ignored', result: refund ? 'Refund status reconciled from the gateway.' : 'Refund event did not match a locally recorded refund.', processedAt: new Date() });
    } else {
      await event.update({ status: 'processed', result: 'Event retained for payment reconciliation.', processedAt: new Date() });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    await event.update({ status: 'failed', result: error.message.slice(0, 500) }).catch(() => {});
    throw error;
  }
});
