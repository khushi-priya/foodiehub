const { Op } = require("sequelize");
const { Branch, Restaurant } = require("../../models");
const {
  branchAvailabilityStatus,
} = require("../../services/branch-availability");
const {
  ownerResubmissionFields,
  ownerCreateApprovalFields,
  ownerBranchWhere,
} = require("../../services/branch-policy");
const { assertBranchCapacity } = require("../../services/subscription-limits");
const { createRestaurantNotification } = require("../../services/restaurant-notifications");

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, max) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError")
      return res
        .status(409)
        .json({
          success: false,
          message: "This branch code is already used in your restaurant.",
        });
    next(error);
  }
};
const response = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });

function validateBranch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw fail(400, "Branch details are required.");
  const required = {
    name: 150,
    branchCode: 50,
    phone: 20,
    addressLine: 255,
    city: 100,
    state: 100,
    postalCode: 20,
    country: 100,
  };
  for (const [field, max] of Object.entries(required))
    if (!text(body[field], max))
      throw fail(400, `${field} is required (maximum ${max} characters).`);
  if (!/^\+?[0-9][0-9\s().-]{6,19}$/.test(body.phone.trim()))
    throw fail(400, "Enter a valid branch contact number.");
  if (
    body.email != null &&
    body.email !== "" &&
    (!text(body.email, 150) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))
  )
    throw fail(400, "Enter a valid branch email address.");
  for (const field of ["addressLine2", "landmark"])
    if (
      body[field] != null &&
      (typeof body[field] !== "string" ||
        body[field].length > (field === "landmark" ? 150 : 255))
    )
      throw fail(400, `${field} is too long.`);
  if (
    !timePattern.test(body.openingTime || "") ||
    !timePattern.test(body.closingTime || "")
  )
    throw fail(400, "Provide opening and closing times in HH:MM format.");
  if (typeof body.overnight !== "boolean")
    throw fail(400, "overnight must be true or false.");
  if (
    typeof body.timeZone !== "string" ||
    !body.timeZone.trim() ||
    body.timeZone.trim().length > 64
  )
    throw fail(400, "Provide a valid IANA time zone.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: body.timeZone.trim() }).format(
      new Date(),
    );
  } catch {
    throw fail(400, "Provide a valid IANA time zone.");
  }
  if (body.openingTime === body.closingTime)
    throw fail(400, "Opening and closing times must be different.");
  if (body.closingTime < body.openingTime && body.overnight !== true)
    throw fail(
      400,
      "Enable overnight hours when closing time is earlier than opening time.",
    );
  if (body.overnight === true && body.closingTime >= body.openingTime)
    throw fail(
      400,
      "Overnight hours require closing time to be earlier than opening time.",
    );
  const working = body.workingDays;
  if (
    !Array.isArray(working) ||
    !working.length ||
    working.some((day) => !DAYS.includes(day)) ||
    new Set(working).size !== working.length
  )
    throw fail(400, "Select at least one valid working day.");
  if (
    body.closedDays !== undefined &&
    (!Array.isArray(body.closedDays) ||
      body.closedDays.some((day) => !DAYS.includes(day)))
  )
    throw fail(400, "Closed days must be valid weekdays.");
  if (
    body.closedDays !== undefined &&
    DAYS.some((day) => body.closedDays.includes(day) === working.includes(day))
  )
    throw fail(
      400,
      "Working days and closed days must not overlap and must cover the week.",
    );
  const hasLat = body.latitude !== "" && body.latitude != null;
  const hasLng = body.longitude !== "" && body.longitude != null;
  if (hasLat !== hasLng)
    throw fail(
      400,
      "Provide both latitude and longitude, or leave both blank.",
    );
  if (
    hasLat &&
    (!Number.isFinite(Number(body.latitude)) ||
      Number(body.latitude) < -90 ||
      Number(body.latitude) > 90 ||
      !Number.isFinite(Number(body.longitude)) ||
      Number(body.longitude) < -180 ||
      Number(body.longitude) > 180)
  )
    throw fail(
      400,
      "Coordinates are outside the valid latitude or longitude range.",
    );
  for (const field of [
    "dineInEnabled",
    "takeawayEnabled",
    "deliveryEnabled",
    "cashOnDeliveryEnabled",
    "razorpayEnabled",
    "isPrimary",
    "isActive",
  ])
    if (typeof body[field] !== "boolean")
      throw fail(400, `${field} must be true or false.`);
  if (
    ![body.dineInEnabled, body.takeawayEnabled, body.deliveryEnabled].some(
      (value) => value !== false,
    )
  )
    throw fail(400, "Enable at least one branch service.");
  if (body.isPrimary === true && body.isActive === false)
    throw fail(400, "An inactive branch cannot be primary.");
}

