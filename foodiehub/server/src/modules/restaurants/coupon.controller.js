const { Op } = require("sequelize");
const {
  RestaurantFoodCoupon,
  RestaurantFoodCouponRedemption,
  User,
  Order,
} = require("../../models");
const { recordAuditEvent } = require("../../services/audit-log");

const fail = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError")
      return next(
        fail(409, "This coupon code is already in use by this restaurant."),
      );
    return next(error);
  }
};
const send = (res, data, status = 200, message) =>
  res
    .status(status)
    .json({ success: true, ...(message ? { message } : {}), data });
const validUUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw fail(400, "Coupon details are required.");
  const code =
    typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const errors = [];
  if (!/^[A-Z0-9_-]{3,40}$/.test(code))
    errors.push(
      "Coupon code must contain 3–40 letters, numbers, underscores, or hyphens.",
    );
  if (!name || name.length > 120)
    errors.push("Coupon name is required and must be 120 characters or fewer.");
  if (
    body.description != null &&
    (typeof body.description !== "string" || body.description.length > 2000)
  )
    errors.push("Description must be text up to 2,000 characters.");
  if (!["percentage", "fixed"].includes(body.discountType))
    errors.push("Discount type must be percentage or fixed amount.");
  const discountValue = Number(body.discountValue);
  if (
    !Number.isFinite(discountValue) ||
    discountValue <= 0 ||
    Math.round(discountValue * 100) !== discountValue * 100 ||
    (body.discountType === "percentage" && discountValue > 100)
  )
    errors.push(
      "Discount must be a positive amount with at most two decimals; percentage cannot exceed 100.",
    );
  const minimumOrderAmount = Number(body.minimumOrderAmount);
  if (
    !Number.isFinite(minimumOrderAmount) ||
    minimumOrderAmount < 0 ||
    Math.round(minimumOrderAmount * 100) !== minimumOrderAmount * 100
  )
    errors.push(
      "Minimum order amount must be zero or more, with at most two decimals.",
    );
  let maximumDiscount = null;
  if (body.maximumDiscount !== "" && body.maximumDiscount != null) {
    maximumDiscount = Number(body.maximumDiscount);
    if (
      !Number.isFinite(maximumDiscount) ||
      maximumDiscount <= 0 ||
      Math.round(maximumDiscount * 100) !== maximumDiscount * 100
    )
      errors.push(
        "Maximum discount must be positive, with at most two decimals, or left empty.",
      );
  }
  const startsAt = new Date(body.startsAt);
  const expiresAt = new Date(body.expiresAt);
  if (
    !body.startsAt ||
    !Number.isFinite(startsAt.getTime()) ||
    !body.expiresAt ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt <= startsAt
  )
    errors.push(
      "Expiry date and time must be later than the start date and time.",
    );
  const parseLimit = (key) => {
    if (body[key] === "" || body[key] == null) return null;
    const value = Number(body[key]);
    if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
      errors.push(
        `${key === "usageLimit" ? "Total usage limit" : "Per-customer usage limit"} must be a positive whole number or left empty.`,
      );
      return null;
    }
    return value;
  };
  const usageLimit = parseLimit("usageLimit");
  const perCustomerLimit = parseLimit("perCustomerLimit");
  if (body.status != null && !["active", "inactive"].includes(body.status))
    errors.push("Status must be active or inactive.");
  if (errors.length) throw fail(400, errors.join(" "));
  return {
    code,
    name,
    description:
      typeof body.description === "string"
        ? body.description.trim() || null
        : null,
    discountType: body.discountType,
    discountValue,
    minimumOrderAmount,
    maximumDiscount,
    startsAt,
    expiresAt,
    usageLimit,
    perCustomerLimit,
    status: body.status || "active",
  };
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(query.pageSize, 10) || 20),
  );
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

