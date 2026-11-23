const { Op } = require('sequelize');
const { MenuCategory, FoodCategoryRequest, FoodCategoryRequestHistory, MenuItem, Restaurant } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const handle = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ success: false, message: 'A category with this name already exists.' });
    next(error);
  }
};
const nameKey = (name) => name.normalize('NFKC').trim().toLocaleLowerCase('en');

function categoryInput(body) {
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) throw fail(400, 'Category name is required (maximum 100 characters).');
  if (body.description != null && (typeof body.description !== 'string' || body.description.length > 500)) throw fail(400, 'Description must be 500 characters or fewer.');
  if (body.imageUrl != null && (typeof body.imageUrl !== 'string' || body.imageUrl.length > 1000 || (body.imageUrl && !/^https?:\/\//i.test(body.imageUrl)))) throw fail(400, 'Image URL must be a valid HTTP or HTTPS URL.');
  if (body.displayOrder !== undefined && (!Number.isInteger(Number(body.displayOrder)) || Number(body.displayOrder) < 0)) throw fail(400, 'Display order must be a non-negative integer.');
  return { name: body.name.trim(), description: body.description?.trim() || null, imageUrl: body.imageUrl?.trim() || null, displayOrder: Number(body.displayOrder || 0) };
}

async function categoryPayload(category) {
  const restaurantIds = await MenuItem.findAll({ where: { categoryId: category.id }, attributes: ['restaurantId'], group: ['restaurantId'], raw: true });
  const restaurants = restaurantIds.length ? await Restaurant.findAll({ where: { id: restaurantIds.map((row) => row.restaurantId) }, attributes: ['id', 'name', 'slug'] }) : [];
  return { ...category.toJSON(), restaurantCount: restaurants.length, restaurants };
}

exports.listCategories = handle(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const where = { scope: 'global' };
  if (req.query.active === 'true') where.isActive = true;
  if (req.query.active === 'false') where.isActive = false;
  if (req.query.search) where.name = { [Op.like]: `%${String(req.query.search).slice(0, 100)}%` };
  const result = await MenuCategory.findAndCountAll({ where, order: [['name', 'ASC']], limit: pageSize, offset: (page - 1) * pageSize });
  send(res, { items: await Promise.all(result.rows.map(categoryPayload)), page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) });
});

exports.categoryDetails = handle(async (req, res) => {
  const category = await MenuCategory.findOne({ where: { id: req.params.categoryId, scope: 'global' } });
  if (!category) throw fail(404, 'Global food category not found.');
  send(res, await categoryPayload(category));
});

exports.createCategory = handle(async (req, res) => {
  const values = categoryInput(req.body || {});
  const category = await MenuCategory.sequelize.transaction(async (transaction) => {
    const created = await MenuCategory.create({ ...values, scope: 'global', restaurantId: null, globalNameKey: nameKey(values.name), createdBy: req.user.id, isActive: true }, { transaction });
    await recordAuditEvent(req, { action: 'food_category.created', entityType: 'food_category', entityId: created.id, afterData: created.toJSON() }, { transaction });
    return created;
  });
  send(res, await categoryPayload(category), 201);
});