function branchValues(body) {
  const workingDays = body.workingDays;
  return {
    name: body.name.trim(),
    branchCode: body.branchCode.trim().toUpperCase(),
    phone: body.phone.trim(),
    email: body.email?.trim().toLowerCase() || null,
    addressLine: body.addressLine.trim(),
    addressLine2: body.addressLine2?.trim() || null,
    landmark: body.landmark?.trim() || null,
    city: body.city.trim(),
    state: body.state.trim(),
    postalCode: body.postalCode.trim(),
    country: body.country.trim(),
    latitude:
      body.latitude === "" || body.latitude == null
        ? null
        : Number(body.latitude),
    longitude:
      body.longitude === "" || body.longitude == null
        ? null
        : Number(body.longitude),
    openingTime: `${body.openingTime}:00`,
    closingTime: `${body.closingTime}:00`,
    timeZone: body.timeZone.trim(),
    workingDays,
    closedDays: DAYS.filter((day) => !workingDays.includes(day)),
    overnight: body.overnight === true,
    dineInEnabled: body.dineInEnabled !== false,
    takeawayEnabled: body.takeawayEnabled !== false,
    deliveryEnabled: body.deliveryEnabled !== false,
    cashOnDeliveryEnabled: body.cashOnDeliveryEnabled === true,
    razorpayEnabled: body.razorpayEnabled === true,
    isActive: body.isActive !== false,
  };
}

async function findBranch(req, transaction) {
  const where = ownerBranchWhere(req.restaurant.id, req.params.branchId);
  if (
    req.restaurantRole !== "restaurant_owner" &&
    req.restaurantBranchIds !== null
  )
    where[Op.and] = [{ id: { [Op.in]: req.restaurantBranchIds } }];
  const branch = await Branch.findOne({
    where,
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!branch) throw fail(404, "Branch not found.");
  return branch;
}

exports.summary = handle(async (req, res) => {
  const where = { restaurantId: req.restaurant.id };
  if (
    req.restaurantRole !== "restaurant_owner" &&
    req.restaurantBranchIds !== null
  )
    where.id = { [Op.in]: req.restaurantBranchIds };
  const [total, active, inactive, primaryBranch] = await Promise.all([
    Branch.count({ where }),
    Branch.count({ where: { ...where, isActive: true } }),
    Branch.count({ where: { ...where, isActive: false } }),
    Branch.findOne({
      where: { ...where, isPrimary: true },
      attributes: ["id", "name", "city", "isActive"],
    }),
  ]);
  response(res, {
    totalBranches: total,
    activeBranches: active,
    inactiveBranches: inactive,
    primaryBranch,
  });
});

exports.list = handle(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
    100,
  );
  const where = { restaurantId: req.restaurant.id };
  if (
    req.restaurantRole !== "restaurant_owner" &&
    req.restaurantBranchIds !== null
  )
    where.id = { [Op.in]: req.restaurantBranchIds };
  if (req.query.status === "active") where.isActive = true;
  else if (req.query.status === "inactive") where.isActive = false;
  else if (req.query.status && req.query.status !== "all")
    throw fail(400, "Invalid branch status filter.");
  if (req.query.search)
    where[Op.or] = [
      {
        name: {
          [Op.like]: `%${String(req.query.search).trim().slice(0, 100)}%`,
        },
      },
      {
        city: {
          [Op.like]: `%${String(req.query.search).trim().slice(0, 100)}%`,
        },
      },
    ];
  const result = await Branch.findAndCountAll({
    where,
    order: [
      ["isPrimary", "DESC"],
      ["createdAt", "ASC"],
    ],
    limit,
    offset: (page - 1) * limit,
  });
  const now = new Date();
  response(res, {
    branches: result.rows.map((branch) => ({
      ...branch.toJSON(),
      availabilityStatus: branchAvailabilityStatus(branch, now),
    })),
    pagination: {
      total: result.count,
      page,
      limit,
      totalPages: Math.ceil(result.count / limit),
    },
  });
});

exports.details = handle(async (req, res) => {
  const branch = await findBranch(req);
  response(res, {
    ...branch.toJSON(),
    availabilityStatus: branchAvailabilityStatus(branch),
  });
});

