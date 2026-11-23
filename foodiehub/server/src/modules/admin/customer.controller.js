const { Op, fn, col } = require('sequelize');
const { User, Role, Order, OrderItem, Restaurant, Branch, AuditLog } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const customerRole = () => ({ model: Role, as: 'roles', where: { code: 'customer', scope: 'platform' }, attributes: [], through: { attributes: [] }, required: true });
const safeCustomer = (user) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, status: user.status, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt });

function dateBoundary(value, end = false) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw fail(400, 'Dates must use YYYY-MM-DD format.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw fail(400, 'A date filter is invalid.');
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function pageOptions(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

function customerOrderIncludes() {
  return [
    { model: Restaurant, as: 'restaurant', attributes: ['id', 'name'], required: false },
    { model: Branch, as: 'branch', attributes: ['id', 'name'], required: false },
    { model: OrderItem, as: 'items', attributes: ['id', 'itemName', 'variantName', 'addonsSnapshot', 'quantity', 'unitPrice', 'lineTotal'], required: false },
  ];
}

exports.list = handle(async (req, res) => {
  const { page, pageSize, limit, offset } = pageOptions(req.query);
  const where = {};
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (search) where[Op.and] = search.split(/\s+/).filter(Boolean).map((term) => ({ [Op.or]: [
    { firstName: { [Op.like]: `%${term}%` } },
    { lastName: { [Op.like]: `%${term}%` } },
    { email: { [Op.like]: `%${term}%` } },
    { phone: { [Op.like]: `%${term}%` } },
  ] }));
  if (req.query.status && req.query.status !== 'all') {
    if (!['active', 'suspended', 'blocked', 'pending'].includes(req.query.status)) throw fail(400, 'Customer status filter is invalid.');
    where.status = req.query.status;
  }
  const from = dateBoundary(req.query.createdFrom);
  const to = dateBoundary(req.query.createdTo, true);
  if (from && to && from >= to) throw fail(400, 'The start date must be on or before the end date.');
  if (from || to) where.createdAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lt]: to } : {}) };

  const result = await User.findAndCountAll({
    where,
    attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'status', 'createdAt'],
    include: [customerRole()],
    order: [['createdAt', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
    distinct: true,
  });
  const customerIds = result.rows.map((user) => user.id);
  const [orderCounts, spendRows] = customerIds.length ? await Promise.all([
    Order.findAll({ attributes: ['customerId', [fn('COUNT', col('id')), 'totalOrders']], where: { customerId: { [Op.in]: customerIds } }, group: ['customerId'], raw: true }),
    Order.findAll({ attributes: ['customerId', [fn('SUM', col('total')), 'totalSpending']], where: { customerId: { [Op.in]: customerIds }, paymentStatus: 'paid' }, group: ['customerId'], raw: true }),
  ]) : [[], []];
  const ordersByCustomer = new Map(orderCounts.map((row) => [row.customerId, Number(row.totalOrders || 0)]));
  const spendingByCustomer = new Map(spendRows.map((row) => [row.customerId, Number(row.totalSpending || 0)]));
  send(res, {
    items: result.rows.map((user) => ({ ...safeCustomer(user), totalOrders: ordersByCustomer.get(user.id) || 0, totalSpending: spendingByCustomer.get(user.id) || 0 })),
    pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) },
  });
});

exports.details = handle(async (req, res) => {
  const user = await User.findOne({ where: { id: req.params.customerId }, attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'status', 'createdAt', 'lastLoginAt'], include: [customerRole()] });
  if (!user) throw fail(404, 'Customer not found.');
  const customerId = user.id;
  const [totalOrders, completedOrders, cancelledOrders, paidOrders, totalSpending, refunds, statusHistory] = await Promise.all([
    Order.count({ where: { customerId } }),
    Order.count({ where: { customerId, status: 'completed' } }),
    Order.count({ where: { customerId, status: { [Op.in]: ['cancelled', 'rejected'] } } }),
    Order.count({ where: { customerId, paymentStatus: 'paid' } }),
    Order.sum('total', { where: { customerId, paymentStatus: 'paid' } }),
    Order.count({ where: { customerId, paymentStatus: 'refunded' } }),
    AuditLog.findAll({ where: { entityType: 'user', entityId: customerId, action: { [Op.like]: 'customer.%' } }, order: [['createdAt', 'DESC']], limit: 20 }),
  ]);
  send(res, { ...safeCustomer(user), metrics: { totalOrders, completedOrders, cancelledOrders, paidOrders, totalSpending: Number(totalSpending || 0), refundedOrders: refunds }, statusHistory });
});

