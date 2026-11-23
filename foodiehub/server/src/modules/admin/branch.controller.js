const { Op } = require('sequelize');
const { Branch, Restaurant } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');
const { assertApprovalTransition } = require('../../services/branch-policy');
const { branchAvailabilityStatus } = require('../../services/branch-availability');

const fail = (status, message) => Object.assign(new Error(message), { status });
const send = (res, data, status = 200) => res.status(status).json({ success: true, data });
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const branchSnapshot = (branch) => ({ id: branch.id, restaurantId: branch.restaurantId, name: branch.name, approvalStatus: branch.approvalStatus, operationalStatus: branch.operationalStatus, isActive: branch.isActive, isPrimary: branch.isPrimary, rejectionReason: branch.rejectionReason });

exports.list = handle(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const where = {};
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (req.query.restaurantId) where.restaurantId = req.query.restaurantId;
  if (req.query.approvalStatus && req.query.approvalStatus !== 'all') {
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(req.query.approvalStatus)) throw fail(400, 'Invalid branch approval status filter.');
    where.approvalStatus = req.query.approvalStatus;
  }
  if (req.query.operationalStatus && req.query.operationalStatus !== 'all') {
    if (req.query.operationalStatus === 'scheduled') where.operationalStatus = { [Op.in]: ['open', 'closed'] };
    else {
      if (!['open', 'closed', 'temporarily_closed', 'inactive'].includes(req.query.operationalStatus)) throw fail(400, 'Invalid branch operational status filter.');
      where.operationalStatus = req.query.operationalStatus;
    }
  }
  if (search) where[Op.or] = [
    { name: { [Op.like]: `%${search}%` } },
    { branchCode: { [Op.like]: `%${search}%` } },
    { city: { [Op.like]: `%${search}%` } },
  ];
  const result = await Branch.findAndCountAll({
    where,
    include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'slug'], required: true }],
    order: [['createdAt', 'DESC'], ['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });
  const now = new Date();
  send(res, { branches: result.rows.map((branch) => ({ ...branch.toJSON(), availabilityStatus: branchAvailabilityStatus(branch, now) })), pagination: { total: result.count, page, limit, totalPages: Math.ceil(result.count / limit) } });
});

exports.setApproval = handle(async (req, res) => {
  const { approvalStatus, reason } = req.body || {};
  if (!['approved', 'rejected', 'suspended'].includes(approvalStatus)) throw fail(400, 'approvalStatus must be approved, rejected, or suspended.');
  if (approvalStatus === 'rejected' && (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000)) throw fail(400, 'Provide a rejection reason (up to 2,000 characters).');
  const branch = await Branch.sequelize.transaction(async (transaction) => {
    const current = await Branch.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail(404, 'Branch not found.');
    try { assertApprovalTransition(current.approvalStatus, approvalStatus); } catch (error) { throw fail(error.status, error.message); }
    const beforeData = branchSnapshot(current);
    await current.update({ approvalStatus, rejectionReason: approvalStatus === 'rejected' ? reason.trim() : null }, { transaction });
    await recordAuditEvent(req, { action: `branch.${approvalStatus}`, entityType: 'branch', entityId: current.id, beforeData, afterData: branchSnapshot(current) }, { transaction });
    return current;
  });
  send(res, branch);
});

exports.setOperationalStatus = handle(async (req, res) => {
  const { operationalStatus } = req.body || {};
  if (!['open', 'closed', 'temporarily_closed', 'inactive'].includes(operationalStatus)) throw fail(400, 'Invalid branch operational status.');
  const branch = await Branch.sequelize.transaction(async (transaction) => {
    const current = await Branch.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current) throw fail(404, 'Branch not found.');
    if (operationalStatus === 'open' && (!current.isActive || !['approved'].includes(current.approvalStatus))) throw fail(409, 'Only active, approved branches can be opened.');
    const beforeData = branchSnapshot(current);
    await current.update({ operationalStatus }, { transaction });
    await recordAuditEvent(req, { action: 'branch.operational_status_changed', entityType: 'branch', entityId: current.id, beforeData, afterData: branchSnapshot(current) }, { transaction });
    return current;
  });
  send(res, branch);
});
