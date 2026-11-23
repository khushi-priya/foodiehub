'use strict';

const crypto = require('node:crypto');
const Razorpay = require('razorpay');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const { Branch, MenuItem, MenuCategory, MenuItemOption, RestaurantTable, Order, OrderItem, PosOrderRequest, PosTender } = require('../../models');
const { resolveSelection } = require('../customer/checkout.controller');
const { occupyForOrder, emitFloorEvent } = require('../../services/table-operations');
const { recordAuditEvent } = require('../../services/audit-log');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data, status = 200, message) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const cents = (value) => Math.round(Number(value || 0) * 100);
const cash = (value) => Number((value / 100).toFixed(2));
const validUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const razorpayConfigured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const gateway = () => {
  if (!razorpayConfigured()) throw fail(503, 'Razorpay is not configured on the server.');
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
};
const branchScope = (req) => req.restaurantBranchIds === null ? {} : { id: { [Op.in]: req.restaurantBranchIds } };

async function getBranch(req, branchId, transaction) {
  if (!validUuid(branchId)) throw fail(400, 'Choose a valid branch.');
  const branch = await Branch.findOne({ where: { id: branchId, restaurantId: req.restaurant.id, isActive: true, ...branchScope(req) }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!branch) throw fail(404, 'Branch not found or unavailable.');
  return branch;
}

async function tenderBalance(order, transaction, lock = false) {
  const tenders = await PosTender.findAll({ where: { orderId: order.id, status: { [Op.in]: ['pending', 'paid'] } }, transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) });
  const paidCents = tenders.filter((tender) => tender.status === 'paid').reduce((sum, tender) => sum + cents(tender.amount), 0);
  const pending = tenders.find((tender) => tender.status === 'pending');
  return { tenders, paidCents, dueCents: Math.max(0, cents(order.total) - paidCents), pending };
}

async function serializeOrder(order, transaction) {
  const [items, tenders] = await Promise.all([
    OrderItem.findAll({ where: { orderId: order.id }, order: [['createdAt', 'ASC']], transaction }),
    PosTender.findAll({ where: { orderId: order.id }, order: [['createdAt', 'ASC']], transaction }),
  ]);
  const paidCents = tenders.filter((row) => row.status === 'paid').reduce((sum, row) => sum + cents(row.amount), 0);
  return {
    id: order.id, orderNumber: order.orderNumber, restaurantId: order.restaurantId, branchId: order.branchId,
    orderType: order.orderType, tableId: order.tableId, status: order.status, paymentStatus: order.paymentStatus,
    customerName: order.customerName, customerPhone: order.customerPhone, subtotal: Number(order.subtotal), total: Number(order.total),
    paidAmount: cash(paidCents), balanceDue: cash(Math.max(0, cents(order.total) - paidCents)),
    createdAt: order.createdAt, items: items.map((row) => ({ id: row.id, menuItemId: row.menuItemId, name: row.itemName, variantName: row.variantName, addons: row.addonsSnapshot || [], quantity: row.quantity, unitPrice: Number(row.unitPrice), lineTotal: Number(row.lineTotal), note: row.itemNotes })),
    tenders: tenders.map((row) => ({ id: row.id, method: row.method, status: row.status, amount: Number(row.amount), reference: row.reference, createdAt: row.createdAt })),
  };
}

exports.getBranches = wrap(async (req, res) => {
  const branches = await Branch.findAll({ where: { restaurantId: req.restaurant.id, isActive: true, ...branchScope(req) }, attributes: ['id', 'name', 'branchCode', 'takeawayEnabled', 'dineInEnabled'], order: [['name', 'ASC']] });
  send(res, branches);
});

