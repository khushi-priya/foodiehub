const { User, Role } = require('../../models');

exports.requireCustomer = async (req, res, next) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Please sign in to continue.' });
    const customer = await User.findByPk(userId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'status'],
      include: [{ model: Role, as: 'roles', where: { code: 'customer', scope: 'platform' }, attributes: ['id', 'code'], through: { attributes: [] }, required: true }],
    });
    if (!customer || customer.status !== 'active') return res.status(403).json({ success: false, message: 'Customer access is required.' });
    req.customer = customer;
    next();
  } catch (error) { next(error); }
};
