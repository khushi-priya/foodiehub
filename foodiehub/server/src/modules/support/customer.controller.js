'use strict';

const crypto = require('node:crypto');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const { SupportTicket, SupportMessage, SupportAttachment, Order, User } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');
const { notifySuperAdmins } = require('../../services/admin-notifications');
const { STATUSES, validateAttachments, publicAttachment } = require('./support.shared');
const CUSTOMER_CATEGORIES = ['Account & Login', 'Orders', 'Payments & Refunds', 'Technical Issues', 'Other'];

const fail = (status, message) => Object.assign(new Error(message), { status });
const attachmentAttributes = ['id', 'messageId', 'uploadedByUserId', 'fileName', 'contentType', 'sizeBytes', 'createdAt'];
const includes = [
  { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'email'] },
  { model: SupportAttachment, as: 'attachments', attributes: attachmentAttributes, required: false },
  { model: SupportMessage, as: 'messages', required: false, separate: true, order: [['createdAt', 'ASC']], include: [
    { model: User, as: 'author', attributes: ['id', 'firstName', 'lastName', 'email'] },
    { model: SupportAttachment, as: 'attachments', attributes: attachmentAttributes, required: false },
  ] },
];

function serialize(ticket) {
  const output = ticket.toJSON();
  output.attachments = (output.attachments || []).map(publicAttachment);
  output.messages = (output.messages || []).map((message) => ({
    ...message,
    attachments: (message.attachments || []).map(publicAttachment),
  }));
  return output;
}

function validateContent({ subject, category, description }) {
  if (typeof subject !== 'string' || subject.trim().length < 4 || subject.trim().length > 180) throw fail(400, 'Subject must be between 4 and 180 characters.');
  if (!CUSTOMER_CATEGORIES.includes(category)) throw fail(400, 'Choose a valid support category.');
  if (typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 10000) throw fail(400, 'Description must be between 10 and 10,000 characters.');
}

async function ownedTicket(customerId, ticketId, options = {}) {
  const ticket = await SupportTicket.findOne({ where: { id: ticketId, createdByUserId: customerId, restaurantId: null }, ...options });
  if (!ticket) throw fail(404, 'Support ticket not found.');
  return ticket;
}

function newReference() {
  return `FHC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

exports.options = (req, res) => res.json({ success: true, categories: CUSTOMER_CATEGORIES, statuses: STATUSES });

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 10));
    const where = { restaurantId: null, createdByUserId: req.customer.id };
    if (req.query.status) {
      if (!STATUSES.includes(req.query.status)) throw fail(400, 'Choose a valid support status.');
      where.status = req.query.status;
    }
    const result = await SupportTicket.findAndCountAll({ where, limit: pageSize, offset: (page - 1) * pageSize, order: [['updatedAt', 'DESC']] });
    res.json({ success: true, tickets: result.rows, pagination: { page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) } });
  } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { subject, category, description, relatedOrderId = null } = req.body || {};
    validateContent({ subject, category, description });
    if (relatedOrderId != null && (typeof relatedOrderId !== 'string' || !await Order.findOne({ where: { id: relatedOrderId, customerId: req.customer.id }, transaction }))) throw fail(400, 'Choose an order from your own order history.');
    const attachments = validateAttachments(req.body?.attachments);
    const ticket = await SupportTicket.create({
      reference: newReference(), restaurantId: null, createdByUserId: req.customer.id,
      relatedOrderId, subject: subject.trim(), category, description: description.trim(),
      priority: 'normal', status: 'open',
    }, { transaction });
    for (const attachment of attachments) await SupportAttachment.create({ ...attachment, ticketId: ticket.id, uploadedByUserId: req.customer.id }, { transaction });
    await recordAuditEvent(req, { action: 'support.customer_ticket.created', entityType: 'support_ticket', entityId: ticket.id, afterData: { reference: ticket.reference, category, status: ticket.status } }, { transaction });
    await transaction.commit();
    notifySuperAdmins(req, { type: 'support_ticket_created', title: 'New customer support ticket', message: `${ticket.reference}: ${ticket.subject}`, entityId: ticket.id, href: `/admin/support?ticketId=${ticket.id}` });
    res.status(201).json({ success: true, ticket: { id: ticket.id, reference: ticket.reference, subject: ticket.subject, category: ticket.category, priority: ticket.priority, status: ticket.status, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt } });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') return exports.create(req, res, next);
    next(error);
  }
};

exports.details = async (req, res, next) => {
  try {
    const ticket = await ownedTicket(req.customer.id, req.params.ticketId, { include: includes });
    res.json({ success: true, ticket: serialize(ticket) });
  } catch (error) { next(error); }
};

exports.reply = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body || body.length > 6000) throw fail(400, 'Reply must be between 1 and 6,000 characters.');
    const attachments = validateAttachments(req.body?.attachments);
    const ticket = await ownedTicket(req.customer.id, req.params.ticketId, { transaction, lock: transaction.LOCK.UPDATE });
    if (ticket.status === 'closed') throw fail(409, 'This ticket is closed.');
    const message = await SupportMessage.create({ ticketId: ticket.id, authorUserId: req.customer.id, authorType: 'customer', body }, { transaction });
    for (const attachment of attachments) await SupportAttachment.create({ ...attachment, ticketId: ticket.id, messageId: message.id, uploadedByUserId: req.customer.id }, { transaction });
    await ticket.update({ lastReplyAt: new Date(), ...(ticket.status === 'resolved' || ticket.status === 'waiting_for_restaurant' ? { status: 'in_progress' } : {}) }, { transaction });
    await recordAuditEvent(req, { action: 'support.customer_ticket.replied', entityType: 'support_ticket', entityId: ticket.id, afterData: { messageId: message.id } }, { transaction });
    await transaction.commit();
    notifySuperAdmins(req, { type: 'support_customer_reply', title: 'Customer replied to support', message: `${ticket.reference}: ${ticket.subject}`, entityId: ticket.id, href: `/admin/support?ticketId=${ticket.id}` });
    res.status(201).json({ success: true, message: { id: message.id, body: message.body, authorType: 'customer', createdAt: message.createdAt } });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); next(error); }
};

exports.downloadAttachment = async (req, res, next) => {
  try {
    const attachment = await SupportAttachment.findOne({ where: { id: req.params.attachmentId }, include: [{ model: SupportTicket, as: 'ticket', where: { createdByUserId: req.customer.id, restaurantId: null }, required: true }] });
    if (!attachment) throw fail(404, 'Attachment not found.');
    res.set({ 'Content-Type': attachment.contentType, 'Content-Length': String(attachment.sizeBytes), 'Content-Disposition': `attachment; filename="${attachment.fileName.replace(/["\\\r\n]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.send(attachment.fileData);
  } catch (error) { next(error); }
};