exports.getMenu = wrap(async (req, res) => {
  const branch = await getBranch(req, req.query.branchId);
  const items = await MenuItem.findAll({
    where: { restaurantId: req.restaurant.id, isActive: true, isAvailable: true, moderationStatus: 'clear' },
    include: [{ model: MenuCategory, as: 'category', where: { isActive: true }, required: true, attributes: ['id', 'name'] }],
    order: [['displayOrder', 'ASC'], ['name', 'ASC']],
  });
  const options = items.length ? await MenuItemOption.findAll({ where: { restaurantId: req.restaurant.id, menuItemId: { [Op.in]: items.map((item) => item.id) } }, order: [['displayOrder', 'ASC'], ['name', 'ASC']] }) : [];
  const grouped = new Map();
  for (const option of options) grouped.set(option.menuItemId, [...(grouped.get(option.menuItemId) || []), { id: option.id, type: option.type, name: option.name, price: Number(option.price) }]);
  send(res, { branch: { id: branch.id, name: branch.name, takeawayEnabled: branch.takeawayEnabled, dineInEnabled: branch.dineInEnabled }, items: items.map((item) => ({ id: item.id, name: item.name, description: item.description, price: Number(item.discountedPrice ?? item.price), foodType: item.foodType, category: item.category?.name, options: grouped.get(item.id) || [] })) });
});

exports.getTables = wrap(async (req, res) => {
  const branch = await getBranch(req, req.query.branchId);
  const tables = await RestaurantTable.findAll({ where: { restaurantId: req.restaurant.id, branchId: branch.id, isActive: true }, attributes: ['id', 'tableNumber', 'seatingCapacity', 'occupancyStatus'], order: [['tableNumber', 'ASC']] });
  send(res, tables);
});

