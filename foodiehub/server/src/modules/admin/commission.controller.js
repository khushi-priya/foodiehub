const { Op } = require('sequelize');
const { CommissionRule, CommissionRecord, CommissionSettlement, CommissionSettlementItem, Order, Restaurant, Branch } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');
const { syncCommissionForOrder, cash } = require('../../services/commission-ledger');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data, status = 200, message) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pageArgs = (query) => ({ page: Math.max(1, Number.parseInt(query.page, 10) || 1), pageSize: Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20)) });

function ruleValues(body) {
  if (body.restaurantId !== null && body.restaurantId !== '' && !UUID.test(body.restaurantId)) throw fail(400, 'Choose a valid restaurant or the platform default.');
  if (!Number.isFinite(Number(body.commissionRate)) || Number(body.commissionRate) < 0 || Number(body.commissionRate) > 100) throw fail(400, 'Commission rate must be from 0 to 100 percent.');
  const effectiveFrom = new Date(body.effectiveFrom); const effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;
  if (!body.effectiveFrom || !Number.isFinite(effectiveFrom.getTime()) || (effectiveTo && (!Number.isFinite(effectiveTo.getTime()) || effectiveTo <= effectiveFrom))) throw fail(400, 'Provide a valid effective start and an end date later than the start.');
  if (body.status !== undefined && !['active', 'inactive'].includes(body.status)) throw fail(400, 'Rule status must be active or inactive.');
  return { restaurantId: body.restaurantId || null, commissionRate: Number(body.commissionRate), effectiveFrom, effectiveTo, status: body.status || 'active' };
}

async function assertNoOverlap(values, transaction, ignoreId = null) {
  if (values.status !== 'active') return;
  const where = { restaurantId: values.restaurantId, status: 'active', effectiveFrom: { [Op.lt]: values.effectiveTo || new Date('9999-12-31T00:00:00Z') }, [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gt]: values.effectiveFrom } }] };
  if (ignoreId) where.id = { [Op.ne]: ignoreId };
  const overlap = await CommissionRule.findOne({ where, transaction, lock: transaction.LOCK.UPDATE });
  if (overlap) throw fail(409, 'An active commission rule already covers part of this date range for that scope. Close or deactivate it first.');
}

