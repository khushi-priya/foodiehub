const {
  User,
  RestaurantMember,
  Role,
  Restaurant,
} = require('../../models');

exports.requireRestaurantOwner = async (req, res, next) => {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to continue.',
      });
    }

    const user = await User.findByPk(userId, {
      attributes: ['id', 'status'],
    });

    if (!user || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Your session is invalid. Please log in again.',
      });
    }

    const memberships = await RestaurantMember.findAll({
      where: {
        userId,
        status: 'active',
      },
      include: [
        {
          model: Role,
          as: 'role',
          where: {
            code: 'restaurant_owner',
            scope: 'restaurant',
          },
          attributes: ['id', 'code', 'scope'],
          required: true,
        },
        {
          model: Restaurant,
          as: 'restaurant',
          attributes: [
            'id',
            'name',
            'approvalStatus',
            'listingStatus',
          ],
          required: true,
        },
      ],
    });

    if (!memberships.length) {
      return res.status(403).json({
        success: false,
        message: 'You do not have restaurant-owner access.',
      });
    }

    const requestedRestaurantId =
      req.params.restaurantId ||
      req.query.restaurantId ||
      req.body?.restaurantId;

    let membership;

    if (requestedRestaurantId) {
      membership = memberships.find(
        (item) => item.restaurantId === requestedRestaurantId
      );

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this restaurant.',
        });
      }
    } else {
      if (memberships.length > 1) {
        return res.status(400).json({
          success: false,
          message:
            'Please provide a restaurantId because your account has access to multiple restaurants.',
        });
      }

      membership = memberships[0];
    }

    req.authUser = user;
    req.restaurantMembership = membership;
    req.restaurant = membership.restaurant;

    next();
  } catch (error) {
    next(error);
  }
};