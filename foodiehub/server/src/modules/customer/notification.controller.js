'use strict';

const { Op } = require('sequelize');
const { CustomerNotification, CustomerNotificationPreference } = require('../../models');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data, status = 200, message) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });
const preferenceFields = ['orderUpdates', 'paymentUpdates', 'reservationUpdates', 'deliveryUpdates', 'supportUpdates', 'marketingUpdates'];

exports.list = wrap(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const where = { customerId: req.customer.id };
  const [result, unreadCount] = await Promise.all([
    CustomerNotification.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit }),
    CustomerNotification.count({ where: { customerId: req.customer.id, readAt: null } }),
  ]);
  send(res, { notifications: result.rows, unreadCount, pagination: { page, limit, total: result.count, totalPages: Math.ceil(result.count / limit) } });
});

exports.markRead = wrap(async (req, res) => {
  const notification = await CustomerNotification.findOne({ where: { id: req.params.notificationId, customerId: req.customer.id } });
  if (!notification) throw fail(404, 'Notification not found.');
  if (!notification.readAt) await notification.update({ readAt: new Date() });
  send(res, { id: notification.id, readAt: notification.readAt });
});

exports.markAllRead = wrap(async (req, res) => {
  const [updated] = await CustomerNotification.update({ readAt: new Date() }, { where: { customerId: req.customer.id, readAt: null } });
  send(res, { updated });
});

exports.preferences = wrap(async (req, res) => {
  const [preferences] = await CustomerNotificationPreference.findOrCreate({
    where: { customerId: req.customer.id },
    defaults: { customerId: req.customer.id },
  });
  send(res, Object.fromEntries(preferenceFields.map((field) => [field, preferences[field]])));
});

exports.updatePreferences = wrap(async (req, res) => {
  const input = req.body || {};
  const keys = Object.keys(input);
  if (!keys.length) throw fail(400, 'Choose at least one notification preference to update.');
  const unknown = keys.find((key) => !preferenceFields.includes(key));
  if (unknown) throw fail(400, `Unsupported notification preference: ${unknown}.`);
  for (const key of keys) if (typeof input[key] !== 'boolean') throw fail(400, `${key} must be true or false.`);
  const preferences = await CustomerNotificationPreference.sequelize.transaction(async (transaction) => {
    const [row] = await CustomerNotificationPreference.findOrCreate({ where: { customerId: req.customer.id }, defaults: { customerId: req.customer.id }, transaction });
    await row.reload({ transaction, lock: transaction.LOCK.UPDATE });
    await row.update(Object.fromEntries(keys.map((key) => [key, input[key]])), { transaction });
    return row;
  });
  send(res, Object.fromEntries(preferenceFields.map((field) => [field, preferences[field]])), 200, 'Notification preferences saved.');
});
