const { Op } = require('sequelize');
const { SubscriptionPlan, RestaurantSubscription, SubscriptionPayment, Restaurant } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const paymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
const subscriptionStatuses = ['pending', 'active', 'expired', 'cancelled', 'failed'];
const safePlan = (plan) => ({ id: plan.id, code: plan.code, name: plan.name, description: plan.description, price: plan.price, currency: plan.currency, billingPeriod: plan.billingPeriod, maxBranches: plan.maxBranches, maxEmployees: plan.maxEmployees, features: plan.features || [], isActive: plan.isActive, createdAt: plan.createdAt, updatedAt: plan.updatedAt });

function validatePlan(body) {
  if (typeof body?.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) throw fail(400, 'Plan name is required (maximum 120 characters).');
  if (typeof body.code !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(body.code.trim()) || body.code.trim().length > 80) throw fail(400, 'Plan code must use letters, numbers, and hyphens (maximum 80 characters).');
  if (body.description != null && (typeof body.description !== 'string' || body.description.length > 2000)) throw fail(400, 'Plan description must be 2,000 characters or fewer.');
  if (body.billingPeriod && !['monthly', 'yearly'].includes(body.billingPeriod)) throw fail(400, 'Billing period must be monthly or yearly.');
  if (!['monthly', 'yearly'].includes(body.billingPeriod)) throw fail(400, 'Billing period must be monthly or yearly.');
  if (!Number.isFinite(Number(body.price)) || Number(body.price) < 0 || Number(body.price) > 999999999.99) throw fail(400, 'Plan price must be between 0 and 999,999,999.99 INR.');
  for (const field of ['maxBranches', 'maxEmployees']) if (body[field] !== null && body[field] !== '' && body[field] !== undefined && (!Number.isInteger(Number(body[field])) || Number(body[field]) < (field === 'maxBranches' ? 1 : 0) || Number(body[field]) > 100000)) throw fail(400, `${field} must be a valid integer or blank for unlimited.`);
  if (body.features !== undefined && (!Array.isArray(body.features) || body.features.length > 50 || body.features.some((feature) => typeof feature !== 'string' || !feature.trim() || feature.trim().length > 250))) throw fail(400, 'Features must be a list of up to 50 text entries (maximum 250 characters each).');
  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw fail(400, 'isActive must be true or false.');
}

function planValues(body) {
  return { code: body.code.trim().toLowerCase(), name: body.name.trim(), description: body.description?.trim() || null, price: Number(body.price), currency: 'INR', billingPeriod: body.billingPeriod, maxBranches: body.maxBranches === '' || body.maxBranches == null ? null : Number(body.maxBranches), maxEmployees: body.maxEmployees === '' || body.maxEmployees == null ? null : Number(body.maxEmployees), features: (body.features || []).map((feature) => feature.trim()), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) };
}

exports.listPlans = handle(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const where = {};
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (search) where[Op.or] = [{ name: { [Op.like]: `%${search}%` } }, { code: { [Op.like]: `%${search}%` } }];
  if (req.query.active && req.query.active !== 'all') {
    if (!['true', 'false'].includes(req.query.active)) throw fail(400, 'Plan status filter is invalid.');
    where.isActive = req.query.active === 'true';
  }
  const result = await SubscriptionPlan.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize });
  send(res, { items: result.rows.map(safePlan), pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});

exports.createPlan = handle(async (req, res) => {
  validatePlan(req.body);
  const plan = await SubscriptionPlan.sequelize.transaction(async (transaction) => {
    const created = await SubscriptionPlan.create({ ...planValues(req.body), createdBy: req.user.id }, { transaction });
    await recordAuditEvent(req, { action: 'subscription_plan.created', entityType: 'subscription_plan', entityId: created.id, afterData: safePlan(created) }, { transaction });
    return created;
  });
  send(res, safePlan(plan), 201);
});

