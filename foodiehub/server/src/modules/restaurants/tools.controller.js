'use strict';

const { Op } = require('sequelize');
const { Order, MenuItem, Reservation, RestaurantTable, Branch, RestaurantNotification } = require('../../models');
const { EVENT_PERMISSIONS } = require('../../services/restaurant-notifications');

function branchFilter(req, field = 'branchId') {
  return req.restaurantBranchIds === null ? {} : { [field]: { [Op.in]: req.restaurantBranchIds || [] } };
}

function result(type, name, secondary, href, entityId) {
  return { type, name, secondary, href, entityId };
}

exports.search = async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    if (query.length < 2) return res.json({ success: true, data: { results: [] } });
    const permissions = new Set(req.restaurantGrantedPermissions || []);
    const like = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const tasks = [];
    if (['orders.view', 'orders.manage', 'orders.manage_status'].some((permission) => permissions.has(permission))) tasks.push(Order.findAll({ where: { restaurantId: req.restaurant.id, ...branchFilter(req), [Op.or]: [{ orderNumber: { [Op.like]: like } }, { customerName: { [Op.like]: like } }, { customerPhone: { [Op.like]: like } }] }, attributes: ['id', 'orderNumber', 'customerName', 'status', 'branchId'], order: [['createdAt', 'DESC']], limit: 6 }).then((rows) => rows.map((row) => result('Order', row.orderNumber, `${row.customerName} · ${row.status.replaceAll('_', ' ')}`, `/restaurant/orders?search=${encodeURIComponent(row.orderNumber)}`, row.id))));
    if (permissions.has('orders.view')) tasks.push(Order.findAll({ where: { restaurantId: req.restaurant.id, ...branchFilter(req), [Op.or]: [{ customerName: { [Op.like]: like } }, { customerPhone: { [Op.like]: like } }] }, attributes: ['id', 'orderNumber', 'customerName', 'customerPhone'], order: [['createdAt', 'DESC']], limit: 20 }).then((rows) => {
      const unique = new Map();
      for (const row of rows) { const key = row.customerPhone || row.customerName.toLowerCase(); if (!unique.has(key)) unique.set(key, result('Customer', row.customerName, `Recent order ${row.orderNumber}`, `/restaurant/orders?search=${encodeURIComponent(row.customerName)}`, row.id)); }
      return [...unique.values()].slice(0, 6);
    }));
    if (permissions.has('menu.view')) tasks.push(MenuItem.findAll({ where: { restaurantId: req.restaurant.id, name: { [Op.like]: like } }, attributes: ['id', 'name', 'price', 'isAvailable'], order: [['name', 'ASC']], limit: 6 }).then((rows) => rows.map((row) => result('Menu item', row.name, `${row.isAvailable ? 'Available' : 'Unavailable'} · ₹${Number(row.price).toLocaleString('en-IN')}`, `/restaurant/menu?search=${encodeURIComponent(row.name)}`, row.id))));
    if (['reservations.view', 'reservations.manage'].some((permission) => permissions.has(permission))) tasks.push(Reservation.findAll({ where: { restaurantId: req.restaurant.id, ...branchFilter(req), [Op.or]: [{ guestName: { [Op.like]: like } }, { guestPhone: { [Op.like]: like } }, { id: { [Op.like]: like } }] }, attributes: ['id', 'guestName', 'guestPhone', 'startsAt', 'status', 'branchId'], order: [['startsAt', 'DESC']], limit: 6 }).then((rows) => rows.map((row) => result('Reservation', row.guestName, `${row.id.slice(0, 8).toUpperCase()} · ${row.status.replaceAll('_', ' ')} · ${new Date(row.startsAt).toLocaleString()}`, `/restaurant/reservations?search=${encodeURIComponent(row.guestName)}`, row.id))));
    if (permissions.has('tables.view')) tasks.push(RestaurantTable.findAll({ where: { restaurantId: req.restaurant.id, ...branchFilter(req), tableNumber: { [Op.like]: like } }, include: [{ model: Branch, as: 'branch', attributes: ['name'], required: true }], attributes: ['id', 'tableNumber', 'seatingCapacity', 'occupancyStatus'], order: [['tableNumber', 'ASC']], limit: 6 }).then((rows) => rows.map((row) => result('Table', `Table ${row.tableNumber}`, `${row.branch.name} · ${row.seatingCapacity} seats · ${row.occupancyStatus}`, `/restaurant/tables?search=${encodeURIComponent(row.tableNumber)}`, row.id))));
    if (permissions.has('branches.view')) tasks.push(Branch.findAll({ where: { restaurantId: req.restaurant.id, ...(req.restaurantBranchIds === null ? {} : { id: { [Op.in]: req.restaurantBranchIds || [] } }), [Op.or]: [{ name: { [Op.like]: like } }, { city: { [Op.like]: like } }] }, attributes: ['id', 'name', 'city'], order: [['name', 'ASC']], limit: 6 }).then((rows) => rows.map((row) => result('Branch', row.name, row.city || 'Restaurant branch', `/restaurant/branches?search=${encodeURIComponent(row.name)}`, row.id))));
    const results = (await Promise.all(tasks)).flat().slice(0, 24);
    return res.json({ success: true, data: { results } });
  } catch (error) { return next(error); }
};

function accessibleWhere(req) {
  return { restaurantId: req.restaurant.id, restaurantMemberId: req.restaurantMembership.id, ...(req.restaurantBranchIds === null ? {} : { [Op.or]: [{ branchId: null }, { branchId: { [Op.in]: req.restaurantBranchIds || [] } }] }) };
}

exports.notifications = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const where = accessibleWhere(req);
    const [rows, total, unreadCount] = await Promise.all([
      RestaurantNotification.findAll({ where, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit }),
      RestaurantNotification.count({ where }),
      RestaurantNotification.count({ where: { ...where, readAt: null } }),
    ]);
    return res.json({ success: true, data: { notifications: rows, unreadCount, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
  } catch (error) { return next(error); }
};

exports.markRead = async (req, res, next) => {
  try {
    const row = await RestaurantNotification.findOne({ where: { ...accessibleWhere(req), id: req.params.notificationId } });
    if (!row) return res.status(404).json({ success: false, message: 'Notification not found.' });
    if (!row.readAt) await row.update({ readAt: new Date() });
    return res.json({ success: true, data: { id: row.id, readAt: row.readAt } });
  } catch (error) { return next(error); }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const [updated] = await RestaurantNotification.update({ readAt: new Date() }, { where: { ...accessibleWhere(req), readAt: null } });
    return res.json({ success: true, data: { updated } });
  } catch (error) { return next(error); }
};

exports.notificationPermissions = [...new Set(Object.values(EVENT_PERMISSIONS).flat())];
