
const { User } = require('../models');

const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const user = await User.findByPk(req.session.userId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'status'],
      include: [
        {
          association: 'roles',
          attributes: ['id', 'name', 'code', 'scope'],
          through: { attributes: [] },
        },
      ],
    });

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Your account is not active.',
      });
    }

    const isSuperAdmin = user.roles?.some(
      (role) => role.code === 'super_admin'
    );

    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Super Admin access required.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requireSuperAdmin;
