const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const { Restaurant, Branch, User } = require('../../models');
const { recordAuditEvent } = require('../../services/audit-log');
const { changePassword: changeUserPassword } = require('../../services/password-change');

const fail = (status, message) => Object.assign(new Error(message), { status });

exports.getSettings = async (req, res, next) => {
  try {
    const [restaurant, branches, account] = await Promise.all([
      Restaurant.findByPk(req.restaurant.id, { attributes: ['id', 'name', 'email', 'phone', 'description', 'logo', 'acceptingOrders'] }),
      Branch.findAll({
        where: { restaurantId: req.restaurant.id, ...(req.restaurantBranchIds !== null ? { id: { [Op.in]: req.restaurantBranchIds || [] } } : {}) },
        attributes: ['id', 'name', 'email', 'phone', 'addressLine', 'addressLine2', 'city', 'state', 'postalCode', 'country', 'openingTime', 'closingTime', 'workingDays', 'closedDays', 'overnight', 'timeZone', 'deliveryEnabled', 'cashOnDeliveryEnabled', 'razorpayEnabled', 'isActive'],
        order: [['name', 'ASC']],
      }),
      User.findByPk(req.authUser.id, { attributes: ['id', 'email', 'lastLoginAt'] }),
    ]);
    if (!restaurant) throw fail(404, 'Restaurant not found.');
    const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    const mapConfigured = Boolean(process.env.MAP_GEOCODER_BASE_URL?.trim());
    res.json({
      success: true,
      restaurant,
      branches,
      integrations: {
        razorpay: { status: razorpayConfigured ? 'configured' : 'not_configured', enabledBranches: branches.filter((branch) => branch.razorpayEnabled).length },
        email: { status: 'not_configured', note: 'No restaurant email delivery provider is implemented.' },
        sms: { status: 'unavailable', note: 'SMS delivery is not implemented.' },
        whatsapp: { status: 'unavailable', note: 'WhatsApp delivery is not implemented.' },
        maps: { status: mapConfigured ? 'configured' : 'configuration_required', addressSearchReady: mapConfigured },
      },
      capabilities: {
        notifications: { status: 'unavailable', note: 'Restaurant notification preferences and channels are not implemented.' },
        tax: { status: 'configuration_required', calculationEnabled: false },
        invoice: { status: 'unavailable', numberingEnabled: false },
        currency: { code: 'INR', editable: false },
        language: { status: 'unavailable' },
        sessions: { otherSessionLogout: false },
      },
      security: { sessionStatus: 'active', sessionExpiresAt: req.session?.cookie?.expires || null, lastLoginAt: account?.lastLoginAt || null, accountEmail: account?.email || null },
    });
  } catch (error) { next(error); }
};

exports.changePassword = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const user = await User.findByPk(req.authUser.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user || user.status !== 'active') throw fail(401, 'Your account is not active.');
    const beforeData = await changeUserPassword(user, req.body, { transaction });
    await recordAuditEvent(req, { action: 'restaurant.account.password_changed', entityType: 'user_account', entityId: user.id, beforeData, afterData: { passwordUpdated: true } }, { transaction });
    await transaction.commit();
    res.json({ success: true, updated: true, message: 'Password changed.' });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); next(error); }
};
