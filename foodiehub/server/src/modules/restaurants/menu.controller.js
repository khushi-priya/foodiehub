const { Op } = require("sequelize");
const {
  MenuCategory,
  MenuItem,
  MenuItemOption,
  FoodCategoryRequest,
  FoodCategoryRequestHistory,
} = require("../../models");
const { recordAuditEvent } = require("../../services/audit-log");

const fail = (status, message) => Object.assign(new Error(message), { status });
const cleanText = (value, max) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= max;
const nonNegative = (value) =>
  value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
const validPrice = (value) =>
  nonNegative(value) && Number(value) <= 99999999.99;
const integerOrder = (value) =>
  value === undefined ||
  (Number.isInteger(Number(value)) && Number(value) >= 0);
const send = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });
const normalizeCategoryName = (name) =>
  name.normalize("NFKC").trim().toLocaleLowerCase("en");
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError")
      return res
        .status(409)
        .json({
          success: false,
          message: "A category with this name already exists.",
        });
    next(error);
  }
};

const DIETARY_TAGS = new Set(['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'halal', 'kosher']);
const ALLERGEN_TAGS = new Set(['peanuts', 'tree_nuts', 'milk', 'eggs', 'soy', 'wheat', 'fish', 'shellfish', 'sesame']);

function validateTags(value, allowed, label) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > allowed.size || value.some((tag) => typeof tag !== 'string' || !allowed.has(tag)) || new Set(value).size !== value.length)
    throw fail(400, `${label} must contain unique supported values.`);
}

function validateCategory(body) {
  if (!cleanText(body.name, 100))
    throw fail(400, "Category name is required (maximum 100 characters).");
  if (
    body.description != null &&
    (typeof body.description !== "string" || body.description.length > 500)
  )
    throw fail(400, "Category description must be 500 characters or fewer.");
  if (!integerOrder(body.displayOrder))
    throw fail(400, "Display order must be a non-negative integer.");
}

