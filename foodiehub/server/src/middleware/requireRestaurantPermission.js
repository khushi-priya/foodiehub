const { User, RestaurantMember, EmployeeBranchAssignment, Role, Permission, Restaurant } = require('../models');
const { Op } = require('sequelize');

function requireRestaurantPermission(permissionCode) {
  const permissionCodes = Array.isArray(permissionCode) ? permissionCode : [permissionCode];
  if (!permissionCodes.length || permissionCodes.some((code) => typeof code !== 'string' || !code.trim())) {
    throw new TypeError('A restaurant permission code is required.');
  }

  return async function restaurantPermissionMiddleware(req, res, next) {
    try {
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ success: false, message: 'Please log in to continue.' });

      const user = await User.findByPk(userId, { attributes: ['id', 'status'] });
      if (!user || user.status !== 'active') {
        return res.status(401).json({ success: false, message: 'Your session is invalid. Please log in again.' });
      }

      const memberships = await RestaurantMember.findAll({
        where: { userId, status: 'active' },
        include: [
          {
            model: Role,
            as: 'role',
            where: { scope: 'restaurant' },
            attributes: ['id', 'code', 'scope', 'restaurantId'],
            required: true,
            include: [{
              model: Permission,
              as: 'permissions',
              where: { code: { [Op.in]: permissionCodes } },
              attributes: ['id', 'code'],
              through: { attributes: [] },
              required: true,
            }],
          },
          {
            model: Restaurant,
            as: 'restaurant',
            attributes: ['id', 'name', 'approvalStatus', 'listingStatus'],
            required: true,
          },
          {
            model: EmployeeBranchAssignment,
            as: 'branchAssignments',
            where: { status: 'active' },
            attributes: ['branchId'],
            required: false,
          },
        ],
      });

      if (!memberships.length) {
        return res.status(403).json({ success: false, message: 'You do not have permission to perform this restaurant action.' });
      }

      const requestedRestaurantId = req.params.restaurantId || req.query.restaurantId || req.body?.restaurantId;
      let membership;
      if (requestedRestaurantId) {
        membership = memberships.find((entry) => entry.restaurantId === requestedRestaurantId);
      } else if (memberships.length === 1) {
        [membership] = memberships;
      } else {
        const owners = memberships.filter((entry) => entry.role.code === 'restaurant_owner');
        if (owners.length === 1) [membership] = owners;
        else return res.status(400).json({ success: false, message: 'Please specify a restaurant you are authorized to access.' });
      }

      if (!membership) {
        return res.status(403).json({ success: false, message: 'You do not have access to this restaurant.' });
      }
      if (membership.role.restaurantId && membership.role.restaurantId !== membership.restaurantId) {
        return res.status(403).json({ success: false, message: 'This restaurant role is not available to your membership.' });
      }

      const branchIds = membership.role.code === 'restaurant_owner'
        ? null
        : [...new Set((membership.branchAssignments || []).map((assignment) => assignment.branchId))];
      const requestedBranchId = req.params.branchId || req.query.branchId || req.body?.branchId;
      if (branchIds && requestedBranchId && !branchIds.includes(requestedBranchId)) {
        return res.status(403).json({ success: false, message: 'You do not have access to this branch.' });
      }

      req.authUser = user;
      req.restaurantMembership = membership;
      req.restaurantRole = membership.role.code;
      req.restaurantGrantedPermissions = (membership.role.permissions || []).map((permission) => permission.code);
      req.restaurant = membership.restaurant;
      req.restaurantBranchIds = branchIds;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { requireRestaurantPermission };