exports.createOrder = wrap(async (req, res) => {
  const { branchId, orderType, tableId = null, customerName = 'Walk-in Customer', customerPhone = null, items, idempotencyKey, note = null } = req.body || {};
  if (!validUuid(idempotencyKey)) throw fail(400, 'A valid idempotency key is required.');
  if (!['takeaway', 'dine_in'].includes(orderType)) throw fail(400, 'POS supports takeaway or dine-in orders.');
  if (typeof customerName !== 'string' || !customerName.trim() || customerName.trim().length > 150) throw fail(400, 'Enter a customer name up to 150 characters.');
  if (customerPhone != null && (typeof customerPhone !== 'string' || customerPhone.length > 20)) throw fail(400, 'Customer phone must be 20 characters or fewer.');
  if (note != null && (typeof note !== 'string' || note.length > 2000)) throw fail(400, 'Order note must be 2,000 characters or fewer.');
  if (!Array.isArray(items) || !items.length || items.length > 100) throw fail(400, 'Add between 1 and 100 menu lines.');
  if (orderType === 'dine_in' && !validUuid(tableId)) throw fail(400, 'Select an active dine-in table.');
  if (orderType === 'takeaway' && tableId) throw fail(400, 'Takeaway orders cannot be assigned to a table.');
  const normalized = { branchId, orderType, tableId, customerName: customerName.trim(), customerPhone: customerPhone?.trim() || null, items, note: note?.trim() || null };
  const requestHash = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  let order;
  try {
    order = await sequelize.transaction(async (transaction) => {
      const prior = await PosOrderRequest.findOne({ where: { idempotencyKey }, transaction, lock: transaction.LOCK.UPDATE });
      if (prior) {
        if (prior.restaurantId !== req.restaurant.id || prior.branchId !== branchId || prior.requestHash !== requestHash) throw fail(409, 'This POS idempotency key was already used for a different order.');
        const replay = await Order.findOne({ where: { id: prior.orderId, restaurantId: req.restaurant.id, branchId }, transaction });
        if (!replay) throw fail(409, 'The order for this POS retry is no longer available.');
        return replay;
      }
      const branch = await getBranch(req, branchId, transaction);
      if (orderType === 'takeaway' && !branch.takeawayEnabled) throw fail(409, 'Takeaway is not enabled for this branch.');
      if (orderType === 'dine_in' && !branch.dineInEnabled) throw fail(409, 'Dine-in is not enabled for this branch.');
      const table = orderType === 'dine_in' ? await RestaurantTable.findOne({ where: { id: tableId, restaurantId: req.restaurant.id, branchId, isActive: true }, transaction, lock: transaction.LOCK.UPDATE }) : null;
      if (orderType === 'dine_in' && !table) throw fail(409, 'The selected table is not active in this branch.');
      const priced = [];
      for (const line of items) {
        if (!line || typeof line.menuItemId !== 'string') throw fail(400, 'Every line needs a menu item.');
        const selection = await resolveSelection({ restaurantId: req.restaurant.id, itemId: line.menuItemId, variantId: line.variantOptionId || null, addonIds: line.addonOptionIds || [], quantity: line.quantity, transaction });
        if (line.note != null && (typeof line.note !== 'string' || line.note.length > 500)) throw fail(400, 'An item note must be 500 characters or fewer.');
        priced.push({ line, ...selection });
      }
      const subtotalCents = priced.reduce((sum, line) => sum + line.lineCents, 0);
      const created = await Order.create({
        restaurantId: req.restaurant.id, customerId: null, branchId, tableId: table?.id || null,
        orderType, idempotencyKey: null, orderNumber: `FH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
        status: 'accepted', paymentStatus: 'pending', paymentMethod: 'pos_pending', subtotal: cash(subtotalCents), tax: 0, deliveryFee: 0, packagingFee: 0, discount: 0, total: cash(subtotalCents),
        customerName: normalized.customerName, customerPhone: normalized.customerPhone, customerEmail: null, deliveryAddress: null, customerNotes: normalized.note, acceptedAt: new Date(),
      }, { transaction });
      await OrderItem.bulkCreate(priced.map(({ line, item, variant, addons, unitCents, lineCents }) => ({ orderId: created.id, menuItemId: item.id, itemName: item.name, itemDescription: item.description, variantName: variant?.name || null, variantOptionId: variant?.id || null, addonsSnapshot: addons.map((addon) => ({ id: addon.id, name: addon.name, price: Number(addon.price) })), quantity: line.quantity, unitPrice: cash(unitCents), lineTotal: cash(lineCents), itemNotes: line.note?.trim() || null })), { transaction });
      await PosOrderRequest.create({ restaurantId: req.restaurant.id, branchId, idempotencyKey, requestHash, orderId: created.id }, { transaction });
      if (table) await occupyForOrder(table.id, transaction, { allowOccupied: true });
      await recordAuditEvent(req, { action: 'pos.order.created', entityType: 'pos_order', entityId: created.id, afterData: { orderNumber: created.orderNumber, branchId, orderType, tableId: created.tableId, total: created.total, lineCount: priced.length } }, { transaction });
      return created;
    });
  } catch (error) {
    if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    const prior = await PosOrderRequest.findOne({ where: { idempotencyKey, restaurantId: req.restaurant.id, branchId } });
    if (!prior || prior.requestHash !== requestHash) throw fail(409, 'This POS order request conflicts with another request.');
    order = await Order.findOne({ where: { id: prior.orderId, restaurantId: req.restaurant.id, branchId } });
    if (!order) throw fail(409, 'The order for this POS retry is no longer available.');
  }
  if (order.tableId) emitFloorEvent(req, order.branchId, 'floor:occupancy-updated', { restaurantId: order.restaurantId, tableId: order.tableId, status: 'occupied' });
  send(res, await serializeOrder(order), 201, 'POS order created.');
});

exports.listOrders = wrap(async (req, res) => {
  if (!validUuid(req.query.branchId)) throw fail(400, 'Choose a branch.');
  const branch = await getBranch(req, req.query.branchId);
  const rows = await Order.findAll({ where: { restaurantId: req.restaurant.id, branchId: branch.id, customerId: null, orderType: { [Op.in]: ['takeaway', 'dine_in'] }, ...(req.query.status ? { status: req.query.status } : {}) }, order: [['createdAt', 'DESC']], limit: Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100) });
  const results = [];
  for (const order of rows) results.push(await serializeOrder(order));
  send(res, results);
});

exports.getOrder = wrap(async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.orderId, restaurantId: req.restaurant.id, customerId: null, orderType: { [Op.in]: ['takeaway', 'dine_in'] } } });
  if (!order || (req.restaurantBranchIds && !req.restaurantBranchIds.includes(order.branchId))) throw fail(404, 'POS order not found.');
  send(res, await serializeOrder(order));
});

exports.takeCash = wrap(async (req, res) => {
  const { amount, idempotencyKey, reference = null } = req.body || {};
  if (!validUuid(idempotencyKey)) throw fail(400, 'A valid payment idempotency key is required.');
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Math.round(Number(amount) * 100) !== Number(amount) * 100) throw fail(400, 'Enter a valid positive payment amount with at most two decimal places.');
  if (reference != null && (typeof reference !== 'string' || reference.length > 120)) throw fail(400, 'Payment reference must be 120 characters or fewer.');
  const result = await sequelize.transaction(async (transaction) => {
    const tenderPrior = await PosTender.findOne({ where: { idempotencyKey }, transaction, lock: transaction.LOCK.UPDATE });
    if (tenderPrior) {
      if (tenderPrior.orderId !== req.params.orderId || tenderPrior.method !== 'cash' || cents(tenderPrior.amount) !== cents(amount)) throw fail(409, 'This payment idempotency key belongs to a different tender.');
      return { order: await Order.findOne({ where: { id: tenderPrior.orderId, restaurantId: req.restaurant.id }, transaction }), repeated: true };
    }
    const order = await Order.findOne({ where: { id: req.params.orderId, restaurantId: req.restaurant.id, customerId: null, orderType: { [Op.in]: ['takeaway', 'dine_in'] } }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order || (req.restaurantBranchIds && !req.restaurantBranchIds.includes(order.branchId))) throw fail(404, 'POS order not found.');
    if (['cancelled', 'rejected', 'completed'].includes(order.status) || order.paymentStatus === 'paid') throw fail(409, 'This order cannot accept another payment.');
    const balance = await tenderBalance(order, transaction, true);
    if (balance.pending) throw fail(409, 'Complete or expire the pending online payment before recording another tender.');
    if (cents(amount) > balance.dueCents) throw fail(409, 'Payment amount cannot exceed the remaining balance.');
    const tender = await PosTender.create({ orderId: order.id, restaurantId: order.restaurantId, branchId: order.branchId, createdByUserId: req.authUser.id, idempotencyKey, method: 'cash', status: 'paid', amount: cash(cents(amount)), reference: reference?.trim() || null }, { transaction });
    const paidCents = balance.paidCents + cents(tender.amount);
    await updatePaidState(order, paidCents, transaction);
    await recordAuditEvent(req, { action: 'pos.tender.cash_recorded', entityType: 'pos_tender', entityId: tender.id, afterData: { orderId: order.id, branchId: order.branchId, amount: tender.amount, paymentStatus: paidCents === cents(order.total) ? 'paid' : 'pending' } }, { transaction });
    return { order, repeated: false };
  });
  send(res, await serializeOrder(result.order), result.repeated ? 200 : 201, result.repeated ? 'Payment already recorded.' : 'Cash tender recorded.');
});

async function updatePaidState(order, paidCents, transaction, razorpay = null) {
  const totalCents = cents(order.total);
  if (paidCents > totalCents) throw fail(409, 'Tender total cannot exceed the order total.');
  if (paidCents !== totalCents) return;
  const tenders = await PosTender.findAll({ where: { orderId: order.id, status: 'paid' }, transaction, lock: transaction.LOCK.UPDATE });
  const methods = new Set(tenders.map((tender) => tender.method));
  const method = methods.size === 1 ? methods.values().next().value : 'pos_mixed';
  const values = { paymentStatus: 'paid', paymentMethod: method };
  if (razorpay && methods.size === 1 && method === 'razorpay') {
    values.razorpayOrderId = razorpay.orderId;
    values.razorpayPaymentId = razorpay.paymentId;
  }
  await order.update(values, { transaction });
}

async function recordCapturedTender(req, tender, gatewayOrderId, paymentId) {
  return sequelize.transaction(async (transaction) => {
    const lockedTender = await PosTender.findOne({ where: { id: tender.id, restaurantId: req.restaurant.id }, transaction, lock: transaction.LOCK.UPDATE });
    const lockedOrder = await Order.findOne({ where: { id: tender.orderId, restaurantId: req.restaurant.id, customerId: null }, transaction, lock: transaction.LOCK.UPDATE });
    if (!lockedOrder || (req.restaurantBranchIds && !req.restaurantBranchIds.includes(lockedOrder.branchId))) throw fail(404, 'POS order not found.');
    if (lockedTender.status === 'paid') {
      if (lockedTender.razorpayPaymentId !== paymentId) throw fail(409, 'This tender was already completed using a different payment.');
      return lockedOrder;
    }
    if (lockedTender.status !== 'pending' || lockedTender.razorpayOrderId !== gatewayOrderId) throw fail(409, 'This POS payment attempt is no longer current.');
    const balance = await tenderBalance(lockedOrder, transaction, true);
    if (balance.pending?.id !== lockedTender.id || balance.paidCents + cents(lockedTender.amount) > cents(lockedOrder.total)) throw fail(409, 'The POS tender no longer matches the outstanding order balance.');
    await lockedTender.update({ status: 'paid', razorpayPaymentId: paymentId }, { transaction });
    await updatePaidState(lockedOrder, balance.paidCents + cents(lockedTender.amount), transaction, { orderId: gatewayOrderId, paymentId });
    await recordAuditEvent(req, { action: 'pos.tender.online_captured', entityType: 'pos_tender', entityId: lockedTender.id, afterData: { orderId: lockedOrder.id, branchId: lockedOrder.branchId, amount: lockedTender.amount, paymentStatus: balance.paidCents + cents(lockedTender.amount) === cents(lockedOrder.total) ? 'paid' : 'pending' } }, { transaction });
    return lockedOrder;
  });
}

exports.createRazorpayTender = wrap(async (req, res) => {
  const { amount, idempotencyKey } = req.body || {};
  if (!validUuid(idempotencyKey)) throw fail(400, 'A valid payment idempotency key is required.');
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Math.round(Number(amount) * 100) !== Number(amount) * 100) throw fail(400, 'Enter a valid positive payment amount with at most two decimal places.');
  const provider = gateway();
  const result = await sequelize.transaction(async (transaction) => {
    const existingTender = await PosTender.findOne({ where: { idempotencyKey }, transaction, lock: transaction.LOCK.UPDATE });
    if (existingTender) {
      if (existingTender.orderId !== req.params.orderId || existingTender.method !== 'razorpay' || cents(existingTender.amount) !== cents(amount)) throw fail(409, 'This payment idempotency key belongs to a different tender.');
      const existingOrder = await Order.findOne({ where: { id: existingTender.orderId, restaurantId: req.restaurant.id }, transaction });
      if (!existingOrder || (req.restaurantBranchIds && !req.restaurantBranchIds.includes(existingOrder.branchId))) throw fail(404, 'POS order not found.');
      if (existingTender.status !== 'pending') throw fail(409, 'This online payment attempt is no longer pending.');
      return { tender: existingTender, order: existingOrder, razorpayOrder: { id: existingTender.razorpayOrderId, amount: cents(existingTender.amount), currency: 'INR' }, repeated: true };
    }
    const order = await Order.findOne({ where: { id: req.params.orderId, restaurantId: req.restaurant.id, customerId: null, orderType: { [Op.in]: ['takeaway', 'dine_in'] } }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order || (req.restaurantBranchIds && !req.restaurantBranchIds.includes(order.branchId))) throw fail(404, 'POS order not found.');
    if (['cancelled', 'rejected', 'completed'].includes(order.status) || order.paymentStatus === 'paid') throw fail(409, 'This order cannot accept another payment.');
    const balance = await tenderBalance(order, transaction, true);
    if (balance.pending) throw fail(409, 'An online payment is already pending for this order.');
    if (cents(amount) > balance.dueCents) throw fail(409, 'Payment amount cannot exceed the remaining balance.');
    const tender = await PosTender.create({ orderId: order.id, restaurantId: order.restaurantId, branchId: order.branchId, createdByUserId: req.authUser.id, idempotencyKey, method: 'razorpay', status: 'pending', amount: cash(cents(amount)) }, { transaction });
    let razorpayOrder;
    try {
      razorpayOrder = await provider.orders.create({ amount: cents(tender.amount), currency: 'INR', receipt: `fhpos_${tender.id.replaceAll('-', '').slice(0, 30)}`, notes: { foodiehubOrderId: order.id, foodiehubTenderId: tender.id } });
    } catch {
      throw fail(502, 'Razorpay could not create the POS payment order. Check provider connectivity and retry.');
    }
    await tender.update({ razorpayOrderId: razorpayOrder.id }, { transaction });
    await recordAuditEvent(req, { action: 'pos.tender.online_initiated', entityType: 'pos_tender', entityId: tender.id, afterData: { orderId: order.id, branchId: order.branchId, amount: tender.amount, provider: 'razorpay' } }, { transaction });
    return { tender, order, razorpayOrder, repeated: false };
  });
  send(res, { tenderId: result.tender.id, orderId: result.order.id, razorpayOrderId: result.razorpayOrder.id, keyId: process.env.RAZORPAY_KEY_ID, amount: result.razorpayOrder.amount, currency: 'INR', orderNumber: result.order.orderNumber }, result.repeated ? 200 : 201, 'Secure POS payment order ready.');
});

exports.verifyRazorpayTender = wrap(async (req, res) => {
  const { razorpay_payment_id: paymentId, razorpay_order_id: gatewayOrderId, razorpay_signature: signature } = req.body || {};
  if (![paymentId, gatewayOrderId, signature].every((value) => typeof value === 'string' && value.length > 0)) throw fail(400, 'The Razorpay payment response is incomplete.');
  const tender = await PosTender.findOne({ where: { id: req.params.tenderId, restaurantId: req.restaurant.id, method: 'razorpay' } });
  if (!tender || (req.restaurantBranchIds && !req.restaurantBranchIds.includes(tender.branchId))) throw fail(404, 'POS payment not found.');
  if (tender.razorpayOrderId !== gatewayOrderId) throw fail(400, 'The payment does not match this POS tender.');
  if (tender.status === 'paid') {
    if (tender.razorpayPaymentId !== paymentId) throw fail(409, 'This tender was already completed using a different payment.');
    const order = await Order.findOne({ where: { id: tender.orderId, restaurantId: req.restaurant.id } });
    return send(res, await serializeOrder(order), 200, 'Payment was already verified.');
  }
  if (tender.status !== 'pending' || !/^[0-9a-f]{64}$/i.test(signature)) throw fail(400, 'Razorpay payment signature verification failed.');
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${gatewayOrderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw fail(400, 'Razorpay payment signature verification failed.');
  let payment;
  try {
    payment = await gateway().payments.fetch(paymentId);
    if (payment.order_id !== gatewayOrderId || Number(payment.amount) !== cents(tender.amount) || payment.currency !== 'INR') throw fail(409, 'Razorpay payment does not match the POS tender amount.');
    if (payment.status === 'authorized') payment = await gateway().payments.capture(paymentId, cents(tender.amount), 'INR');
  } catch (error) {
    if (error.status) throw error;
    throw fail(502, 'Razorpay payment status could not be verified. Reconcile this payment before retrying.');
  }
  if (payment.status !== 'captured') throw fail(409, 'Razorpay has not confirmed a captured payment.');
  const order = await recordCapturedTender(req, tender, gatewayOrderId, paymentId);
  send(res, await serializeOrder(order), 200, 'POS payment verified and captured.');
});

exports.reconcileRazorpayTender = wrap(async (req, res) => {
  const { razorpayOrderId } = req.body || {};
  if (typeof razorpayOrderId !== 'string' || !razorpayOrderId) throw fail(400, 'A Razorpay order reference is required.');
  const tender = await PosTender.findOne({ where: { id: req.params.tenderId, restaurantId: req.restaurant.id, method: 'razorpay' } });
  if (!tender || (req.restaurantBranchIds && !req.restaurantBranchIds.includes(tender.branchId))) throw fail(404, 'POS payment not found.');
  if (tender.razorpayOrderId !== razorpayOrderId) throw fail(400, 'The payment does not match this POS tender.');
  if (tender.status === 'paid') {
    const order = await Order.findOne({ where: { id: tender.orderId, restaurantId: req.restaurant.id } });
    return send(res, await serializeOrder(order), 200, 'Payment is already verified.');
  }
  if (tender.status === 'failed') {
    const order = await Order.findOne({ where: { id: tender.orderId, restaurantId: req.restaurant.id } });
    return send(res, await serializeOrder(order), 200, 'Payment attempt was already reconciled as failed.');
  }
  let providerPayments;
  try { providerPayments = await gateway().orders.fetchPayments(razorpayOrderId); }
  catch { throw fail(502, 'Razorpay payment status could not be reconciled. Leave the tender pending and retry.'); }
  const payments = Array.isArray(providerPayments?.items) ? providerPayments.items : [];
  const matching = payments.filter((payment) => payment.order_id === razorpayOrderId && Number(payment.amount) === cents(tender.amount) && payment.currency === 'INR');
  if (matching.length !== payments.length) throw fail(409, 'Razorpay returned a payment that does not match this POS tender.');
  const captured = matching.find((payment) => payment.status === 'captured');
  const authorized = matching.find((payment) => payment.status === 'authorized');
  if (captured) {
    const order = await recordCapturedTender(req, tender, razorpayOrderId, captured.id);
    return send(res, await serializeOrder(order), 200, 'Captured payment was reconciled.');
  }
  if (authorized) {
    let payment;
    try { payment = await gateway().payments.capture(authorized.id, cents(tender.amount), 'INR'); }
    catch { throw fail(502, 'Razorpay payment capture is uncertain. Leave the tender pending and reconcile again.'); }
    if (payment.status !== 'captured') throw fail(409, 'Razorpay has not confirmed a captured payment.');
    const order = await recordCapturedTender(req, tender, razorpayOrderId, payment.id);
    return send(res, await serializeOrder(order), 200, 'Authorized payment was captured and reconciled.');
  }
  if (matching.some((payment) => !['failed', 'cancelled'].includes(payment.status))) throw fail(409, 'Razorpay still reports an unresolved payment attempt. Leave the tender pending and retry.');
  const order = await sequelize.transaction(async (transaction) => {
    const lockedTender = await PosTender.findOne({ where: { id: tender.id, restaurantId: req.restaurant.id }, transaction, lock: transaction.LOCK.UPDATE });
    const lockedOrder = await Order.findOne({ where: { id: tender.orderId, restaurantId: req.restaurant.id, customerId: null }, transaction, lock: transaction.LOCK.UPDATE });
    if (!lockedOrder || (req.restaurantBranchIds && !req.restaurantBranchIds.includes(lockedOrder.branchId))) throw fail(404, 'POS order not found.');
    if (lockedTender.status === 'paid') return lockedOrder;
    if (lockedTender.status !== 'pending' || lockedTender.razorpayOrderId !== razorpayOrderId) throw fail(409, 'This POS payment attempt changed while reconciling.');
    await lockedTender.update({ status: 'failed', reference: 'Provider confirmed no captured payment.' }, { transaction });
    await recordAuditEvent(req, { action: 'pos.tender.online_failed', entityType: 'pos_tender', entityId: lockedTender.id, reason: 'Razorpay provider reported no captured payment.', afterData: { orderId: lockedOrder.id, branchId: lockedOrder.branchId, amount: lockedTender.amount, providerStatus: 'no_capture' } }, { transaction });
    return lockedOrder;
  });
  send(res, await serializeOrder(order), 200, 'No captured payment was found; the tender is available for retry.');
});