exports.rules = wrap(async (_req, res) => {
  const items = await CommissionRule.findAll({ include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name'], required: false }], order: [['restaurantId', 'ASC'], ['effectiveFrom', 'DESC']] });
  send(res, items);
});

exports.createRule = wrap(async (req, res) => {
  const values = ruleValues(req.body || {});
  if (values.restaurantId && !await Restaurant.findByPk(values.restaurantId, { attributes: ['id'] })) throw fail(404, 'Restaurant not found.');
  const rule = await CommissionRule.sequelize.transaction(async (transaction) => {
    await assertNoOverlap(values, transaction);
    const row = await CommissionRule.create({ ...values, createdBy: req.user.id }, { transaction });
    await recordAuditEvent(req, { action: 'commission_rule.created', entityType: 'commission_rule', entityId: row.id, afterData: values }, { transaction });
    return row;
  });
  send(res, rule, 201, 'Commission rule created.');
});

exports.updateRule = wrap(async (req, res) => {
  const values = ruleValues(req.body || {});
  if (values.restaurantId && !await Restaurant.findByPk(values.restaurantId, { attributes: ['id'] })) throw fail(404, 'Restaurant not found.');
  const rule = await CommissionRule.sequelize.transaction(async (transaction) => {
    const row = await CommissionRule.findByPk(req.params.ruleId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw fail(404, 'Commission rule not found.');
    await assertNoOverlap(values, transaction, row.id);
    const before = row.toJSON(); await row.update(values, { transaction });
    await recordAuditEvent(req, { action: 'commission_rule.updated', entityType: 'commission_rule', entityId: row.id, beforeData: before, afterData: values }, { transaction });
    return row;
  });
  send(res, rule, 200, 'Commission rule updated.');
});

exports.setRuleStatus = wrap(async (req, res) => {
  const status = req.body?.status;
  if (!['active', 'inactive'].includes(status)) throw fail(400, 'Status must be active or inactive.');
  const row = await CommissionRule.sequelize.transaction(async (transaction) => {
    const rule = await CommissionRule.findByPk(req.params.ruleId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rule) throw fail(404, 'Commission rule not found.');
    if (status === 'active') await assertNoOverlap({ ...rule.toJSON(), effectiveFrom: rule.effectiveFrom, effectiveTo: rule.effectiveTo }, transaction, rule.id);
    const before = rule.status; await rule.update({ status }, { transaction });
    await recordAuditEvent(req, { action: 'commission_rule.status_changed', entityType: 'commission_rule', entityId: rule.id, beforeData: { status: before }, afterData: { status } }, { transaction });
    return rule;
  });
  send(res, row);
});

exports.records = wrap(async (req, res) => {
  const { page, pageSize } = pageArgs(req.query); const where = {};
  if (req.query.restaurantId) { if (!UUID.test(req.query.restaurantId)) throw fail(400, 'Restaurant filter is invalid.'); where.restaurantId = req.query.restaurantId; }
  if (['pending', 'settled', 'reversed'].includes(req.query.status)) where.status = req.query.status;
  if (['accrual', 'refund_adjustment'].includes(req.query.recordType)) where.recordType = req.query.recordType;
  if (req.query.from || req.query.to) {
    const from = req.query.from ? new Date(req.query.from) : null; const to = req.query.to ? new Date(req.query.to) : null;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime()))) throw fail(400, 'Date filter is invalid.');
    where.transactionAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
  }
  const result = await CommissionRecord.findAndCountAll({ where, include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name'] }, { model: Branch, as: 'branch', attributes: ['id', 'name'], required: false }, { model: Order, as: 'order', attributes: ['id', 'orderNumber', 'status', 'paymentStatus', 'paymentMethod', 'createdAt'] }], order: [['transactionAt', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize, distinct: true });
  send(res, { items: result.rows, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});

exports.reconcile = wrap(async (req, res) => {
  const where = { status: 'completed', paymentStatus: { [Op.in]: ['paid', 'refunded'] } };
  if (req.body?.from || req.body?.to) {
    const from = req.body.from ? new Date(req.body.from) : null; const to = req.body.to ? new Date(req.body.to) : null;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime()))) throw fail(400, 'Date range is invalid.');
    where.completedAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
  }
  const orders = await Order.findAll({ where, order: [['completedAt', 'ASC']], limit: 1000 });
  let created = 0; let reversed = 0;
  await Order.sequelize.transaction(async (transaction) => {
    for (const order of orders) {
      const before = await CommissionRecord.count({ where: { orderId: order.id }, transaction });
      const record = await syncCommissionForOrder(order, transaction);
      if (!before && record?.recordType === 'accrual') created += 1;
      else if (record?.recordType === 'refund_adjustment') reversed += 1;
    }
  });
  send(res, { scanned: orders.length, created, refundAdjustmentsOrReversals: reversed, truncated: orders.length === 1000 }, 200, 'Eligible order commissions reconciled using rules effective at order completion.');
});

exports.settlements = wrap(async (req, res) => {
  const { page, pageSize } = pageArgs(req.query); const where = {};
  if (req.query.restaurantId) { if (!UUID.test(req.query.restaurantId)) throw fail(400, 'Restaurant filter is invalid.'); where.restaurantId = req.query.restaurantId; }
  const result = await CommissionSettlement.findAndCountAll({ where, include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name'] }, { model: CommissionSettlementItem, as: 'items', include: [{ model: CommissionRecord, as: 'commissionRecord', include: [{ model: Order, as: 'order', attributes: ['id', 'orderNumber'] }] }] }], order: [['settledAt', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize, distinct: true });
  const pending = await CommissionRecord.findAll({ where: { status: 'pending' }, attributes: ['restaurantId', 'restaurantPayable'], include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name'] }] });
  const pendingByRestaurant = new Map();
  for (const record of pending) {
    const current = pendingByRestaurant.get(record.restaurantId) || { restaurant: record.restaurant, pendingAmount: 0, recordCount: 0 };
    current.pendingAmount = cash(Math.round((current.pendingAmount + Number(record.restaurantPayable)) * 100)); current.recordCount += 1; pendingByRestaurant.set(record.restaurantId, current);
  }
  send(res, { items: result.rows, pendingByRestaurant: [...pendingByRestaurant.entries()].map(([restaurantId, value]) => ({ restaurantId, ...value })), pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});

exports.createSettlement = wrap(async (req, res) => {
  const { restaurantId, transactionReference, settledAt, recordIds } = req.body || {};
  if (!UUID.test(restaurantId || '')) throw fail(400, 'Choose a valid restaurant.');
  if (typeof transactionReference !== 'string' || transactionReference.trim().length < 4 || transactionReference.trim().length > 160) throw fail(400, 'Enter the external bank or payout transaction reference (4–160 characters).');
  const date = new Date(settledAt);
  if (!settledAt || !Number.isFinite(date.getTime()) || date > new Date()) throw fail(400, 'Provide a valid settlement date no later than today.');
  if (recordIds !== undefined && (!Array.isArray(recordIds) || !recordIds.length || recordIds.some((id) => !UUID.test(id)))) throw fail(400, 'Settlement order selection is invalid.');
  const settlement = await CommissionSettlement.sequelize.transaction(async (transaction) => {
    const restaurant = await Restaurant.findByPk(restaurantId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!restaurant) throw fail(404, 'Restaurant not found.');
    const where = { restaurantId, status: 'pending', ...(recordIds ? { id: { [Op.in]: recordIds } } : {}) };
    const records = await CommissionRecord.findAll({ where, transaction, lock: transaction.LOCK.UPDATE, order: [['transactionAt', 'ASC']] });
    if (!records.length || (recordIds && records.length !== new Set(recordIds).size)) throw fail(409, 'The selected pending commission records are unavailable. Refresh before settling.');
    const amountCents = records.reduce((sum, record) => sum + Math.round(Number(record.restaurantPayable) * 100), 0);
    if (amountCents <= 0) throw fail(409, 'The pending balance is zero or negative. Refund adjustments will offset future commission balances.');
    const row = await CommissionSettlement.create({ restaurantId, amount: cash(amountCents), transactionReference: transactionReference.trim(), settledAt: date, status: 'completed', recordedBy: req.user.id }, { transaction });
    await CommissionSettlementItem.bulkCreate(records.map((record) => ({ settlementId: row.id, commissionRecordId: record.id, amount: record.restaurantPayable })), { transaction });
    await CommissionRecord.update({ status: 'settled' }, { where: { id: { [Op.in]: records.map((record) => record.id) }, status: 'pending' }, transaction });
    await recordAuditEvent(req, { action: 'commission.settlement_recorded', entityType: 'commission_settlement', entityId: row.id, afterData: { restaurantId, amount: row.amount, currency: row.currency, transactionReference: row.transactionReference, settledAt: row.settledAt, commissionRecordIds: records.map((record) => record.id) } }, { transaction });
    return row;
  });
  send(res, settlement, 201, 'Settlement operation recorded against the supplied transaction reference.');
});