exports.orders = handle(async (req, res) => {
  const { page, pageSize, limit, offset } = pageOptions(req.query);
  const customer = await User.findOne({ where: { id: req.params.customerId }, attributes: ['id'], include: [customerRole()] });
  if (!customer) throw fail(404, 'Customer not found.');
  const result = await Order.findAndCountAll({
    where: { customerId: customer.id },
    attributes: ['id', 'restaurantId', 'branchId', 'orderNumber', 'orderType', 'status', 'paymentStatus', 'paymentMethod', 'subtotal', 'tax', 'deliveryFee', 'packagingFee', 'discount', 'total', 'razorpayOrderId', 'razorpayPaymentId', 'createdAt', 'acceptedAt', 'completedAt', 'cancelledAt'],
    include: customerOrderIncludes(), order: [['createdAt', 'DESC']], limit, offset, distinct: true,
  });
  send(res, { items: result.rows, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});

exports.payments = handle(async (req, res) => {
  const { page, pageSize, limit, offset } = pageOptions(req.query);
  const customer = await User.findOne({ where: { id: req.params.customerId }, attributes: ['id'], include: [customerRole()] });
  if (!customer) throw fail(404, 'Customer not found.');
  const result = await Order.findAndCountAll({
    where: { customerId: customer.id, paymentMethod: { [Op.ne]: null } },
    attributes: ['id', 'orderNumber', 'total', 'paymentMethod', 'paymentStatus', 'razorpayOrderId', 'razorpayPaymentId', 'createdAt', 'updatedAt'],
    include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: false }],
    order: [['createdAt', 'DESC']], limit, offset, distinct: true,
  });
  send(res, { items: result.rows, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) }, ledgerAvailable: false });
});

exports.refunds = handle(async (req, res) => {
  const { page, pageSize, limit, offset } = pageOptions(req.query);
  const customer = await User.findOne({ where: { id: req.params.customerId }, attributes: ['id'], include: [customerRole()] });
  if (!customer) throw fail(404, 'Customer not found.');
  const result = await Order.findAndCountAll({
    where: { customerId: customer.id, paymentStatus: 'refunded' },
    attributes: ['id', 'orderNumber', 'total', 'paymentMethod', 'paymentStatus', 'razorpayOrderId', 'razorpayPaymentId', 'createdAt', 'updatedAt'],
    include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: false }],
    order: [['updatedAt', 'DESC']], limit, offset, distinct: true,
  });
  send(res, { items: result.rows, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) }, refundLedgerAvailable: false });
});

exports.setStatus = handle(async (req, res) => {
  const { status, reason } = req.body || {};
  if (!['active', 'suspended', 'blocked'].includes(status)) throw fail(400, 'Status must be active, suspended, or blocked.');
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (status !== 'active' && (!cleanReason || cleanReason.length > 2000)) throw fail(400, 'A reason is required for suspension or deactivation (maximum 2,000 characters).');
  if (status === 'active' && cleanReason.length > 2000) throw fail(400, 'Reason must be 2,000 characters or fewer.');
  const user = await User.sequelize.transaction(async (transaction) => {
    const current = await User.findByPk(req.params.customerId, { transaction, lock: transaction.LOCK.UPDATE, include: [{ model: Role, as: 'roles', attributes: ['id', 'code', 'scope'], through: { attributes: [] } }] });
    if (!current || !current.roles?.some((role) => role.code === 'customer' && role.scope === 'platform')) throw fail(404, 'Customer not found.');
    if (current.roles.some((role) => role.code !== 'customer')) throw fail(409, 'This account has other platform roles. Its global account status cannot be changed from Customer Management.');
    const beforeData = { id: current.id, status: current.status };
    await current.update({ status }, { transaction });
    await recordAuditEvent(req, { action: status === 'active' ? 'customer.activated' : status === 'suspended' ? 'customer.suspended' : 'customer.deactivated', entityType: 'user', entityId: current.id, reason: cleanReason || null, beforeData, afterData: { id: current.id, status, reason: cleanReason || null } }, { transaction });
    return current;
  });
  send(res, { id: user.id, status: user.status });
});
