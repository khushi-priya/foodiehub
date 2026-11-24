const { Op } = require('sequelize');
const { Order, OrderItem, OrderRefund, User, Restaurant, Branch, RestaurantTable, MenuItem } = require('../../models');

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const ORDER_STATUSES = ['pending', 'accepted', 'rejected', 'preparing', 'ready', 'picked_up', 'out_for_delivery', 'completed', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];
const ORDER_TYPES = ['delivery', 'takeaway', 'dine_in'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateBoundary(value, end = false) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw fail(400, 'Dates must use YYYY-MM-DD format.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw fail(400, 'A date filter is invalid.');
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

exports.filters = handle(async (_req, res) => {
  const [restaurants, branches] = await Promise.all([
    Restaurant.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']] }),
    Branch.findAll({ attributes: ['id', 'name', 'restaurantId'], order: [['name', 'ASC']] }),
  ]);
  send(res, { restaurants, branches, orderTypes: ORDER_TYPES, orderStatuses: ORDER_STATUSES, paymentStatuses: PAYMENT_STATUSES });
});

exports.list = handle(async (req, res) => {
  const { page, pageSize, limit, offset } = pagination(req.query);
  const where = {};
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (search) {
    const tokens = search.split(/\s+/).filter(Boolean);
    const customerWhere = tokens.map((token) => ({ [Op.or]: [
      { firstName: { [Op.like]: `%${token}%` } },
      { lastName: { [Op.like]: `%${token}%` } },
      { email: { [Op.like]: `%${token}%` } },
      { phone: { [Op.like]: `%${token}%` } },
    ] }));
    const [matchingCustomers, matchingRestaurants] = await Promise.all([
      User.findAll({ where: { [Op.and]: customerWhere }, attributes: ['id'], raw: true }),
      Restaurant.findAll({ where: { name: { [Op.like]: `%${search}%` } }, attributes: ['id'], raw: true }),
    ]);
    const customerIds = matchingCustomers.map((customer) => customer.id);
    const restaurantIds = matchingRestaurants.map((restaurant) => restaurant.id);
    where[Op.or] = [
      { id: { [Op.like]: `%${search}%` } },
      { orderNumber: { [Op.like]: `%${search}%` } },
      { customerName: { [Op.like]: `%${search}%` } },
      { customerEmail: { [Op.like]: `%${search}%` } },
      { customerPhone: { [Op.like]: `%${search}%` } },
      { ...(customerIds.length ? { customerId: { [Op.in]: customerIds } } : { customerId: { [Op.in]: [] } }) },
      { ...(restaurantIds.length ? { restaurantId: { [Op.in]: restaurantIds } } : { restaurantId: { [Op.in]: [] } }) },
    ];
  }
  for (const [key, allowed] of [['orderType', ORDER_TYPES], ['status', ORDER_STATUSES], ['paymentStatus', PAYMENT_STATUSES]]) {
    const value = req.query[key];
    if (value && value !== 'all') {
      if (!allowed.includes(value)) throw fail(400, `${key} filter is invalid.`);
      where[key] = value;
    }
  }
  if (req.query.restaurantId) {
    if (!UUID_PATTERN.test(req.query.restaurantId)) throw fail(400, 'Restaurant filter is invalid.');
    where.restaurantId = req.query.restaurantId;
  }
  if (req.query.branchId) {
    if (!UUID_PATTERN.test(req.query.branchId)) throw fail(400, 'Branch filter is invalid.');
    where.branchId = req.query.branchId;
  }
  const from = dateBoundary(req.query.createdFrom);
  const to = dateBoundary(req.query.createdTo, true);
  if (from && to && from >= to) throw fail(400, 'The start date must be on or before the end date.');
  if (from || to) where.createdAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lt]: to } : {}) };

  const result = await Order.findAndCountAll({
    where,
    attributes: ['id', 'orderNumber', 'customerId', 'restaurantId', 'branchId', 'orderType', 'status', 'kitchenStatus', 'paymentStatus', 'paymentMethod', 'subtotal', 'tax', 'deliveryFee', 'packagingFee', 'discount', 'total', 'razorpayOrderId', 'razorpayPaymentId', 'createdAt'],
    include: [
      { model: User, as: 'customer', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'], required: false },
      { model: Restaurant, as: 'restaurant', attributes: ['id', 'name'], required: true },
      { model: Branch, as: 'branch', attributes: ['id', 'name', 'city'], required: false },
    ],
    order: [['createdAt', 'DESC'], ['id', 'ASC']], limit, offset, distinct: true,
  });
  send(res, { items: result.rows, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});

exports.details = handle(async (req, res) => {
  if (!UUID_PATTERN.test(req.params.orderId)) throw fail(400, 'Order ID is invalid.');
  const order = await Order.findByPk(req.params.orderId, {
    include: [
      { model: User, as: 'customer', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'], required: false },
      { model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'email', 'phone', 'approvalStatus', 'listingStatus'], required: true },
      { model: Branch, as: 'branch', attributes: ['id', 'name', 'phone', 'addressLine', 'addressLine2', 'city', 'state', 'postalCode'], required: false },
      { model: RestaurantTable, as: 'table', attributes: ['id', 'tableNumber'], required: false },
      { model: OrderRefund, as: 'refund', attributes: ['id', 'amount', 'reason', 'status', 'providerStatus', 'razorpayRefundId', 'createdAt', 'processedAt'], required: false },
      { model: OrderItem, as: 'items', attributes: ['id', 'menuItemId', 'itemName', 'itemDescription', 'variantName', 'variantOptionId', 'addonsSnapshot', 'quantity', 'unitPrice', 'lineTotal', 'itemNotes'], include: [{ model: MenuItem, as: 'menuItem', attributes: ['imageUrl'], required: false }] },
    ],
  });
  if (!order) throw fail(404, 'Order not found.');
  const data = order.toJSON();
  data.payment = {
    method: order.paymentMethod,
    status: order.paymentStatus,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId,
  };
  data.refund = order.refund || null;
  send(res, data);
});
