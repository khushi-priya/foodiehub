const { Op } = require('sequelize');
const { PlatformFoodCoupon, PlatformFoodCouponRedemption, SubscriptionCoupon, SubscriptionCouponRedemption, User, Order, Restaurant, SubscriptionPayment } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data, status = 200, message) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function schema(type) {
  if (type === 'platform_food') return { Coupon: PlatformFoodCoupon, Redemption: PlatformFoodCouponRedemption, redemptions: 'redemptions', owner: 'customer', target: Order };
  if (type === 'subscription') return { Coupon: SubscriptionCoupon, Redemption: SubscriptionCouponRedemption, redemptions: 'redemptions', owner: 'restaurant', target: SubscriptionPayment };
  throw fail(400, 'Coupon type must be platform_food or subscription.');
}
function validate(body, type) {
  const errors = [];
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) errors.push('Code must contain 3–40 letters, numbers, underscores, or hyphens.');
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120) errors.push('Name is required and must be at most 120 characters.');
  if (!['fixed', 'percentage'].includes(body.discountType)) errors.push('Select a valid discount type.');
  const value = Number(body.discountValue);
  if (!Number.isFinite(value) || value <= 0 || (body.discountType === 'percentage' && value > 100)) errors.push('Discount value must be positive and percentages cannot exceed 100.');
  const startsAt = new Date(body.startsAt); const expiresAt = new Date(body.expiresAt);
  if (!body.startsAt || !Number.isFinite(startsAt.getTime()) || !body.expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt) errors.push('Expiry must be later than the start date.');
  const optionalLimits = type === 'platform_food' ? ['usageLimit', 'perCustomerLimit'] : ['usageLimit', 'perRestaurantLimit'];
  for (const key of optionalLimits) if (body[key] !== null && body[key] !== '' && body[key] !== undefined && (!Number.isInteger(Number(body[key])) || Number(body[key]) < 1)) errors.push(`${key} must be a positive whole number or empty.`);
  if (type === 'platform_food' && (!Number.isFinite(Number(body.minimumOrderAmount ?? 0)) || Number(body.minimumOrderAmount ?? 0) < 0)) errors.push('Minimum order amount cannot be negative.');
  if (body.maximumDiscount !== null && body.maximumDiscount !== '' && body.maximumDiscount !== undefined && (!Number.isFinite(Number(body.maximumDiscount)) || Number(body.maximumDiscount) <= 0)) errors.push('Maximum discount must be positive or empty.');
  if (type === 'subscription' && !['all', 'first', 'renewal'].includes(body.appliesTo || 'all')) errors.push('Choose all, first, or renewal subscription applicability.');
  for (const key of ['restaurantIds', 'categoryIds', 'productIds']) if (type === 'platform_food' && body[key] != null && (!Array.isArray(body[key]) || body[key].some((id) => typeof id !== 'string' || !UUID.test(id)))) errors.push(`${key} must be an array of valid IDs.`);
  if (errors.length) throw fail(400, errors.join(' '));
  return { code, name: body.name.trim(), description: typeof body.description === 'string' ? body.description.trim() || null : null, discountType: body.discountType, discountValue: value, maximumDiscount: body.maximumDiscount === '' || body.maximumDiscount == null ? null : Number(body.maximumDiscount), startsAt, expiresAt, usageLimit: body.usageLimit === '' || body.usageLimit == null ? null : Number(body.usageLimit), status: body.status === 'inactive' ? 'inactive' : 'active', ...(type === 'platform_food' ? { minimumOrderAmount: Number(body.minimumOrderAmount || 0), perCustomerLimit: body.perCustomerLimit === '' || body.perCustomerLimit == null ? null : Number(body.perCustomerLimit), restaurantIds: body.restaurantIds || null, categoryIds: body.categoryIds || null, productIds: body.productIds || null } : { appliesTo: body.appliesTo || 'all', perRestaurantLimit: body.perRestaurantLimit === '' || body.perRestaurantLimit == null ? null : Number(body.perRestaurantLimit) }) };
}

