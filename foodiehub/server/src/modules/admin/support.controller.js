const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const { SupportTicket, SupportMessage, SupportAttachment, Restaurant, Branch, Order, User, AuditLog } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');
const { CATEGORIES, STATUSES, PRIORITIES, validateAttachments, publicAttachment, notifyRestaurant } = require('../support/support.shared');
const { createCustomerNotification } = require('../../services/customer-notifications');

const fail = (status, message) => Object.assign(new Error(message), { status });
const userAttributes = ['id', 'firstName', 'lastName', 'email'];
const attachmentAttributes = ['id', 'messageId', 'uploadedByUserId', 'fileName', 'contentType', 'sizeBytes', 'createdAt'];
const ticketIncludes = [
  { model: Restaurant, as: 'restaurant', attributes: ['id', 'name', 'email', 'phone'] },
  { model: User, as: 'creator', attributes: userAttributes },
  { model: User, as: 'assignedAdmin', attributes: userAttributes, required: false },
  { model: Branch, as: 'relatedBranch', attributes: ['id', 'name'], required: false },
  { model: Order, as: 'relatedOrder', attributes: ['id', 'orderNumber', 'status'], required: false },
  { model: SupportAttachment, as: 'attachments', attributes: attachmentAttributes, required: false },
  { model: SupportMessage, as: 'messages', required: false, separate: true, order: [['createdAt', 'ASC']], include: [
    { model: User, as: 'author', attributes: userAttributes },
    { model: SupportAttachment, as: 'attachments', attributes: attachmentAttributes, required: false },
  ] },
];

function serializeTicket(ticket) {
  const output = ticket.toJSON();
  output.attachments = (output.attachments || []).map(publicAttachment);
  output.messages = (output.messages || []).map((message) => ({ ...message, attachments: (message.attachments || []).map(publicAttachment) }));
  return output;
}

exports.listTickets = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const where = {};
    if (req.query.status && STATUSES.includes(req.query.status)) where.status = req.query.status;
    if (req.query.category && CATEGORIES.includes(req.query.category)) where.category = req.query.category;
    if (req.query.priority && PRIORITIES.includes(req.query.priority)) where.priority = req.query.priority;
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const search = `%${req.query.search.trim().slice(0, 100)}%`;
      where[Op.or] = [{ reference: { [Op.like]: search } }, { subject: { [Op.like]: search } }];
    }
    const [result, statusGroups] = await Promise.all([
      SupportTicket.findAndCountAll({ where, include: [{ model: Restaurant, as: 'restaurant', attributes: ['id', 'name'], required: false }, { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'], required: true }], limit: pageSize, offset: (page - 1) * pageSize, order: [['updatedAt', 'DESC']] }),
      SupportTicket.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']], group: ['status'], raw: true }),
    ]);
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const item of statusGroups) counts[item.status] = Number(item.count);
    res.json({ success: true, tickets: result.rows, summary: { total: Object.values(counts).reduce((sum, value) => sum + value, 0), open: counts.open, inProgress: counts.in_progress, waiting: counts.waiting_for_restaurant, resolved: counts.resolved, closed: counts.closed }, pagination: { page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) } });
  } catch (error) { next(error); }
};

exports.ticketDetails = async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findByPk(req.params.ticketId, { include: ticketIncludes });
    if (!ticket) throw fail(404, 'Support ticket not found.');
    const history = await AuditLog.findAll({ where: { entityType: 'support_ticket', entityId: ticket.id }, include: [{ model: User, as: 'actor', attributes: userAttributes, required: false }], order: [['createdAt', 'ASC']], limit: 100 });
    res.json({ success: true, ticket: { ...serializeTicket(ticket), history } });
  } catch (error) { next(error); }
};

exports.agents = async (req, res, next) => {
  try {
    const users = await User.findAll({ attributes: userAttributes, include: [{ association: 'roles', where: { code: 'super_admin' }, attributes: [], through: { attributes: [] }, required: true }], order: [['firstName', 'ASC'], ['lastName', 'ASC']] });
    res.json({ success: true, agents: users });
  } catch (error) { next(error); }
};