function validateItem(body) {
  if (!cleanText(body.name, 150))
    throw fail(400, "Food name is required (maximum 150 characters).");
  if (typeof body.categoryId !== "string")
    throw fail(400, "A category is required.");
  if (!validPrice(body.price))
    throw fail(400, "Price must be between 0 and 99,999,999.99.");
  if (
    body.discountedPrice !== undefined &&
    body.discountedPrice !== null &&
    body.discountedPrice !== "" &&
    (!validPrice(body.discountedPrice) ||
      Number(body.discountedPrice) > Number(body.price))
  )
    throw fail(
      400,
      "Discounted price must be non-negative, no greater than price, and at most 99,999,999.99.",
    );
  if (
    body.foodType !== undefined &&
    !["veg", "non_veg", "egg"].includes(body.foodType)
  )
    throw fail(400, "Food type must be veg, non_veg, or egg.");
  validateTags(body.dietaryTags, DIETARY_TAGS, 'Dietary tags');
  validateTags(body.allergenTags, ALLERGEN_TAGS, 'Allergen tags');
  if (
    body.preparationTime != null &&
    body.preparationTime !== "" &&
    (!Number.isInteger(Number(body.preparationTime)) ||
      Number(body.preparationTime) < 0)
  )
    throw fail(
      400,
      "Preparation time must be a non-negative number of minutes.",
    );
  if (!integerOrder(body.displayOrder))
    throw fail(400, "Display order must be a non-negative integer.");
  for (const key of ["isAvailable", "isFeatured"])
    if (body[key] !== undefined && typeof body[key] !== "boolean")
      throw fail(400, `${key} must be true or false.`);
  if (
    body.imageUrl != null &&
    (typeof body.imageUrl !== "string" ||
      body.imageUrl.length > 1000 ||
      (body.imageUrl && !/^https?:\/\//i.test(body.imageUrl)))
  )
    throw fail(400, "Image URL must be a valid HTTP or HTTPS URL.");
  if (body.description != null && typeof body.description !== "string")
    throw fail(400, "Description must be text.");
  if (
    body.options !== undefined &&
    (!Array.isArray(body.options) || body.options.length > 50)
  )
    throw fail(400, "Options must be a list with at most 50 entries.");
  (body.options || []).forEach((option) => {
    if (
      !option ||
      !["variant", "addon"].includes(option.type) ||
      !cleanText(option.name, 100) ||
      !validPrice(option.price) ||
      !integerOrder(option.displayOrder)
    )
      throw fail(
        400,
        "Each option needs a name, type (variant or addon), valid price, and non-negative display order.",
      );
  });
}

async function ownedItem(req) {
  const item = await MenuItem.findOne({
    where: { id: req.params.itemId, restaurantId: req.restaurant.id },
  });
  if (!item) throw fail(404, "Menu item not found.");
  return item;
}
async function checkedCategory(
  restaurantId,
  categoryId,
  allowInactive = false,
) {
  const category = await MenuCategory.findOne({
    where: {
      id: categoryId,
      ...(allowInactive ? {} : { isActive: true }),
      [Op.or]: [
        { scope: "global", restaurantId: null },
        { scope: "restaurant", restaurantId },
      ],
    },
  });
  if (!category)
    throw fail(
      400,
      "Selected category is not active or available to this restaurant.",
    );
  return category;
}

exports.summary = handle(async (req, res) => {
  const [categories, items, pendingRequests] = await Promise.all([
    MenuCategory.count({
      where: {
        isActive: true,
        [Op.or]: [
          { scope: "global", restaurantId: null },
          { scope: "restaurant", restaurantId: req.restaurant.id },
        ],
      },
    }),
    MenuItem.findAll({
      where: { restaurantId: req.restaurant.id },
      attributes: ["isAvailable"],
    }),
    FoodCategoryRequest.count({
      where: { restaurantId: req.restaurant.id, status: "pending" },
    }),
  ]);
  send(res, {
    totalCategories: categories,
    pendingRequests,
    totalItems: items.length,
    availableItems: items.filter((x) => x.isAvailable).length,
    unavailableItems: items.filter((x) => !x.isAvailable).length,
  });
});
exports.listCategories = handle(async (req, res) => {
  const categories = await MenuCategory.findAll({
    where: {
      [Op.or]: [
        { scope: "global", restaurantId: null },
        { scope: "restaurant", restaurantId: req.restaurant.id },
      ],
    },
    order: [
      ["displayOrder", "ASC"],
      ["name", "ASC"],
    ],
  });
  const counts = await MenuItem.findAll({
    where: {
      restaurantId: req.restaurant.id,
      categoryId: categories.map((category) => category.id),
    },
    attributes: ["categoryId"],
    raw: true,
  });
  const itemCounts = counts.reduce(
    (result, item) => ({
      ...result,
      [item.categoryId]: (result[item.categoryId] || 0) + 1,
    }),
    {},
  );
  send(
    res,
    categories.map((category) => ({
      ...category.toJSON(),
      itemCount: itemCounts[category.id] || 0,
    })),
  );
});
exports.createCategory = handle(async (req, res) => {
  validateCategory(req.body);
  const values = validateCategoryRequest(req.body);
  const normalized = normalizeCategoryName(values.name);
  const category = await MenuCategory.findAll({
    where: {
      [Op.or]: [
        { scope: "global", restaurantId: null },
        { scope: "restaurant", restaurantId: req.restaurant.id },
      ],
    },
  });
  if (
    category.some((entry) => normalizeCategoryName(entry.name) === normalized)
  )
    throw fail(
      409,
      "An approved category with this name is already available.",
    );
  const previous = await FoodCategoryRequest.findAll({
    where: { restaurantId: req.restaurant.id, status: "pending" },
  });
  if (
    previous.some((entry) => normalizeCategoryName(entry.name) === normalized)
  )
    throw fail(409, "A matching category request is already pending.");
  const request = await FoodCategoryRequest.sequelize.transaction(
    async (transaction) => {
      const created = await FoodCategoryRequest.create(
        {
          restaurantId: req.restaurant.id,
          requestedBy: req.authUser.id,
          ...values,
          pendingNameKey: normalized,
        },
        { transaction },
      );
      await FoodCategoryRequestHistory.create(
        {
          requestId: created.id,
          action: "submitted",
          previousStatus: null,
          newStatus: "pending",
          performedBy: req.authUser.id,
        },
        { transaction },
      );
      await recordAuditEvent(
        req,
        {
          action: "food_category_request.submitted",
          entityType: "food_category_request",
          entityId: created.id,
          afterData: { name: created.name },
        },
        { transaction },
      );
      return created;
    },
  );
  send(res, request, 201);
});
exports.updateCategory = handle(async (req, res) => {
  throw fail(
    403,
    "Approved categories are managed by Super Admin. Resubmit rejected requests instead.",
  );
});
exports.categoryStatus = handle(async (req, res) => {
  throw fail(403, "Only Super Admin can change category activation.");
});
exports.deleteCategory = handle(async (req, res) => {
  throw fail(
    403,
    "Approved categories cannot be deleted by restaurant owners.",
  );
});

function validateCategoryRequest(body) {
  if (!cleanText(body.name, 100))
    throw fail(400, "Category name is required (maximum 100 characters).");
  if (
    body.description != null &&
    (typeof body.description !== "string" || body.description.length > 500)
  )
    throw fail(400, "Description must be 500 characters or fewer.");
  if (
    body.imageUrl != null &&
    (typeof body.imageUrl !== "string" ||
      body.imageUrl.length > 1000 ||
      (body.imageUrl && !/^https?:\/\//i.test(body.imageUrl)))
  )
    throw fail(400, "Image URL must be a valid HTTP or HTTPS URL.");
  if (!integerOrder(body.displayOrder))
    throw fail(400, "Display order must be a non-negative integer.");
  return {
    name: body.name.trim(),
    description: body.description?.trim() || null,
    imageUrl: body.imageUrl?.trim() || null,
    displayOrder: Number(body.displayOrder || 0),
  };
}

exports.listCategoryRequests = handle(async (req, res) => {
  const requests = await FoodCategoryRequest.findAll({
    where: { restaurantId: req.restaurant.id },
    include: [
      {
        model: MenuCategory,
        as: "approvedCategory",
        attributes: ["id", "name", "scope"],
      },
      {
        model: FoodCategoryRequestHistory,
        as: "history",
        order: [["createdAt", "ASC"]],
      },
    ],
    order: [["updatedAt", "DESC"]],
  });
  send(res, requests);
});

exports.resubmitCategoryRequest = handle(async (req, res) => {
  const values = validateCategoryRequest(req.body);
  const request = await FoodCategoryRequest.sequelize.transaction(
    async (transaction) => {
      const current = await FoodCategoryRequest.findOne({
        where: { id: req.params.requestId, restaurantId: req.restaurant.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!current) throw fail(404, "Category request not found.");
      if (current.status !== "rejected")
        throw fail(
          409,
          "Only rejected category requests can be edited and resubmitted.",
        );
      const nameKey = normalizeCategoryName(values.name);
      const approved = await MenuCategory.findAll({
        where: {
          [Op.or]: [
            { scope: "global", restaurantId: null },
            { scope: "restaurant", restaurantId: req.restaurant.id },
          ],
        },
        transaction,
      });
      if (
        approved.some(
          (category) => normalizeCategoryName(category.name) === nameKey,
        )
      )
        throw fail(
          409,
          "An approved category with this name is already available.",
        );
      const otherPending = await FoodCategoryRequest.findAll({
        where: {
          id: { [Op.ne]: current.id },
          restaurantId: req.restaurant.id,
          status: "pending",
        },
        transaction,
      });
      if (
        otherPending.some(
          (entry) => normalizeCategoryName(entry.name) === nameKey,
        )
      )
        throw fail(409, "A matching category request is already pending.");
      await current.update(
        {
          ...values,
          pendingNameKey: nameKey,
          status: "pending",
          approvalType: null,
          approvedCategoryId: null,
          reviewedBy: null,
          reviewedAt: null,
          rejectionReason: null,
        },
        { transaction },
      );
      await FoodCategoryRequestHistory.create(
        {
          requestId: current.id,
          action: "resubmitted",
          previousStatus: "rejected",
          newStatus: "pending",
          performedBy: req.authUser.id,
        },
        { transaction },
      );
      await recordAuditEvent(
        req,
        {
          action: "food_category_request.resubmitted",
          entityType: "food_category_request",
          entityId: current.id,
          afterData: { name: current.name },
        },
        { transaction },
      );
      return current;
    },
  );
  send(res, request);
});
exports.listItems = handle(async (req, res) => {
  const where = { restaurantId: req.restaurant.id };
  if (req.query.categoryId) where.categoryId = req.query.categoryId;
  if (req.query.availability === "available") where.isAvailable = true;
  if (req.query.availability === "unavailable") where.isAvailable = false;
  if (req.query.search)
    where.name = { [Op.like]: `%${String(req.query.search).slice(0, 100)}%` };
  const items = await MenuItem.findAll({
    where,
    include: [
      {
        model: MenuCategory,
        as: "category",
        attributes: ["id", "name", "isActive"],
      },
      { model: MenuItemOption, as: "options" },
    ],
    order: [
      ["displayOrder", "ASC"],
      ["name", "ASC"],
    ],
  });
  send(res, items);
});
exports.getItem = handle(async (req, res) => {
  const item = await MenuItem.findOne({
    where: { id: req.params.itemId, restaurantId: req.restaurant.id },
    include: [
      { model: MenuCategory, as: "category" },
      { model: MenuItemOption, as: "options" },
    ],
  });
  if (!item) throw fail(404, "Menu item not found.");
  send(res, item);
});
exports.createItem = handle(async (req, res) => {
  validateItem(req.body);
  await checkedCategory(req.restaurant.id, req.body.categoryId);
  const sequelize = MenuItem.sequelize;
  const item = await sequelize.transaction(async (transaction) => {
    const created = await MenuItem.create(
      itemValues(req.body, req.restaurant.id),
      { transaction },
    );
    if (req.body.options?.length)
      await MenuItemOption.bulkCreate(
        req.body.options.map((option) => ({
          ...option,
          restaurantId: req.restaurant.id,
          menuItemId: created.id,
        })),
        { transaction },
      );
    return MenuItem.findByPk(created.id, {
      include: [
        { model: MenuCategory, as: "category" },
        { model: MenuItemOption, as: "options" },
      ],
      transaction,
    });
  });
  send(res, item, 201);
});
function itemValues(body, restaurantId) {
  return {
    restaurantId,
    categoryId: body.categoryId,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    price: Number(body.price),
    discountedPrice:
      body.discountedPrice === "" || body.discountedPrice == null
        ? null
        : Number(body.discountedPrice),
    imageUrl: body.imageUrl || null,
    foodType: body.foodType || "veg",
    dietaryTags: body.dietaryTags ?? [],
    allergenTags: body.allergenTags ?? [],
    preparationTime:
      body.preparationTime === "" || body.preparationTime == null
        ? null
        : Number(body.preparationTime),
    isAvailable: body.isAvailable ?? true,
    isFeatured: body.isFeatured ?? false,
    displayOrder: Number(body.displayOrder || 0),
  };
}
exports.updateItem = handle(async (req, res) => {
  validateItem(req.body);
  const item = await ownedItem(req);
  await checkedCategory(
    req.restaurant.id,
    req.body.categoryId,
    req.body.categoryId === item.categoryId,
  );
  const result = await MenuItem.sequelize.transaction(async (transaction) => {
    const values = itemValues({ dietaryTags: item.dietaryTags || [], allergenTags: item.allergenTags || [], ...req.body }, req.restaurant.id);
    await item.update(values, { transaction });
    if (req.body.options !== undefined) {
      await MenuItemOption.destroy({
        where: { restaurantId: req.restaurant.id, menuItemId: item.id },
        transaction,
      });
      if (req.body.options.length)
        await MenuItemOption.bulkCreate(
          req.body.options.map((option) => ({
            ...option,
            restaurantId: req.restaurant.id,
            menuItemId: item.id,
          })),
          { transaction },
        );
    }
    return MenuItem.findByPk(item.id, {
      include: [
        { model: MenuCategory, as: "category" },
        { model: MenuItemOption, as: "options" },
      ],
      transaction,
    });
  });
  send(res, result);
});
exports.deleteItem = handle(async (req, res) => {
  const item = await ownedItem(req);
  await MenuItem.sequelize.transaction(async (transaction) => {
    await MenuItemOption.destroy({
      where: { restaurantId: req.restaurant.id, menuItemId: item.id },
      transaction,
    });
    await item.destroy({ transaction });
  });
  send(res, { id: item.id });
});
exports.patchItem = (field) =>
  handle(async (req, res) => {
    const key = field === "isAvailable" ? "isAvailable" : "isFeatured";
    if (typeof req.body[key] !== "boolean")
      throw fail(400, `${key} must be true or false.`);
    const item = await ownedItem(req);
    await item.update({ [key]: req.body[key] });
    send(res, item);
  });
exports.createOption = handle(async (req, res) => {
  const item = await ownedItem(req);
  if (
    !["variant", "addon"].includes(req.body.type) ||
    !cleanText(req.body.name, 100) ||
    !validPrice(req.body.price) ||
    !integerOrder(req.body.displayOrder)
  )
    throw fail(
      400,
      "Option needs a name, type, valid price, and non-negative display order.",
    );
  send(
    res,
    await MenuItemOption.create({
      restaurantId: req.restaurant.id,
      menuItemId: item.id,
      type: req.body.type,
      name: req.body.name.trim(),
      price: Number(req.body.price),
      displayOrder: Number(req.body.displayOrder || 0),
    }),
    201,
  );
});
exports.updateOption = handle(async (req, res) => {
  const option = await MenuItemOption.findOne({
    where: {
      id: req.params.optionId,
      restaurantId: req.restaurant.id,
      menuItemId: req.params.itemId,
    },
  });
  if (!option) throw fail(404, "Menu option not found.");
  const body = req.body;
  if (body.name !== undefined && !cleanText(body.name, 100))
    throw fail(400, "Option name is required.");
  if (body.price !== undefined && !validPrice(body.price))
    throw fail(400, "Option price must be between 0 and 99,999,999.99.");
  if (body.type !== undefined && !["variant", "addon"].includes(body.type))
    throw fail(400, "Option type must be variant or addon.");
  if (body.displayOrder !== undefined && !integerOrder(body.displayOrder))
    throw fail(400, "Display order must be a non-negative integer.");
  await option.update({
    ...(body.name !== undefined ? { name: body.name.trim() } : {}),
    ...(body.price !== undefined ? { price: Number(body.price) } : {}),
    ...(body.type !== undefined ? { type: body.type } : {}),
    ...(body.displayOrder !== undefined
      ? { displayOrder: Number(body.displayOrder) }
      : {}),
  });
  send(res, option);
});
exports.deleteOption = handle(async (req, res) => {
  const option = await MenuItemOption.findOne({
    where: {
      id: req.params.optionId,
      restaurantId: req.restaurant.id,
      menuItemId: req.params.itemId,
    },
  });
  if (!option) throw fail(404, "Menu option not found.");
  await option.destroy();
  send(res, { id: option.id });
});