exports.updateCategory = handle(async (req, res) => {
  const values = categoryInput(req.body || {});
  const category = await MenuCategory.sequelize.transaction(async (transaction) => {
    const current = await MenuCategory.findOne({ where: { id: req.params.categoryId, scope: 'global' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail(404, 'Global food category not found.');
    const beforeData = current.toJSON();
    await current.update({ ...values, globalNameKey: nameKey(values.name) }, { transaction });
    await recordAuditEvent(req, { action: 'food_category.updated', entityType: 'food_category', entityId: current.id, beforeData, afterData: current.toJSON() }, { transaction });
    return current;
  });
  send(res, await categoryPayload(category));
});

exports.setCategoryStatus = handle(async (req, res) => {
  if (typeof req.body?.isActive !== 'boolean') throw fail(400, 'isActive must be true or false.');
  const category = await MenuCategory.sequelize.transaction(async (transaction) => {
    const current = await MenuCategory.findOne({ where: { id: req.params.categoryId, scope: 'global' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail(404, 'Global food category not found.');
    const beforeData = current.toJSON();
    await current.update({ isActive: req.body.isActive }, { transaction });
    await recordAuditEvent(req, { action: 'food_category.status_changed', entityType: 'food_category', entityId: current.id, beforeData, afterData: current.toJSON() }, { transaction });
    return current;
  });
  send(res, await categoryPayload(category));
});

exports.listRequests = handle(async (req, res) => {
  const where = {};
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) where.status = req.query.status;
  if (req.query.search) where.name = { [Op.like]: `%${String(req.query.search).slice(0, 100)}%` };
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const result = await FoodCategoryRequest.findAndCountAll({ where, include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name'] }, { model: require('../../models').User, as: 'requester', attributes: ['id', 'firstName', 'lastName', 'email'] }], order: [['createdAt', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize });
  send(res, { items: result.rows, page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) });
});

exports.requestDetails = handle(async (req, res) => {
  const request = await FoodCategoryRequest.findByPk(req.params.requestId, { include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'email'] }, { model: require('../../models').User, as: 'requester', attributes: ['id', 'firstName', 'lastName', 'email'] }, { model: require('../../models').User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName', 'email'] }, { model: MenuCategory, as: 'approvedCategory' }, { model: FoodCategoryRequestHistory, as: 'history', include: [{ model: require('../../models').User, as: 'performer', attributes: ['id', 'firstName', 'lastName'] }], order: [['createdAt', 'ASC']] }] });
  if (!request) throw fail(404, 'Category request not found.');
  const details = request.toJSON();
  details.history.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  send(res, details);
});

async function appendRequestHistory(request, action, previousStatus, newStatus, req, comments, transaction) {
  await FoodCategoryRequestHistory.create({ requestId: request.id, action, previousStatus, newStatus, performedBy: req.user.id, comments: comments || null }, { transaction });
}

exports.approveRequest = (approvalType) => handle(async (req, res) => {
  if (!['global', 'restaurant'].includes(approvalType)) throw fail(400, 'Invalid approval type.');
  const result = await FoodCategoryRequest.sequelize.transaction(async (transaction) => {
    const request = await FoodCategoryRequest.findByPk(req.params.requestId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!request) throw fail(404, 'Category request not found.');
    if (request.status !== 'pending') throw fail(409, 'This category request has already been reviewed.');
    let category;
    if (approvalType === 'global' && req.body?.categoryId) {
      category = await MenuCategory.findOne({ where: { id: req.body.categoryId, scope: 'global', isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!category) throw fail(400, 'Choose an active global category to map this request to.');
    } else {
      const existing = await MenuCategory.findAll({ where: approvalType === 'global' ? { scope: 'global' } : { scope: 'restaurant', restaurantId: request.restaurantId }, transaction, lock: transaction.LOCK.UPDATE });
      category = existing.find((candidate) => nameKey(candidate.name) === nameKey(request.name));
      if (category && !category.isActive) throw fail(409, 'A matching category exists but is inactive. Activate it or choose another review action.');
      if (!category) category = await MenuCategory.create({ name: request.name, description: request.description, imageUrl: request.imageUrl, displayOrder: request.displayOrder, scope: approvalType, restaurantId: approvalType === 'restaurant' ? request.restaurantId : null, globalNameKey: approvalType === 'global' ? nameKey(request.name) : null, createdBy: req.user.id, isActive: true }, { transaction });
    }
    await request.update({ status: 'approved', pendingNameKey: null, approvalType, approvedCategoryId: category.id, reviewedBy: req.user.id, reviewedAt: new Date(), rejectionReason: null }, { transaction });
    await appendRequestHistory(request, `approved_${approvalType}`, 'pending', 'approved', req, `Mapped to ${category.name} (${category.id}).`, transaction);
    await recordAuditEvent(req, { action: `food_category_request.approved_${approvalType}`, entityType: 'food_category_request', entityId: request.id, afterData: { categoryId: category.id, approvalType } }, { transaction });
    return { request, category };
  });
  send(res, result);
});

exports.rejectRequest = handle(async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 2000) throw fail(400, 'A rejection reason is required (maximum 2,000 characters).');
  const request = await FoodCategoryRequest.sequelize.transaction(async (transaction) => {
    const current = await FoodCategoryRequest.findByPk(req.params.requestId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail(404, 'Category request not found.');
    if (current.status !== 'pending') throw fail(409, 'This category request has already been reviewed.');
    await current.update({ status: 'rejected', pendingNameKey: null, reviewedBy: req.user.id, reviewedAt: new Date(), rejectionReason: reason }, { transaction });
    await appendRequestHistory(current, 'rejected', 'pending', 'rejected', req, reason, transaction);
    await recordAuditEvent(req, { action: 'food_category_request.rejected', entityType: 'food_category_request', entityId: current.id, reason, afterData: { rejectionReason: reason } }, { transaction });
    return current;
  });
  send(res, request);
});
