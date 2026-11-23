'use strict';
const { Op } = require('sequelize');
const { Order, CodCollection, CashHandover, CashHandoverItem, Restaurant, Branch, RestaurantMember, User } = require('../../models');
const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data) => res.json({ success: true, data });
const pageArgs = (query) => ({ page: Math.max(1, parseInt(query.page, 10) || 1), limit: Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25)) });
const cents = (value) => Math.round(Number(value || 0) * 100);
const cash = (value) => Number((value / 100).toFixed(2));

function range(req) {
  const where = {};
  if (req.query.restaurantId) where.restaurantId = req.query.restaurantId;
  if (req.query.branchId) where.branchId = req.query.branchId;
  if (req.query.from || req.query.to) {
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime()))) throw fail(400, 'Date range is invalid.');
    where.createdAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
  }
  return where;
}

const associated = [
  { model: Order, as: 'order', attributes: ['id', 'orderNumber', 'customerName', 'customerPhone', 'total', 'paymentStatus', 'status'], required: true },
  { model: Restaurant, as: 'restaurant', attributes: ['id', 'name'], required: true },
  { model: Branch, as: 'branch', attributes: ['id', 'name'], required: false },
  { model: RestaurantMember, as: 'deliveryEmployee', attributes: ['id', 'employeeId'], required: true, include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'], required: true }] },
];

exports.overview = wrap(async (req, res) => {
  const where = range(req);
  const [orders, handovers] = await Promise.all([
    CodCollection.findAll({ where, attributes: ['id', 'expectedAmount', 'collectedAmount', 'status'] }),
    CashHandover.findAll({ where, attributes: ['id', 'expectedAmount', 'submittedAmount', 'receivedAmount', 'status'] }),
  ]);
  const sum = (rows, selector) => cash(rows.reduce((total, row) => total + cents(selector(row)), 0));
  send(res, { totals: { codExpected: sum(orders, (row) => row.expectedAmount), codCollected: sum(orders.filter((row) => ['collected', 'reconciled', 'disputed'].includes(row.status)), (row) => row.collectedAmount), pendingHandovers: handovers.filter((row) => row.status === 'pending').length, disputedCollections: orders.filter((row) => row.status === 'disputed').length, disputedHandovers: handovers.filter((row) => row.status === 'disputed').length }, recentCollections: await CodCollection.findAll({ where, include: associated, order: [['createdAt', 'DESC']], limit: 10 }), recentHandovers: await CashHandover.findAll({ where, include: [...associated.filter((item) => item.as !== 'order'), { model: CashHandoverItem, as: 'items', include: [{ model: CodCollection, as: 'collection', include: [{ model: Order, as: 'order', attributes: ['orderNumber'] }] }] }], order: [['submittedAt', 'DESC']], limit: 10 }) });
});

exports.collections = wrap(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const where = range(req);
  if (req.query.status && req.query.status !== 'all') {
    if (!['awaiting_collection', 'collected', 'collection_failed', 'disputed', 'reconciled'].includes(req.query.status)) throw fail(400, 'Collection status filter is invalid.');
    where.status = req.query.status;
  }
  const result = await CodCollection.findAndCountAll({ where, include: associated, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true });
  send(res, { items: result.rows, pagination: { total: result.count, page, limit, totalPages: Math.ceil(result.count / limit) } });
});

exports.handovers = wrap(async (req, res) => {
  const { page, limit } = pageArgs(req.query);
  const where = range(req);
  if (req.query.status && req.query.status !== 'all') {
    if (!['pending', 'confirmed', 'disputed'].includes(req.query.status)) throw fail(400, 'Handover status filter is invalid.');
    where.status = req.query.status;
  }
  const result = await CashHandover.findAndCountAll({ where, include: [...associated.filter((item) => item.as !== 'order'), { model: User, as: 'receiver', attributes: ['firstName', 'lastName'], required: false }, { model: CashHandoverItem, as: 'items', include: [{ model: CodCollection, as: 'collection', include: [{ model: Order, as: 'order', attributes: ['orderNumber'] }] }] }], order: [['submittedAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true });
  send(res, { items: result.rows, pagination: { total: result.count, page, limit, totalPages: Math.ceil(result.count / limit) } });
});
