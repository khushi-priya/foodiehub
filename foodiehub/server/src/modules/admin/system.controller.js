const { Op } = require('sequelize');
const { PlatformSetting, AuditLog, User } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const send = (res, data) => res.status(200).json({ success: true, data });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const settingKeys = ['platformName', 'platformLogo', 'contactEmail', 'contactPhone', 'supportInfo', 'defaultCurrency', 'timezone', 'taxEnabled', 'taxRate', 'platformAvailable'];

function normalizeSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'Settings must be sent as an object.');
  const unknown = Object.keys(input).filter((key) => !settingKeys.includes(key));
  if (unknown.length) throw fail(400, `Unsupported setting: ${unknown[0]}.`);
  const value = {};
  for (const [key, raw] of Object.entries(input)) {
    if (['platformName', 'contactEmail', 'contactPhone', 'supportInfo', 'defaultCurrency', 'timezone', 'platformLogo'].includes(key)) {
      if (typeof raw !== 'string') throw fail(400, `${key} must be text.`);
      const max = { platformName: 120, contactEmail: 254, contactPhone: 30, supportInfo: 2000, defaultCurrency: 3, timezone: 100, platformLogo: 1000 }[key];
      const text = raw.trim(); if (text.length > max) throw fail(400, `${key} must be ${max} characters or fewer.`);
      if (key === 'platformName' && !text) throw fail(400, 'Platform name cannot be empty.');
      if (key === 'contactEmail' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw fail(400, 'Contact email is invalid.');
      if (key === 'defaultCurrency' && !/^[A-Z]{3}$/.test(text.toUpperCase())) throw fail(400, 'Currency must be a three-letter code.');
      if (key === 'timezone') { try { new Intl.DateTimeFormat('en', { timeZone: text }); } catch { throw fail(400, 'Timezone must be a valid IANA timezone.'); } }
      if (key === 'platformLogo' && text && !(/^(https?:\/\/|\/)/i.test(text))) throw fail(400, 'Logo must be an HTTP(S) URL or an application-relative path.');
      value[key] = key === 'defaultCurrency' ? text.toUpperCase() : text;
    } else if (['taxEnabled', 'platformAvailable'].includes(key)) {
      if (typeof raw !== 'boolean') throw fail(400, `${key} must be true or false.`);
      value[key] = raw;
    } else if (key === 'taxRate') {
      const rate = Number(raw); if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw fail(400, 'Tax rate must be between 0 and 100 percent.');
      value[key] = rate;
    }
  }
  if (!Object.keys(value).length) throw fail(400, 'Provide at least one setting to update.');
  return value;
}

exports.getSettings = wrap(async (_req, res) => {
  const rows = await PlatformSetting.findAll({ where: { key: { [Op.in]: settingKeys } }, order: [['key', 'ASC']] });
  const settings = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
  send(res, { settings, taxAffectsCheckout: false });
});

exports.updateSettings = wrap(async (req, res) => {
  const values = normalizeSettings(req.body?.settings);
  const result = await PlatformSetting.sequelize.transaction(async (transaction) => {
    const beforeRows = await PlatformSetting.findAll({ where: { key: { [Op.in]: Object.keys(values) } }, transaction, lock: transaction.LOCK.UPDATE });
    const before = Object.fromEntries(beforeRows.map((row) => [row.key, JSON.parse(row.value)]));
    for (const [key, value] of Object.entries(values)) {
      const [row] = await PlatformSetting.findOrCreate({ where: { key }, defaults: { value: JSON.stringify(value), updatedBy: req.user.id }, transaction });
      if (beforeRows.some((existing) => existing.key === key)) await row.update({ value: JSON.stringify(value), updatedBy: req.user.id }, { transaction });
    }
    await recordAuditEvent(req, { action: 'platform_settings.updated', entityType: 'platform_settings', entityId: 'platform', beforeData: before, afterData: values }, { transaction });
    return Object.fromEntries(Object.entries(values));
  });
  send(res, { settings: result, taxAffectsCheckout: false });
});

exports.auditLogs = wrap(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1); const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const where = {};
  if (req.query.action) where.action = { [Op.like]: `%${String(req.query.action).trim().slice(0, 120)}%` };
  if (req.query.entityType) where.entityType = { [Op.like]: `%${String(req.query.entityType).trim().slice(0, 80)}%` };
  if (req.query.actorUserId) { if (!UUID.test(req.query.actorUserId)) throw fail(400, 'Actor filter is invalid.'); where.actorUserId = req.query.actorUserId; }
  if (req.query.from || req.query.to) {
    const from = req.query.from ? new Date(req.query.from) : null; const to = req.query.to ? new Date(req.query.to) : null;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) || (from && to && from > to)) throw fail(400, 'Audit date range is invalid.');
    where.createdAt = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
  }
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
  if (search) {
    const actors = await User.findAll({ where: { [Op.or]: [{ firstName: { [Op.like]: `%${search}%` } }, { lastName: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } }] }, attributes: ['id'], raw: true });
    where[Op.and] = [{ [Op.or]: [{ action: { [Op.like]: `%${search}%` } }, { entityType: { [Op.like]: `%${search}%` } }, { entityId: { [Op.like]: `%${search}%` } }, ...(actors.length ? [{ actorUserId: { [Op.in]: actors.map((actor) => actor.id) } }] : [])] }];
  }
  const result = await AuditLog.findAndCountAll({ where, include: [{ model: User, as: 'actor', attributes: ['id', 'firstName', 'lastName', 'email'], required: false }], order: [['createdAt', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize, distinct: true });
  send(res, { items: result.rows, pagination: { total: result.count, page, pageSize, totalPages: Math.ceil(result.count / pageSize) } });
});

