const { Op } = require('sequelize');
const { MenuItem, MenuCategory, MenuItemOption, Restaurant, Branch, AuditLog, User } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const itemSnapshot = (item) => ({ id: item.id, restaurantId: item.restaurantId, name: item.name, isAvailable: item.isAvailable, isActive: item.isActive, moderationStatus: item.moderationStatus, moderationReason: item.moderationReason, moderatedBy: item.moderatedBy, moderatedAt: item.moderatedAt });

function dateBoundary(value, end = false) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw fail(400, 'Dates must use YYYY-MM-DD format.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw fail(400, 'A date filter is invalid.');
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

exports.filters = handle(async (_req, res) => {
  const [restaurants, categories, branches] = await Promise.all([
    Restaurant.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']] }),
    MenuCategory.findAll({ attributes: ['id', 'name', 'restaurantId', 'scope'], order: [['name', 'ASC']] }),
    Branch.findAll({ attributes: ['id', 'name', 'restaurantId'], order: [['name', 'ASC']] }),
  ]);
  send(res, { restaurants, categories, branches });
});

exports.list = handle(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  const where = {};
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (search) {
    const matchingRestaurants = await Restaurant.findAll({ where: { name: { [Op.like]: `%${search}%` } }, attributes: ['id'], raw: true });
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      ...(matchingRestaurants.length ? [{ restaurantId: { [Op.in]: matchingRestaurants.map((restaurant) => restaurant.id) } }] : []),
    ];
  }
  if (req.query.restaurantId) where.restaurantId = req.query.restaurantId;
  if (req.query.categoryId) where.categoryId = req.query.categoryId;
  if (req.query.branchId) {
    const branch = await Branch.findByPk(req.query.branchId, { attributes: ['id', 'restaurantId'] });
    if (!branch) throw fail(400, 'Branch filter is invalid.');
    if (req.query.restaurantId && req.query.restaurantId !== branch.restaurantId) return send(res, { items: [], pagination: { total: 0, page, pageSize, totalPages: 0 } });
    where.restaurantId = branch.restaurantId;
  }
  if (req.query.availability && req.query.availability !== 'all') {
    if (!['available', 'unavailable'].includes(req.query.availability)) throw fail(400, 'Availability filter is invalid.');
    where.isAvailable = req.query.availability === 'available';
  }
  if (req.query.active && req.query.active !== 'all') {
    if (!['active', 'inactive'].includes(req.query.active)) throw fail(400, 'Active status filter is invalid.');
    where.isActive = req.query.active === 'active';
  }
  if (req.query.moderationStatus && req.query.moderationStatus !== 'all') {
    if (!['clear', 'hidden', 'disabled'].includes(req.query.moderationStatus)) throw fail(400, 'Moderation status filter is invalid.');
    where.moderationStatus = req.query.moderationStatus;
  }
  const from = dateBoundary(req.query.createdFrom);
  const to = dateBoundary(req.query.createdTo, true);
  if (from && to && from >= to) throw fail(400, 'The start date must be on or before the end date.');
  if (from || to) where.createdAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lt]: to } : {}) };

  const branchInclude = { model: Branch, as: 'branches', attributes: ['id', 'name', 'branchCode', 'isActive', 'approvalStatus'], required: Boolean(req.query.branchId) };
  if (req.query.branchId) branchInclude.where = { id: req.query.branchId };
  const result = await MenuItem.findAndCountAll({
    where,
    attributes: ['id', 'restaurantId', 'categoryId', 'name', 'description', 'price', 'discountedPrice', 'imageUrl', 'foodType', 'isAvailable', 'isActive', 'moderationStatus', 'createdAt', 'updatedAt'],
    include: [
      { model: MenuCategory, as: 'category', attributes: ['id', 'name', 'isActive'], required: true },
      { model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'slug', 'approvalStatus', 'listingStatus'], required: true, include: [branchInclude] },
    ],
    order: [['createdAt', 'DESC'], ['id', 'ASC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
  });
  send(res, { items: result.rows, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});

exports.details = handle(async (req, res) => {
  const item = await MenuItem.findByPk(req.params.itemId, {
    include: [
      { model: MenuCategory, as: 'category', attributes: ['id', 'name', 'description', 'isActive', 'scope'] },
      { model: MenuItemOption, as: 'options', attributes: ['id', 'type', 'name', 'price', 'displayOrder'], order: [['type', 'ASC'], ['displayOrder', 'ASC']] },
      { model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'slug', 'approvalStatus', 'listingStatus'], include: [{ model: Branch, as: 'branches', attributes: ['id', 'name', 'branchCode', 'isActive', 'approvalStatus', 'operationalStatus'] }] },
    ],
  });
  if (!item) throw fail(404, 'Food item not found.');
  const history = await AuditLog.findAll({
    where: { entityType: 'menu_item', entityId: item.id, action: { [Op.like]: 'menu_item.moderation_%' } },
    include: [{ model: User, as: 'actor', attributes: ['id', 'firstName', 'lastName', 'email'], required: false }],
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  send(res, { ...item.toJSON(), moderationHistory: history });
});

exports.moderate = handle(async (req, res) => {
  const { moderationStatus, reason } = req.body || {};
  if (!['clear', 'hidden', 'disabled'].includes(moderationStatus)) throw fail(400, 'Choose clear, hidden, or disabled moderation status.');
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) throw fail(400, 'A moderation reason is required (maximum 2,000 characters).');
  const item = await MenuItem.sequelize.transaction(async (transaction) => {
    const current = await MenuItem.findByPk(req.params.itemId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail(404, 'Food item not found.');
    const beforeData = itemSnapshot(current);
    const isActive = moderationStatus === 'disabled' ? false : moderationStatus === 'clear' ? true : current.isActive;
    await current.update({ moderationStatus, moderationReason: reason.trim(), moderatedBy: req.user.id, moderatedAt: new Date(), isActive }, { transaction });
    await recordAuditEvent(req, { action: `menu_item.moderation_${moderationStatus}`, entityType: 'menu_item', entityId: current.id, reason: reason.trim(), beforeData, afterData: itemSnapshot(current) }, { transaction });
    return current;
  });
  send(res, item);
});
