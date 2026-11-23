
const {
  Restaurant,
  Branch,
  User,
  Role,
  RestaurantMember,
} = require('../../models');

const { Op } = require('sequelize');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { recordAuditEvent } = require('../../services/audit-log');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const restaurantSnapshot = (restaurant) => ({
  id: restaurant.id,
  name: restaurant.name,
  approvalStatus: restaurant.approvalStatus,
  listingStatus: restaurant.listingStatus,
  marketplaceEnabled: restaurant.marketplaceEnabled,
  rejectionReason: restaurant.rejectionReason,
});

async function mutateRestaurantWithAudit(req, id, action, mutate, reason = null) {
  return Restaurant.sequelize.transaction(async (transaction) => {
    const restaurant = await Restaurant.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!restaurant) throw httpError(404, 'Restaurant not found.');
    const beforeData = restaurantSnapshot(restaurant);
    await mutate(restaurant, transaction);
    await recordAuditEvent(req, { action, entityType: 'restaurant', entityId: restaurant.id, reason, beforeData, afterData: restaurantSnapshot(restaurant) }, { transaction });
    return restaurant;
  });
}

const VALID_APPROVAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'suspended',
];

const PHONE_REGEX = /^[6-9]\d{9}$/;

// Generate a URL-friendly restaurant slug.
const generateSlug = (value) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Find an unused slug.
const getUniqueSlug = async (name, transaction) => {
  const baseSlug = generateSlug(name);

  let slug = baseSlug;
  let counter = 1;

  while (
    await Restaurant.findOne({
      where: { slug },
      transaction,
    })
  ) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

// CREATE RESTAURANT
exports.createRestaurant = async (req, res, next) => {
  const transaction = await Restaurant.sequelize.transaction();

  try {
    const {
      restaurantName,
      restaurantEmail,
      restaurantPhone,
      description,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      ownerPhone,
    } = req.body || {};

    // Required field validation.
    const requiredFields = {
      restaurantName,
      restaurantEmail,
      restaurantPhone,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (typeof value !== 'string' || !value.trim()) {
        await transaction.rollback();

        return res.status(400).json({
          success: false,
          message: `${field} is required.`,
        });
      }
    }

    // Normalize phone numbers.
    const normalizedRestaurantPhone = restaurantPhone.trim();

    const normalizedOwnerPhone =
      typeof ownerPhone === 'string' && ownerPhone.trim()
        ? ownerPhone.trim()
        : null;

    // Validate Indian mobile numbers.
    if (!PHONE_REGEX.test(normalizedRestaurantPhone)) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message:
          'Enter a valid 10-digit restaurant mobile number starting with 6, 7, 8 or 9.',
      });
    }

    if (
      normalizedOwnerPhone &&
      !PHONE_REGEX.test(normalizedOwnerPhone)
    ) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message:
          'Enter a valid 10-digit owner mobile number starting with 6, 7, 8 or 9.',
      });
    }

    // Basic email validation.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailRegex.test(restaurantEmail.trim()) ||
      !emailRegex.test(ownerEmail.trim())
    ) {
      await transaction.rollback();

      return res.status(400).json({
        success: false,
        message: 'Please provide valid email addresses.',
      });
    }

    const normalizedRestaurantEmail =
      restaurantEmail.trim().toLowerCase();

    const normalizedOwnerEmail =
      ownerEmail.trim().toLowerCase();

    // Check whether the owner email is already registered.
    const existingOwner = await User.findOne({
      where: {
        email: normalizedOwnerEmail,
      },
      transaction,
    });

    if (existingOwner) {
      await transaction.rollback();

      return res.status(409).json({
        success: false,
        message: 'An account with this owner email already exists.',
      });
    }

    // Check owner phone only when supplied.
    if (normalizedOwnerPhone) {
      const existingPhone = await User.findOne({
        where: {
          phone: normalizedOwnerPhone,
        },
        transaction,
      });

      if (existingPhone) {
        await transaction.rollback();

        return res.status(409).json({
          success: false,
          message: 'This owner phone number is already registered.',
        });
      }
    }

    // Check for an existing restaurant email.
    const existingRestaurant = await Restaurant.findOne({
      where: {
        email: normalizedRestaurantEmail,
      },
      transaction,
    });

    if (existingRestaurant) {
      await transaction.rollback();

      return res.status(409).json({
        success: false,
        message: 'A restaurant with this email already exists.',
      });
    }

    // Find the restaurant owner role.
    const ownerRole = await Role.findOne({
      where: {
        code: 'restaurant_owner',
        scope: 'restaurant',
      },
      transaction,
    });

    if (!ownerRole) {
      await transaction.rollback();

      return res.status(500).json({
        success: false,
        message: 'Restaurant owner role has not been configured.',
      });
    }

    // Generate a random, undisclosed password hash.
    const temporarySecret = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(temporarySecret, 12);

    const slug = await getUniqueSlug(
      restaurantName.trim(),
      transaction
    );

    // Create restaurant.
    const restaurant = await Restaurant.create(
      {
        name: restaurantName.trim(),
        slug,
        email: normalizedRestaurantEmail,
        phone: normalizedRestaurantPhone,
        description:
          typeof description === 'string'
            ? description.trim() || null
            : null,

        approvalStatus: 'pending',
        listingStatus: 'draft',
        marketplaceEnabled: false,
        rejectionReason: null,
      },
      { transaction }
    );

    // Create pending owner account.
    const owner = await User.create(
      {
        firstName: ownerFirstName.trim(),
        lastName: ownerLastName.trim(),
        email: normalizedOwnerEmail,
        phone: normalizedOwnerPhone,
        passwordHash,
        status: 'pending',
      },
      { transaction }
    );

    // Connect owner to restaurant.
    await RestaurantMember.create(
      {
        restaurantId: restaurant.id,
        userId: owner.id,
        roleId: ownerRole.id,
        status: 'invited',
        joinedAt: null,
      },
      { transaction }
    );

    await recordAuditEvent(req, {
      action: 'restaurant.created',
      entityType: 'restaurant',
      entityId: restaurant.id,
      afterData: restaurantSnapshot(restaurant),
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message:
        'Restaurant registered successfully. It is awaiting approval and owner account setup.',
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          email: restaurant.email,
          phone: restaurant.phone,
          approvalStatus: restaurant.approvalStatus,
          listingStatus: restaurant.listingStatus,
          marketplaceEnabled: restaurant.marketplaceEnabled,
        },
        owner: {
          id: owner.id,
          firstName: owner.firstName,
          lastName: owner.lastName,
          email: owner.email,
          status: owner.status,
          membershipStatus: 'invited',
        },
      },
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message:
          'A restaurant or owner with these details already exists.',
      });
    }

    next(error);
  }
};