exports.reply = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (body.length < 1 || body.length > 6000) throw fail(400, 'Reply must be between 1 and 6,000 characters.');
    const attachments = validateAttachments(req.body?.attachments);
    const ticket = await SupportTicket.findByPk(req.params.ticketId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!ticket) throw fail(404, 'Support ticket not found.');
    if (ticket.status === 'closed') throw fail(409, 'This ticket is closed.');
    const message = await SupportMessage.create({ ticketId: ticket.id, authorUserId: req.user.id, authorType: 'admin', body }, { transaction });
    for (const attachment of attachments) await SupportAttachment.create({ ...attachment, ticketId: ticket.id, messageId: message.id, uploadedByUserId: req.user.id }, { transaction });
    await ticket.update({ lastReplyAt: new Date() }, { transaction });
    await recordAuditEvent(req, { action: 'support.ticket.admin_replied', entityType: 'support_ticket', entityId: ticket.id, afterData: { messageId: message.id } }, { transaction });
    await transaction.commit();
    if (ticket.restaurantId) notifyRestaurant(req, ticket.restaurantId, { type: 'reply', ticketId: ticket.id, reference: ticket.reference, title: 'Support replied', message: `There is a new reply on ${ticket.reference}.`, status: ticket.status });
    else await createCustomerNotification({ app: req.app, customerId: ticket.createdByUserId, category: 'support', title: 'Support replied', message: `There is a new reply on ${ticket.reference}.`, href: '/customer/support', entityId: ticket.id, dedupeKey: `support-reply:${message.id}` });
    res.status(201).json({ success: true, message: { id: message.id, body: message.body, authorType: 'admin', createdAt: message.createdAt } });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); next(error); }
};

exports.updateTicket = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const input = req.body || {};
    const allowed = ['status', 'priority', 'assignedAdminUserId'];
    const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
    if (unknown.length) throw fail(400, `Unsupported ticket field: ${unknown[0]}.`);
    const ticket = await SupportTicket.findByPk(req.params.ticketId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!ticket) throw fail(404, 'Support ticket not found.');
    const beforeData = { status: ticket.status, priority: ticket.priority, assignedAdminUserId: ticket.assignedAdminUserId };
    const updates = {};
    if (input.status !== undefined) { if (!STATUSES.includes(input.status)) throw fail(400, 'Choose a valid ticket status.'); updates.status = input.status; }
    if (input.priority !== undefined) { if (!PRIORITIES.includes(input.priority)) throw fail(400, 'Choose a valid priority.'); updates.priority = input.priority; }
    if (input.assignedAdminUserId !== undefined) {
      if (input.assignedAdminUserId === null || input.assignedAdminUserId === '') updates.assignedAdminUserId = null;
      else {
        const agent = await User.findByPk(input.assignedAdminUserId, { include: [{ association: 'roles', where: { code: 'super_admin' }, attributes: ['id'], through: { attributes: [] }, required: true }], transaction });
        if (!agent) throw fail(400, 'Choose an active Super Admin support agent.');
        updates.assignedAdminUserId = agent.id;
      }
    }
    if (!Object.keys(updates).length) throw fail(400, 'Provide a ticket field to update.');
    await ticket.update(updates, { transaction });
    await recordAuditEvent(req, { action: 'support.ticket.updated', entityType: 'support_ticket', entityId: ticket.id, beforeData, afterData: updates }, { transaction });
    await transaction.commit();
    if (updates.status !== undefined) {
      const event = { type: updates.status === 'resolved' ? 'resolved' : updates.status === 'waiting_for_restaurant' ? 'more_information' : 'status', ticketId: ticket.id, reference: ticket.reference, title: updates.status === 'resolved' ? 'Support ticket resolved' : updates.status === 'waiting_for_restaurant' ? 'Support needs more information' : 'Support ticket status changed', message: `${ticket.reference} is now ${updates.status.replaceAll('_', ' ')}.`, status: updates.status };
      if (ticket.restaurantId) notifyRestaurant(req, ticket.restaurantId, event);
      else await createCustomerNotification({ app: req.app, customerId: ticket.createdByUserId, category: 'support', title: event.title, message: event.message, href: '/customer/support', entityId: ticket.id, dedupeKey: `support-status:${ticket.id}:${updates.status}` });
    }
    res.json({ success: true, ticket: { id: ticket.id, reference: ticket.reference, status: ticket.status, priority: ticket.priority, assignedAdminUserId: ticket.assignedAdminUserId } });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); next(error); }
};

exports.downloadAttachment = async (req, res, next) => {
  try {
    const attachment = await SupportAttachment.findByPk(req.params.attachmentId);
    if (!attachment) throw fail(404, 'Attachment not found.');
    res.set({ 'Content-Type': attachment.contentType, 'Content-Length': String(attachment.sizeBytes), 'Content-Disposition': `attachment; filename="${attachment.fileName.replace(/["\\\r\n]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.send(attachment.fileData);
  } catch (error) { next(error); }
};