async function ownedCoupon(req, transaction, lock = false) {
  const { couponId } = req.params;
  if (!validUUID.test(couponId)) throw fail(400, "Coupon ID is invalid.");
  const coupon = await RestaurantFoodCoupon.findOne({
    where: { id: couponId, restaurantId: req.restaurant.id },
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!coupon) throw fail(404, "Coupon not found.");
  return coupon;
}

exports.list = wrap(async (req, res) => {
  const { page, pageSize, limit, offset } = pagination(req.query);
  const now = new Date();
  const where = { restaurantId: req.restaurant.id };
  const search =
    typeof req.query.search === "string"
      ? req.query.search.trim().slice(0, 80)
      : "";
  if (search)
    where[Op.or] = [
      { code: { [Op.like]: `%${search}%` } },
      { name: { [Op.like]: `%${search}%` } },
    ];
  if (["active", "inactive"].includes(req.query.status))
    where.status = req.query.status;
  if (["percentage", "fixed"].includes(req.query.discountType))
    where.discountType = req.query.discountType;
  if (req.query.expiry === "expired") where.expiresAt = { [Op.lte]: now };
  if (req.query.expiry === "upcoming") where.startsAt = { [Op.gt]: now };
  if (req.query.expiry === "current") {
    where.startsAt = { [Op.lte]: now };
    where.expiresAt = { [Op.gt]: now };
  }
  const [result, totalCoupons, activeCoupons, expiredCoupons, totalUses] =
    await Promise.all([
      RestaurantFoodCoupon.findAndCountAll({
        where,
        order: [
          ["createdAt", "DESC"],
          ["id", "ASC"],
        ],
        limit,
        offset,
      }),
      RestaurantFoodCoupon.count({
        where: { restaurantId: req.restaurant.id },
      }),
      RestaurantFoodCoupon.count({
        where: {
          restaurantId: req.restaurant.id,
          status: "active",
          startsAt: { [Op.lte]: now },
          expiresAt: { [Op.gt]: now },
        },
      }),
      RestaurantFoodCoupon.count({
        where: {
          restaurantId: req.restaurant.id,
          expiresAt: { [Op.lte]: now },
        },
      }),
      RestaurantFoodCouponRedemption.count({
        where: { restaurantId: req.restaurant.id, status: "redeemed" },
      }),
    ]);
  const items = await Promise.all(
    result.rows.map(async (coupon) => ({
      ...coupon.toJSON(),
      usageCount: await RestaurantFoodCouponRedemption.count({
        where: {
          restaurantId: req.restaurant.id,
          couponId: coupon.id,
          status: "redeemed",
        },
      }),
    })),
  );
  send(res, {
    items,
    stats: { totalCoupons, activeCoupons, expiredCoupons, totalUses },
    pagination: {
      total: result.count,
      page,
      pageSize,
      totalPages: Math.ceil(result.count / pageSize),
    },
  });
});

exports.create = wrap(async (req, res) => {
  const values = validate(req.body);
  const coupon = await RestaurantFoodCoupon.sequelize.transaction(
    async (transaction) => {
      const created = await RestaurantFoodCoupon.create(
        {
          ...values,
          restaurantId: req.restaurant.id,
          createdBy: req.authUser.id,
        },
        { transaction },
      );
      await recordAuditEvent(
        req,
        {
          action: "restaurant_coupon.created",
          entityType: "restaurant_food_coupon",
          entityId: created.id,
          afterData: { restaurantId: req.restaurant.id, ...values },
        },
        { transaction },
      );
      return created;
    },
  );
  send(res, coupon, 201, "Restaurant coupon created.");
});

exports.details = wrap(async (req, res) => {
  const coupon = await ownedCoupon(req);
  send(res, coupon);
});

exports.update = wrap(async (req, res) => {
  const values = validate(req.body);
  const coupon = await RestaurantFoodCoupon.sequelize.transaction(
    async (transaction) => {
      const row = await ownedCoupon(req, transaction, true);
      const before = row.toJSON();
      await row.update(values, { transaction });
      await recordAuditEvent(
        req,
        {
          action: "restaurant_coupon.updated",
          entityType: "restaurant_food_coupon",
          entityId: row.id,
          beforeData: before,
          afterData: { restaurantId: req.restaurant.id, ...values },
        },
        { transaction },
      );
      return row;
    },
  );
  send(res, coupon, 200, "Restaurant coupon updated.");
});

exports.setStatus = wrap(async (req, res) => {
  const status = req.body?.status;
  if (!["active", "inactive"].includes(status))
    throw fail(400, "Status must be active or inactive.");
  const coupon = await RestaurantFoodCoupon.sequelize.transaction(
    async (transaction) => {
      const row = await ownedCoupon(req, transaction, true);
      const before = row.status;
      await row.update({ status }, { transaction });
      await recordAuditEvent(
        req,
        {
          action: `restaurant_coupon.${status}`,
          entityType: "restaurant_food_coupon",
          entityId: row.id,
          beforeData: { status: before },
          afterData: { status, restaurantId: req.restaurant.id },
        },
        { transaction },
      );
      return row;
    },
  );
  send(
    res,
    coupon,
    200,
    `Restaurant coupon ${status === "active" ? "activated" : "deactivated"}.`,
  );
});

exports.usage = wrap(async (req, res) => {
  const coupon = await ownedCoupon(req);
  const { page, pageSize, limit, offset } = pagination(req.query);
  const result = await RestaurantFoodCouponRedemption.findAndCountAll({
    where: { couponId: coupon.id, restaurantId: req.restaurant.id },
    include: [
      {
        model: User,
        as: "customer",
        attributes: ["id", "firstName", "lastName"],
        required: true,
      },
      {
        model: Order,
        as: "order",
        attributes: [
          "id",
          "orderNumber",
          "subtotal",
          "total",
          "status",
          "paymentStatus",
        ],
        required: true,
      },
    ],
    order: [
      ["createdAt", "DESC"],
      ["id", "ASC"],
    ],
    limit,
    offset,
    distinct: true,
  });
  send(res, {
    coupon: { id: coupon.id, code: coupon.code, name: coupon.name },
    items: result.rows,
    pagination: {
      total: result.count,
      page,
      pageSize,
      totalPages: Math.ceil(result.count / pageSize),
    },
  });
});

exports.validateInput = validate;