// GET ALL RESTAURANTS
exports.getRestaurants = async (req, res, next) => {
  try {
    const {
      search = '',
      approvalStatus,
      listingStatus,
      page = 1,
      limit = 10,
    } = req.query;

    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(parseInt(limit, 10) || 10, 1),
      100
    );

    const where = {};

    if (search.trim()) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search.trim()}%` } },
        { email: { [Op.like]: `%${search.trim()}%` } },
        { phone: { [Op.like]: `%${search.trim()}%` } },
        { slug: { [Op.like]: `%${search.trim()}%` } },
      ];
    }

    if (approvalStatus) {
      if (!VALID_APPROVAL_STATUSES.includes(approvalStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid approval status.',
        });
      }

      where.approvalStatus = approvalStatus;
    }

    if (listingStatus) {
      if (!['draft', 'published', 'unlisted'].includes(listingStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid listing status.',
        });
      }

      where.listingStatus = listingStatus;
    }

    const { count, rows } = await Restaurant.findAndCountAll({
      where,
      attributes: [
        'id',
        'name',
        'slug',
        'email',
        'phone',
        'description',
        'logo',
        'approvalStatus',
        'listingStatus',
        'marketplaceEnabled',
        'rejectionReason',
        'createdAt',
        'updatedAt',
      ],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset: (currentPage - 1) * pageSize,
    });

    return res.status(200).json({
      success: true,
      message: 'Restaurants fetched successfully.',
      data: rows,
      pagination: {
        total: count,
        page: currentPage,
        limit: pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET RESTAURANT BY ID
exports.getRestaurantById = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findByPk(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: restaurant,
    });
  } catch (error) {
    next(error);
  }
};

// APPROVE RESTAURANT
exports.approveRestaurant = async (req, res, next) => {
  try {
    const restaurant = await mutateRestaurantWithAudit(req, req.params.id, 'restaurant.approved', async (current, transaction) => {
      if (!['pending', 'rejected'].includes(current.approvalStatus)) throw httpError(400, 'Only pending or rejected restaurants can be approved.');
      await current.update({ approvalStatus: 'approved', rejectionReason: null }, { transaction });
    });

    return res.status(200).json({
      success: true,
      message: 'Restaurant approved successfully.',
      data: restaurant,
    });
  } catch (error) {
    next(error);
  }
};

// REJECT RESTAURANT
exports.rejectRestaurant = async (req, res, next) => {
  try {
    const { reason } = req.body || {};

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a rejection reason.',
      });
    }

    const restaurant = await mutateRestaurantWithAudit(req, req.params.id, 'restaurant.rejected', async (current, transaction) => {
      if (current.approvalStatus !== 'pending') throw httpError(400, 'Only pending restaurants can be rejected.');
      await current.update({ approvalStatus: 'rejected', rejectionReason: reason.trim() }, { transaction });
    }, reason.trim());

    return res.status(200).json({
      success: true,
      message: 'Restaurant rejected successfully.',
      data: restaurant,
    });
  } catch (error) {
    next(error);
  }
};

// SUSPEND RESTAURANT
exports.suspendRestaurant = async (req, res, next) => {
  try {
    const restaurant = await mutateRestaurantWithAudit(req, req.params.id, 'restaurant.suspended', async (current, transaction) => {
      if (current.approvalStatus !== 'approved') throw httpError(400, 'Only approved restaurants can be suspended.');
      await current.update({ approvalStatus: 'suspended' }, { transaction });
    });

    return res.status(200).json({
      success: true,
      message: 'Restaurant suspended successfully.',
      data: restaurant,
    });
  } catch (error) {
    next(error);
  }
};

// REACTIVATE RESTAURANT
exports.reactivateRestaurant = async (req, res, next) => {
  try {
    const restaurant = await mutateRestaurantWithAudit(req, req.params.id, 'restaurant.reactivated', async (current, transaction) => {
      if (current.approvalStatus !== 'suspended') throw httpError(400, 'Only suspended restaurants can be reactivated.');
      await current.update({ approvalStatus: 'approved' }, { transaction });
    });

    return res.status(200).json({
      success: true,
      message: 'Restaurant reactivated successfully.',
      data: restaurant,
    });
  } catch (error) {
    next(error);
  }
};

// Publish or unpublish an approved restaurant in the customer marketplace.
exports.setRestaurantListing = async (req, res, next) => {
  try {
    const { listingStatus } = req.body || {};
    if (!['published', 'unlisted'].includes(listingStatus)) {
      return res.status(400).json({ success: false, message: 'listingStatus must be published or unlisted.' });
    }
    const restaurant = await mutateRestaurantWithAudit(req, req.params.id, `restaurant.listing_${listingStatus}`, async (current, transaction) => {
      if (current.approvalStatus !== 'approved') throw httpError(400, 'Only approved restaurants can be published or unpublished.');
      if (listingStatus === 'published') {
        const branch = await Branch.findOne({ where: {
          restaurantId: current.id,
          isActive: true,
          operationalStatus: { [Op.notIn]: ['inactive', 'temporarily_closed'] },
          approvalStatus: { [Op.notIn]: ['rejected', 'suspended'] },
        }, transaction });
        if (!branch) throw httpError(409, 'Add an active, eligible restaurant branch before publishing to the customer marketplace.');
      }
      await current.update({ listingStatus, marketplaceEnabled: listingStatus === 'published' }, { transaction });
    });
    return res.status(200).json({ success: true, message: listingStatus === 'published' ? 'Restaurant published to the marketplace.' : 'Restaurant unpublished from the marketplace.', data: restaurant });
  } catch (error) {
    next(error);
  }
};