exports.create = handle(async (req, res) => {
  validateBranch(req.body);
  const sequelize = Branch.sequelize;
  const branch = await sequelize.transaction(async (transaction) => {
    // Lock the restaurant row to serialize primary branch changes per tenant.
    await Restaurant.findByPk(req.restaurant.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const existingCount = await Branch.count({
      where: { restaurantId: req.restaurant.id },
      transaction,
    });
    await assertBranchCapacity(req.restaurant.id, transaction, existingCount);
    const makePrimary =
      req.body.isActive !== false &&
      (req.body.isPrimary === true || existingCount === 0);
    if (makePrimary)
      await Branch.update(
        { isPrimary: false },
        { where: { restaurantId: req.restaurant.id }, transaction },
      );
    const branch = await Branch.create(
      {
        restaurantId: req.restaurant.id,
        ...branchValues(req.body),
        ...ownerCreateApprovalFields(),
        isPrimary: makePrimary,
      },
      { transaction },
    );
    await createRestaurantNotification({ app: req.app, restaurantId: req.restaurant.id, branchId: branch.id, category: 'branch', title: 'Branch added', message: `${branch.name} was added to your restaurant.`, href: `/restaurant/branches?search=${encodeURIComponent(branch.name)}`, entityId: branch.id, dedupeKey: `branch-created:${branch.id}`, transaction });
    return branch;
  });
  response(res, branch, 201);
});

exports.update = handle(async (req, res) => {
  validateBranch(req.body);
  const branch = await Branch.sequelize.transaction(async (transaction) => {
    await Restaurant.findByPk(req.restaurant.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const current = await findBranch(req, transaction);
    const makePrimary =
      req.body.isPrimary === true && req.body.isActive !== false;
    if (req.body.isPrimary === true && req.body.isActive === false)
      throw fail(400, "An inactive branch cannot be primary.");
    if (current.isPrimary && req.body.isActive === false) {
      const activeOthers = await Branch.count({
        where: {
          restaurantId: req.restaurant.id,
          isActive: true,
          id: { [Op.ne]: current.id },
        },
        transaction,
      });
      if (activeOthers > 0)
        throw fail(
          409,
          "Set another active branch as primary before deactivating this branch.",
        );
    }
    if (makePrimary)
      await Branch.update(
        { isPrimary: false },
        { where: { restaurantId: req.restaurant.id }, transaction },
      );
    await current.update(
      {
        ...branchValues(req.body),
        isPrimary:
          makePrimary || (current.isPrimary && req.body.isActive !== false),
        ...ownerResubmissionFields(current.approvalStatus),
      },
      { transaction },
    );
    return current;
  });
  response(res, branch);
});

exports.status = handle(async (req, res) => {
  if (typeof req.body.isActive !== "boolean")
    throw fail(400, "isActive must be true or false.");
  const branch = await Branch.sequelize.transaction(async (transaction) => {
    await Restaurant.findByPk(req.restaurant.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const current = await findBranch(req, transaction);
    if (!req.body.isActive && current.isPrimary) {
      const activeOthers = await Branch.count({
        where: {
          restaurantId: req.restaurant.id,
          isActive: true,
          id: { [Op.ne]: current.id },
        },
        transaction,
      });
      if (activeOthers > 0)
        throw fail(
          409,
          "Set another active branch as primary before deactivating this branch.",
        );
      await current.update(
        { isActive: false, isPrimary: false },
        { transaction },
      );
    } else {
      await current.update(
        {
          isActive: req.body.isActive,
          ...(req.body.isActive &&
          !(await Branch.count({
            where: { restaurantId: req.restaurant.id, isPrimary: true },
            transaction,
          }))
            ? { isPrimary: true }
            : {}),
        },
        { transaction },
      );
    }
    return current;
  });
  response(res, branch);
});

exports.deliveryAvailability = handle(async (req, res) => {
  if (typeof req.body.deliveryEnabled !== "boolean")
    throw fail(400, "deliveryEnabled must be true or false.");
  const branch = await findBranch(req);
  await branch.update({ deliveryEnabled: req.body.deliveryEnabled });
  response(res, { id: branch.id, deliveryEnabled: branch.deliveryEnabled });
});

exports.setPrimary = handle(async (req, res) => {
  const branch = await Branch.sequelize.transaction(async (transaction) => {
    await Restaurant.findByPk(req.restaurant.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const current = await findBranch(req, transaction);
    if (!current.isActive)
      throw fail(409, "Only an active branch can be primary.");
    await Branch.update(
      { isPrimary: false },
      { where: { restaurantId: req.restaurant.id }, transaction },
    );
    await current.update({ isPrimary: true }, { transaction });
    return current;
  });
  response(res, branch);
});

exports.adminList = handle(async (req, res) => {
  const restaurant = await Restaurant.findByPk(req.params.id, {
    attributes: ["id"],
  });
  if (!restaurant) throw fail(404, "Restaurant not found.");
  const branches = await Branch.findAll({
    where: { restaurantId: restaurant.id },
    attributes: [
      "id",
      "name",
      "branchCode",
      "phone",
      "email",
      "addressLine",
      "addressLine2",
      "landmark",
      "city",
      "state",
      "postalCode",
      "country",
      "approvalStatus",
      "operationalStatus",
      "isActive",
      "isPrimary",
      "createdAt",
    ],
    order: [
      ["isPrimary", "DESC"],
      ["createdAt", "ASC"],
    ],
  });
  response(res, branches);
});

exports.validateBranch = validateBranch;