exports.updatePlan = handle(async (req, res) => {
  validatePlan(req.body);
  const plan = await SubscriptionPlan.sequelize.transaction(async (transaction) => {
    const current = await SubscriptionPlan.findByPk(req.params.planId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail(404, 'Subscription plan not found.');
    const beforeData = safePlan(current);
    await current.update(planValues(req.body), { transaction });
    await recordAuditEvent(req, { action: 'subscription_plan.updated', entityType: 'subscription_plan', entityId: current.id, beforeData, afterData: safePlan(current) }, { transaction });
    return current;
  });
  send(res, safePlan(plan));
});

exports.setPlanStatus = handle(async (req, res) => {
  if (typeof req.body?.isActive !== 'boolean') throw fail(400, 'isActive must be true or false.');
  const plan = await SubscriptionPlan.sequelize.transaction(async (transaction) => {
    const current = await SubscriptionPlan.findByPk(req.params.planId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail(404, 'Subscription plan not found.');
    const beforeData = safePlan(current);
    await current.update({ isActive: req.body.isActive }, { transaction });
    await recordAuditEvent(req, { action: `subscription_plan.${req.body.isActive ? 'activated' : 'deactivated'}`, entityType: 'subscription_plan', entityId: current.id, beforeData, afterData: safePlan(current) }, { transaction });
    return current;
  });
  send(res, safePlan(plan));
});

exports.listSubscriptions = handle(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const where = {};
  const status = req.query.status;
  if (status && status !== 'all') {
    if (!subscriptionStatuses.includes(status)) throw fail(400, 'Subscription status filter is invalid.');
    const now = new Date();
    if (status === 'expired') where[Op.or] = [{ status: 'expired' }, { status: 'active', endDate: { [Op.lte]: now } }];
    else if (status === 'pending') where[Op.or] = [{ status: 'pending' }, { status: 'active', startDate: { [Op.gt]: now } }];
    else if (status === 'active') { where.status = 'active'; where.startDate = { [Op.lte]: now }; where.endDate = { [Op.gt]: now }; }
    else where.status = status;
  }
  if (req.query.planId) {
    if (!UUID.test(req.query.planId)) throw fail(400, 'Plan filter is invalid.');
    where.planId = req.query.planId;
  }
  if (req.query.paymentStatus && req.query.paymentStatus !== 'all') {
    if (!paymentStatuses.includes(req.query.paymentStatus)) throw fail(400, 'Payment status filter is invalid.');
    const matchingPayments = await SubscriptionPayment.findAll({ where: { status: req.query.paymentStatus }, attributes: ['subscriptionId'], raw: true });
    const ids = [...new Set(matchingPayments.map((payment) => payment.subscriptionId))];
    where.id = { [Op.in]: ids };
  }
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (search) {
    const restaurants = await Restaurant.findAll({ where: { [Op.or]: [{ name: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } }] }, attributes: ['id'], raw: true });
    where.restaurantId = { [Op.in]: restaurants.map((restaurant) => restaurant.id) };
  }
  const result = await RestaurantSubscription.findAndCountAll({ where, include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'email'], required: true }, { model: SubscriptionPlan, as: 'plan', attributes: ['id', 'code', 'name', 'billingPeriod', 'maxBranches', 'maxEmployees'], required: true }], order: [['createdAt', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize, distinct: true });
  const ids = result.rows.map((subscription) => subscription.id);
  const payments = ids.length ? await SubscriptionPayment.findAll({ where: { subscriptionId: { [Op.in]: ids } }, order: [['createdAt', 'DESC']] }) : [];
  const latestPayment = new Map();
  for (const payment of payments) if (!latestPayment.has(payment.subscriptionId)) latestPayment.set(payment.subscriptionId, payment);
  const now = new Date();
  const items = result.rows.map((subscription) => {
    const value = subscription.toJSON();
    if (value.status === 'active' && value.startDate && new Date(value.startDate) > now) value.displayStatus = 'pending';
    else if (value.status === 'active' && value.endDate && new Date(value.endDate) <= now) value.displayStatus = 'expired';
    else value.displayStatus = value.status;
    value.latestPaymentStatus = latestPayment.get(value.id)?.status || null;
    return value;
  });
  send(res, { items, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});

exports.subscriptionDetails = handle(async (req, res) => {
  const subscription = await RestaurantSubscription.findByPk(req.params.subscriptionId, { include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'email', 'phone'], required: true }, { model: SubscriptionPlan, as: 'plan', required: true }, { model: SubscriptionPayment, as: 'payments', include: [{ model: SubscriptionPlan, as: 'plan', attributes: ['id', 'name', 'billingPeriod'], required: true }], order: [['createdAt', 'DESC']] }] });
  if (!subscription) throw fail(404, 'Restaurant subscription not found.');
  const value = subscription.toJSON();
  const now = new Date();
  value.displayStatus = value.status === 'active' && value.startDate && new Date(value.startDate) > now ? 'pending' : value.status === 'active' && value.endDate && new Date(value.endDate) <= now ? 'expired' : value.status;
  value.payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  send(res, value);
});
