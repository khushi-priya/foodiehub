const { Op } = require('sequelize');
const { Restaurant, Branch, User, Role, Order, SubscriptionPayment, RestaurantSubscription, SubscriptionPlan, CommissionRecord, CommissionSettlement, OrderItem, MenuItem, MenuCategory } = require('../../models');

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data) => res.status(200).json({ success: true, data });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const centsMoney = (value) => Number(Number(value || 0).toFixed(2));
const validStatuses = ['pending', 'accepted', 'rejected', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'completed', 'cancelled'];

function range(query = {}) {
  const now = new Date();
  const from = query.from ? new Date(query.from) : new Date(now.getTime() - 30 * 86400000);
  const to = query.to ? new Date(query.to) : now;
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw fail(400, 'Provide a valid date range where the start is earlier than the end.');
  if (to - from > 366 * 86400000) throw fail(400, 'Reports are limited to a 366-day date range.');
  return { from, to, now };
}
const dateWhere = (field, from, to) => ({ [field]: { [Op.gte]: from, [Op.lt]: to } });
const validOrderWhere = { status: { [Op.notIn]: ['cancelled', 'rejected'] }, paymentStatus: { [Op.ne]: 'refunded' } };
const dateKey = (value) => new Date(value).toISOString().slice(0, 10);