exports.list = wrap(async (req, res) => {
  const { Coupon, Redemption } = schema(req.query.type);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1); const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const where = {};
  if (req.query.search) where[Op.or] = [{ code: { [Op.like]: `%${req.query.search.trim()}%` } }, { name: { [Op.like]: `%${req.query.search.trim()}%` } }];
  if (['active', 'inactive'].includes(req.query.status)) where.status = req.query.status;
  if (req.query.expiryFrom || req.query.expiryTo) where.expiresAt = { ...(req.query.expiryFrom ? { [Op.gte]: new Date(req.query.expiryFrom) } : {}), ...(req.query.expiryTo ? { [Op.lte]: new Date(req.query.expiryTo) } : {}) };
  const result = await Coupon.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize });
  const items = await Promise.all(result.rows.map(async (coupon) => ({ ...coupon.toJSON(), usageCount: await Redemption.count({ where: { couponId: coupon.id, ...(req.query.type === 'platform_food' ? { status: { [Op.ne]: 'released' } } : {}) } }) })));
  send(res, { items, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});

exports.create = wrap(async (req, res) => {
  const { Coupon } = schema(req.body?.type); const type = req.body.type;
  const values = validate(req.body, type);
  const coupon = await Coupon.sequelize.transaction(async (transaction) => {
    const created = await Coupon.create({ ...values, createdBy: req.user?.id || req.authUser?.id || null }, { transaction });
    await recordAuditEvent(req, { action: `coupon.${type}.created`, entityType: `${type}_coupon`, entityId: created.id, afterData: values }, { transaction });
    return created;
  });
  send(res, coupon, 201, 'Coupon created.');
});

exports.update = wrap(async (req, res) => {
  const type = req.body?.type || req.query.type; const { Coupon } = schema(type);
  const values = validate(req.body, type);
  const updated = await Coupon.sequelize.transaction(async (transaction) => {
    const coupon = await Coupon.findByPk(req.params.couponId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!coupon) throw fail(404, 'Coupon not found.');
    const before = coupon.toJSON(); await coupon.update(values, { transaction });
    await recordAuditEvent(req, { action: `coupon.${type}.updated`, entityType: `${type}_coupon`, entityId: coupon.id, beforeData: before, afterData: values }, { transaction });
    return coupon;
  });
  send(res, updated, 200, 'Coupon updated.');
});

exports.setStatus = wrap(async (req, res) => {
  const type = req.body?.type || req.query.type; const { Coupon } = schema(type);
  if (!['active', 'inactive'].includes(req.body?.status)) throw fail(400, 'Status must be active or inactive.');
  const coupon = await Coupon.sequelize.transaction(async (transaction) => {
    const row = await Coupon.findByPk(req.params.couponId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw fail(404, 'Coupon not found.');
    const before = row.status; await row.update({ status: req.body.status }, { transaction });
    await recordAuditEvent(req, { action: `coupon.${type}.status_changed`, entityType: `${type}_coupon`, entityId: row.id, beforeData: { status: before }, afterData: { status: row.status } }, { transaction });
    return row;
  });
  send(res, coupon, 200, 'Coupon status updated.');
});

exports.details = wrap(async (req, res) => {
  const type = req.query.type; const { Coupon, Redemption, target, owner } = schema(type);
  const coupon = await Coupon.findByPk(req.params.couponId);
  if (!coupon) throw fail(404, 'Coupon not found.');
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1); const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const result = await Redemption.findAndCountAll({ where: { couponId: coupon.id }, include: [{ model: owner === 'customer' ? User : Restaurant, as: owner, attributes: owner === 'customer' ? ['id', 'firstName', 'lastName', 'email'] : ['id', 'name'] }, { model: target, as: owner === 'customer' ? 'order' : 'payment', attributes: owner === 'customer' ? ['id', 'orderNumber', 'status', 'paymentStatus', 'createdAt'] : ['id', 'amount', 'status', 'createdAt'] }], order: [['createdAt', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize });
  send(res, { coupon, usage: result.rows, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});