async function overviewData(from, to, now = new Date()) {
  const orderDate = dateWhere('createdAt', from, to);
  const [totalRestaurants, activeRestaurants, totalBranches, totalCustomers, totalOrders, completedOrders, cancelledOrders, grossOrderValue, platformCommission, subscriptionRevenue, refundedOrders, refundedSubscriptionPayments, activeSubscriptions, orders, registrations, customers, commissionRows, subscriptionRows, subscriptionGroups, orderItems, statusRows] = await Promise.all([
    Restaurant.count(),
    Restaurant.count({ where: { approvalStatus: 'approved', listingStatus: 'published', marketplaceEnabled: true } }),
    Branch.count(),
    User.count({ distinct: true, col: 'id', include: [{ model: Role, as: 'roles', where: { code: 'customer', scope: 'platform' }, attributes: [], through: { attributes: [] }, required: true }] }),
    Order.count({ where: orderDate }),
    Order.count({ where: { ...orderDate, status: 'completed' } }),
    Order.count({ where: { ...orderDate, status: { [Op.in]: ['cancelled', 'rejected'] } } }),
    Order.sum('total', { where: { ...orderDate, ...validOrderWhere } }),
    CommissionRecord.sum('commissionAmount', { where: { transactionAt: dateWhere('transactionAt', from, to).transactionAt, status: { [Op.ne]: 'reversed' } } }),
    SubscriptionPayment.sum('amount', { where: { status: 'paid', verifiedAt: dateWhere('verifiedAt', from, to).verifiedAt } }),
    Order.count({ where: { ...dateWhere('updatedAt', from, to), paymentStatus: 'refunded' } }),
    SubscriptionPayment.count({ where: { ...dateWhere('updatedAt', from, to), status: 'refunded' } }),
    RestaurantSubscription.count({ where: { status: 'active', startDate: { [Op.lte]: now }, endDate: { [Op.gt]: now } } }),
    Order.findAll({ where: orderDate, attributes: ['id', 'restaurantId', 'status', 'paymentStatus', 'total', 'createdAt'], include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name'], required: false }], order: [['createdAt', 'ASC']], limit: 20000 }),
    Restaurant.findAll({ where: dateWhere('createdAt', from, to), attributes: ['id', 'createdAt'], raw: true, limit: 20000 }),
    User.findAll({ where: dateWhere('createdAt', from, to), attributes: ['id', 'createdAt'], include: [{ model: Role, as: 'roles', where: { code: 'customer', scope: 'platform' }, attributes: [], through: { attributes: [] }, required: true }], raw: true, limit: 20000 }),
    CommissionRecord.findAll({ where: { transactionAt: dateWhere('transactionAt', from, to).transactionAt, status: { [Op.ne]: 'reversed' } }, attributes: ['commissionAmount', 'transactionAt'], raw: true, limit: 20000 }),
    SubscriptionPayment.findAll({ where: { status: 'paid', verifiedAt: dateWhere('verifiedAt', from, to).verifiedAt }, attributes: ['amount', 'verifiedAt'], raw: true, limit: 20000 }),
    RestaurantSubscription.findAll({ where: dateWhere('createdAt', from, to), attributes: ['status', 'planId'], include: [{ model: SubscriptionPlan, as: 'plan', attributes: ['id', 'name'], required: true }], limit: 20000 }),
    OrderItem.findAll({ attributes: ['quantity', 'lineTotal'], include: [{ model: Order, as: 'order', attributes: [], where: { ...orderDate, ...validOrderWhere }, required: true }, { model: MenuItem, as: 'menuItem', attributes: ['id'], required: false, include: [{ model: MenuCategory, as: 'category', attributes: ['id', 'name'], required: false }] }], limit: 20000 }),
    Order.count({ where: orderDate, group: ['status'] }),
  ]);

  const days = new Map();
  const firstDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const lastIncluded = new Date(to.getTime() - 1);
  const lastDay = Date.UTC(lastIncluded.getUTCFullYear(), lastIncluded.getUTCMonth(), lastIncluded.getUTCDate());
  const dayCount = Math.min(366, Math.floor((lastDay - firstDay) / 86400000) + 1);
  for (let offset = 0; offset < dayCount; offset += 1) {
    const d = new Date(firstDay + offset * 86400000); const key = dateKey(d);
    days.set(key, { date: key, orders: 0, grossOrderValue: 0, platformCommission: 0, subscriptionRevenue: 0 });
  }
  const restaurantMap = new Map();
  const statuses = Object.fromEntries(validStatuses.map((status) => [status, 0]));
  for (const order of orders) {
    const key = dateKey(order.createdAt); const day = days.get(key); if (day) { day.orders += 1; if (!['cancelled', 'rejected'].includes(order.status) && order.paymentStatus !== 'refunded') day.grossOrderValue += Number(order.total || 0); }
    if (['cancelled', 'rejected'].includes(order.status) || order.paymentStatus === 'refunded') continue;
    const id = order.restaurantId; const current = restaurantMap.get(id) || { restaurantId: id, restaurantName: order.restaurant?.name || 'Restaurant', orders: 0, grossOrderValue: 0 };
    current.orders += 1; current.grossOrderValue += Number(order.total || 0); restaurantMap.set(id, current);
  }
  for (const row of statusRows) statuses[row.status] = Number(row.count || 0);
  const growth = (rows) => {
    const map = new Map(); const seen = new Set(); for (const row of rows) { if (seen.has(row.id)) continue; seen.add(row.id); const key = dateKey(row.createdAt); map.set(key, (map.get(key) || 0) + 1); }
    return [...days.keys()].map((date) => ({ date, count: map.get(date) || 0 }));
  };
  for (const row of commissionRows) { const day = days.get(dateKey(row.transactionAt)); if (day) day.platformCommission += Number(row.commissionAmount || 0); }
  for (const row of subscriptionRows) { const day = days.get(dateKey(row.verifiedAt)); if (day) day.subscriptionRevenue += Number(row.amount || 0); }
  const categories = new Map();
  for (const line of orderItems) {
    const category = line.menuItem?.category; if (!category) continue;
    const current = categories.get(category.id) || { categoryId: category.id, categoryName: category.name, unitsSold: 0, sales: 0 };
    current.unitsSold += Number(line.quantity || 0); current.sales += Number(line.lineTotal || 0); categories.set(category.id, current);
  }
  const planDistribution = new Map();
  for (const row of subscriptionGroups) {
    const key = `${row.plan.id}:${row.status}`; const current = planDistribution.get(key) || { planId: row.plan.id, plan: row.plan.name, status: row.status, subscriptions: 0 };
    current.subscriptions += 1; planDistribution.set(key, current);
  }
  return {
    metrics: { totalRestaurants, activeRestaurants, totalBranches, totalCustomers, totalOrders, completedOrders, cancelledOrders, grossOrderValue: centsMoney(grossOrderValue), platformCommission: centsMoney(platformCommission), subscriptionRevenue: centsMoney(subscriptionRevenue), refundAmount: null, refundedOrders, refundedSubscriptionPayments, refundedTransactions: refundedOrders + refundedSubscriptionPayments, activeSubscriptions },
    chartsTruncated: [orders, registrations, customers, commissionRows, subscriptionRows, subscriptionGroups, orderItems].some((rows) => rows.length === 20000),
    ordersOverTime: [...days.values()].map((day) => ({ ...day, grossOrderValue: centsMoney(day.grossOrderValue), platformCommission: centsMoney(day.platformCommission), subscriptionRevenue: centsMoney(day.subscriptionRevenue) })),
    restaurantGrowth: growth(registrations), customerGrowth: growth(customers), orderStatusDistribution: Object.entries(statuses).map(([status, count]) => ({ status, count })),
    popularCategories: [...categories.values()].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 10).map((row) => ({ ...row, sales: centsMoney(row.sales) })),
    subscriptionDistribution: [...planDistribution.values()].sort((a, b) => b.subscriptions - a.subscriptions),
    topRestaurants: [...restaurantMap.values()].sort((a, b) => b.grossOrderValue - a.grossOrderValue).slice(0, 10).map((row) => ({ ...row, grossOrderValue: centsMoney(row.grossOrderValue) })),
  };
}

async function reportRows(type, from, to) {
  const created = dateWhere('createdAt', from, to);
  if (type === 'orders') return Order.findAll({ where: created, include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: false }, { model: Branch, as: 'branch', attributes: ['name'], required: false }, { model: User, as: 'customer', attributes: ['firstName', 'lastName', 'email'], required: false }], order: [['createdAt', 'DESC']], limit: 20000 });
  if (type === 'restaurants') return Restaurant.findAll({ where: created, attributes: ['id', 'name', 'email', 'approvalStatus', 'listingStatus', 'marketplaceEnabled', 'createdAt'], order: [['createdAt', 'DESC']], limit: 20000 });
  if (type === 'customers') return User.findAll({ where: created, attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'status', 'createdAt'], include: [{ model: Role, as: 'roles', where: { code: 'customer', scope: 'platform' }, attributes: [], through: { attributes: [] }, required: true }], order: [['createdAt', 'DESC']], limit: 20000 });
  if (type === 'subscriptions') return RestaurantSubscription.findAll({ where: created, include: [{ model: Restaurant, as: 'restaurant', attributes: ['name', 'email'] }, { model: SubscriptionPlan, as: 'plan', attributes: ['name', 'billingPeriod'] }], order: [['createdAt', 'DESC']], limit: 20000 });
  if (type === 'payments') {
    const [orders, subscriptions] = await Promise.all([
      Order.findAll({ where: created, attributes: ['id', 'orderNumber', 'restaurantId', 'paymentMethod', 'paymentStatus', 'subtotal', 'discount', 'total', 'razorpayPaymentId', 'createdAt'], include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: false }], order: [['createdAt', 'DESC']], limit: 20000 }),
      SubscriptionPayment.findAll({ where: dateWhere('createdAt', from, to), attributes: ['id', 'restaurantId', 'amount', 'currency', 'status', 'paymentType', 'razorpayPaymentId', 'verifiedAt', 'createdAt'], include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: false }], order: [['createdAt', 'DESC']], limit: 20000 }),
    ]);
    return [...orders.map((row) => ({ kind: 'order', id: row.id, reference: row.razorpayPaymentId || row.orderNumber, restaurant: row.restaurant?.name, paymentMethod: row.paymentMethod, status: row.paymentStatus, gross: Number(row.total), date: row.createdAt })), ...subscriptions.map((row) => ({ kind: 'subscription', id: row.id, reference: row.razorpayPaymentId || row.id, restaurant: row.restaurant?.name, paymentMethod: 'razorpay', status: row.status, gross: Number(row.amount), date: row.verifiedAt || row.createdAt }))].sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  if (type === 'commissions') return CommissionRecord.findAll({ where: dateWhere('transactionAt', from, to), include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'] }, { model: Order, as: 'order', attributes: ['orderNumber'] }], order: [['transactionAt', 'DESC']], limit: 20000 });
  if (type === 'settlements') return CommissionSettlement.findAll({ where: dateWhere('settledAt', from, to), include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'] }, { model: require('../../models').CommissionSettlementItem, as: 'items', include: [{ model: CommissionRecord, as: 'commissionRecord', include: [{ model: Order, as: 'order', attributes: ['orderNumber'] }] }] }], order: [['settledAt', 'DESC']], limit: 20000 });
  if (type === 'refunds') {
    const [orders, payments] = await Promise.all([
      Order.findAll({ where: { paymentStatus: 'refunded', updatedAt: dateWhere('updatedAt', from, to).updatedAt }, attributes: ['id', 'orderNumber', 'total', 'paymentStatus', 'updatedAt'], include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: false }, { model: require('../../models').OrderRefund, as: 'refund', attributes: ['amount', 'status', 'razorpayRefundId', 'processedAt'], required: false }], order: [['updatedAt', 'DESC']], limit: 20000 }),
      SubscriptionPayment.findAll({ where: { status: 'refunded', updatedAt: dateWhere('updatedAt', from, to).updatedAt }, attributes: ['id', 'amount', 'currency', 'status', 'updatedAt'], include: [{ model: Restaurant, as: 'restaurant', attributes: ['name'], required: false }], order: [['updatedAt', 'DESC']], limit: 20000 }),
    ]);
    return [...orders.map((row) => ({ sourceType: 'order', id: row.id, reference: row.refund?.razorpayRefundId || row.orderNumber, orderNumber: row.orderNumber, orderTotal: row.total, recordedRefundAmount: row.refund ? Number(row.refund.amount) : null, restaurant: row.restaurant?.name, status: row.refund?.status || row.paymentStatus, updatedAt: row.refund?.processedAt || row.updatedAt })), ...payments.map((row) => ({ sourceType: 'subscription', id: row.id, reference: row.id, orderTotal: row.amount, recordedRefundAmount: null, restaurant: row.restaurant?.name, status: row.status, updatedAt: row.updatedAt }))].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  throw fail(400, 'Unknown report type.');
}

const flattenReport = (type, row) => {
  const item = row.toJSON ? row.toJSON() : row;
  if (type === 'orders') return { orderNumber: item.orderNumber, customer: `${item.customer?.firstName || ''} ${item.customer?.lastName || ''}`.trim(), customerEmail: item.customer?.email, restaurant: item.restaurant?.name, branch: item.branch?.name, orderType: item.orderType, status: item.status, paymentStatus: item.paymentStatus, subtotal: item.subtotal, discount: item.discount, total: item.total, createdAt: item.createdAt };
  if (type === 'restaurants') return { id: item.id, name: item.name, email: item.email, approvalStatus: item.approvalStatus, listingStatus: item.listingStatus, marketplaceEnabled: item.marketplaceEnabled, createdAt: item.createdAt };
  if (type === 'customers') return { id: item.id, name: `${item.firstName || ''} ${item.lastName || ''}`.trim(), email: item.email, phone: item.phone, status: item.status, createdAt: item.createdAt };
  if (type === 'subscriptions') return { restaurant: item.restaurant?.name, email: item.restaurant?.email, plan: item.plan?.name, billingPeriod: item.plan?.billingPeriod, amount: item.amount, currency: item.currency, status: item.status, startDate: item.startDate, endDate: item.endDate, createdAt: item.createdAt };
  if (type === 'payments') return item;
  if (type === 'commissions') return { restaurant: item.restaurant?.name, order: item.order?.orderNumber, recordType: item.recordType, eligibleAmount: item.eligibleAmount, commissionRate: item.commissionRate, commissionAmount: item.commissionAmount, restaurantPayable: item.restaurantPayable, status: item.status, transactionAt: item.transactionAt };
  if (type === 'settlements') return { restaurant: item.restaurant?.name, amount: item.amount, currency: item.currency, transactionReference: item.transactionReference, settledAt: item.settledAt, status: item.status, relatedOrders: item.items?.map((entry) => entry.commissionRecord?.order?.orderNumber).filter(Boolean).join(', ') };
  if (type === 'refunds') return { sourceType: item.sourceType || 'order', reference: item.reference || item.orderNumber, restaurant: typeof item.restaurant === 'string' ? item.restaurant : item.restaurant?.name, originalAmount: item.orderTotal ?? item.total, recordedRefundAmount: item.recordedRefundAmount ?? null, status: item.status || item.paymentStatus, updatedAt: item.updatedAt };
  return item;
};

exports.overview = wrap(async (req, res) => { const { from, to, now } = range(req.query); send(res, { from, to, generatedAt: now, refundAmountAvailable: false, ...(await overviewData(from, to, now)) }); });

exports.report = wrap(async (req, res) => {
  const { from, to } = range(req.query); const type = req.params.type;
  const rows = (await reportRows(type, from, to)).map((row) => flattenReport(type, row));
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1); const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  send(res, { type, from, to, items: rows.slice((page - 1) * pageSize, page * pageSize), pagination: { total: rows.length, page, pageSize, totalPages: Math.ceil(rows.length / pageSize) }, truncated: rows.length === 20000 });
});

function csvCell(value) {
  let text = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  if (typeof value !== 'number' && /^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
exports.exportCsv = wrap(async (req, res) => {
  const { from, to } = range(req.query); const type = req.params.type;
  const rows = (await reportRows(type, from, to)).map((row) => flattenReport(type, row));
  if (!rows.length) return res.status(200).type('text/csv').attachment(`foodiehub-${type}-report.csv`).send('');
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const csv = [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(','))].join('\r\n');
  return res.status(200).type('text/csv; charset=utf-8').attachment(`foodiehub-${type}-report.csv`).send(`\uFEFF${csv}`);
});

