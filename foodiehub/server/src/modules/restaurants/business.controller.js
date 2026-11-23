const { Op } = require("sequelize");
const sequelize = require("../../config/database");
const { Restaurant, Branch, AuditLog } = require("../../models");
const { recordAuditEvent } = require("../../services/audit-log");
const {
  localDateTimeToInstant,
} = require("../../services/branch-availability");
const crypto = require("crypto");
const fail = (status, message) => Object.assign(new Error(message), { status });

exports.getSettings = async (req, res, next) => {
  try {
    const restaurant = await Restaurant.findByPk(req.restaurant.id, {
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "description",
        "logo",
        "acceptingOrders",
        "approvalStatus",
        "listingStatus",
      ],
    });
    const branchWhere = { restaurantId: restaurant.id };
    if (req.restaurantBranchIds !== null)
      branchWhere.id = { [Op.in]: req.restaurantBranchIds || [] };
    const branches = await Branch.findAll({
      where: branchWhere,
      attributes: [
        "id",
        "name",
        "phone",
        "email",
        "addressLine",
        "addressLine2",
        "city",
        "state",
        "postalCode",
        "country",
        "openingTime",
        "closingTime",
        "workingDays",
        "closedDays",
        "overnight",
        "timeZone",
        "dineInEnabled",
        "takeawayEnabled",
        "deliveryEnabled",
        "operationalStatus",
        "isActive",
        "temporaryClosureUntil",
        "temporaryClosureReason",
      ],
      order: [
        ["isPrimary", "DESC"],
        ["name", "ASC"],
      ],
    });
    const branchIds = branches.map((b) => b.id);
    const history = branchIds.length
      ? await AuditLog.findAll({
          where: {
            entityType: "branch",
            entityId: { [Op.in]: branchIds },
            action: {
              [Op.in]: [
                "restaurant.branch.temporarily_closed",
                "restaurant.branch.reopened",
              ],
            },
          },
          attributes: [
            "id",
            "actorUserId",
            "action",
            "entityId",
            "reason",
            "afterData",
            "createdAt",
          ],
          order: [["createdAt", "DESC"]],
          limit: 100,
        })
      : [];
    res.json({ success: true, restaurant, branches, closureHistory: history });
  } catch (e) {
    next(e);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ["name", "description", "email", "phone", "logo"];
    const input = req.body || {};
    const unknown = Object.keys(input).filter((k) => !allowed.includes(k));
    if (unknown.length)
      throw fail(400, `Unsupported profile fields: ${unknown.join(", ")}`);
    const updates = {};
    for (const key of allowed)
      if (input[key] !== undefined) {
        if (typeof input[key] !== "string")
          throw fail(400, `${key} must be a string.`);
        const value = input[key].trim();
        if (key === "name" && (!value || value.length > 150))
          throw fail(
            400,
            "Restaurant name is required and must be 150 characters or fewer.",
          );
        if (key === "description" && value.length > 5000)
          throw fail(400, "Description must be 5000 characters or fewer.");
        if (key === "email" && (value.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
          throw fail(400, "Enter a valid contact email.");
        if (key === "phone" && !/^\+?[0-9 ()-]{7,20}$/.test(value))
          throw fail(400, "Enter a valid contact phone number.");
        if (key === "logo" && value) {
          let logoUrl;
          try { logoUrl = new URL(value); } catch { throw fail(400, "Logo must be an HTTPS image URL."); }
          if (logoUrl.protocol !== "https:" || !logoUrl.hostname || value.length > 500)
            throw fail(400, "Logo must be an HTTPS image URL.");
        }
        updates[key] = value || null;
      }
    if (!Object.keys(updates).length)
      throw fail(400, "No profile changes were provided.");
    const beforeRecord = await Restaurant.findByPk(req.restaurant.id, {
      attributes: [...new Set([Restaurant.primaryKeyAttribute, ...allowed])],
    });
    if (!beforeRecord) throw fail(404, "Restaurant not found.");
    const beforeData = beforeRecord.toJSON();
    const restaurant = await beforeRecord.update(updates);
    await recordAuditEvent(req, {
      action: "restaurant.profile.updated",
      entityType: "restaurant",
      entityId: restaurant.id,
      beforeData,
      afterData: updates,
    });
    res.json({ success: true, restaurant });
  } catch (e) {
    next(e);
  }
};

exports.updateSettings = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { acceptingOrders } = req.body || {};
    if (typeof acceptingOrders !== "boolean")
      throw fail(400, "acceptingOrders must be true or false.");
    const restaurant = await Restaurant.findByPk(req.restaurant.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const before = restaurant.acceptingOrders;
    await restaurant.update({ acceptingOrders }, { transaction });
    await recordAuditEvent(
      req,
      {
        action: acceptingOrders
          ? "restaurant.orders.resumed"
          : "restaurant.orders.paused",
        entityType: "restaurant",
        entityId: restaurant.id,
        beforeData: { acceptingOrders: before },
        afterData: { acceptingOrders },
      },
      { transaction },
    );
    await transaction.commit();
    res.json({
      success: true,
      acceptingOrders: restaurant.acceptingOrders,
      message: acceptingOrders
        ? "Online orders are enabled."
        : "Online orders are paused.",
    });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};

exports.updateHours = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      branchId,
      openingTime,
      closingTime,
      workingDays,
      closedDays,
      overnight,
      timeZone,
    } = req.body || {};
    if (!branchId) throw fail(400, "Select a branch.");
    const branch = await Branch.findOne({
      where: {
        id: branchId,
        restaurantId: req.restaurant.id,
        ...(req.restaurantBranchIds
          ? {
              id: {
                [Op.and]: [branchId, { [Op.in]: req.restaurantBranchIds }],
              },
            }
          : {}),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!branch) throw fail(404, "Branch not found.");
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
    if (openingTime != null && !timePattern.test(openingTime))
      throw fail(400, "Opening time must use HH:mm format.");
    if (closingTime != null && !timePattern.test(closingTime))
      throw fail(400, "Closing time must use HH:mm format.");
    if (Boolean(overnight) && !openingTime && !closingTime)
      throw fail(400, "Overnight hours require opening and closing times.");
    if (
      workingDays !== undefined &&
      (!Array.isArray(workingDays) ||
        workingDays.some(
          (d) =>
            ![
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ].includes(d),
        ))
    )
      throw fail(400, "Invalid working days.");
    if (
      closedDays !== undefined &&
      (!Array.isArray(closedDays) ||
        closedDays.some(
          (d) =>
            ![
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ].includes(d),
        ))
    )
      throw fail(400, "Invalid closed days.");
    if (timeZone !== undefined) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone });
      } catch {
        throw fail(400, "Enter a valid timezone.");
      }
    }
    const before = {
      openingTime: branch.openingTime,
      closingTime: branch.closingTime,
      workingDays: branch.workingDays,
      closedDays: branch.closedDays,
      overnight: branch.overnight,
      timeZone: branch.timeZone,
    };
    const updates = {};
    for (const key of [
      "openingTime",
      "closingTime",
      "workingDays",
      "closedDays",
      "overnight",
      "timeZone",
    ])
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    await branch.update(updates, { transaction });
    await recordAuditEvent(
      req,
      {
        action: "restaurant.business_hours.updated",
        entityType: "branch",
        entityId: branch.id,
        beforeData: before,
        afterData: updates,
      },
      { transaction },
    );
    await transaction.commit();
    res.json({ success: true, branch });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};

exports.closeBranch = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { reason, reopenAt } = req.body || {};
    const allowed = [
      "Emergency closure",
      "Maintenance",
      "Staff unavailable",
      "Holiday",
      "Other",
    ];
    if (!allowed.includes(reason))
      throw fail(400, "Choose a valid closure reason.");
    const branch = await Branch.findOne({
      where: {
        id: req.params.branchId,
        restaurantId: req.restaurant.id,
        ...(req.restaurantBranchIds
          ? {
              id: {
                [Op.and]: [
                  req.params.branchId,
                  { [Op.in]: req.restaurantBranchIds },
                ],
              },
            }
          : {}),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!branch) throw fail(404, "Branch not found.");
    let reopenDate = null;
    if (reopenAt) {
      try {
        reopenDate = localDateTimeToInstant(reopenAt, branch.timeZone);
      } catch (error) {
        throw fail(400, error.message);
      }
      if (reopenDate <= new Date())
        throw fail(400, "Reopening time must be in the future.");
    }
    const before = {
      operationalStatus: branch.operationalStatus,
      temporaryClosureUntil: branch.temporaryClosureUntil,
      temporaryClosureReason: branch.temporaryClosureReason,
    };
    await branch.update(
      {
        operationalStatus: "temporarily_closed",
        temporaryClosureUntil: reopenDate,
        temporaryClosureReason: reason,
        temporaryClosureToken: crypto.randomUUID(),
      },
      { transaction },
    );
    await recordAuditEvent(
      req,
      {
        action: "restaurant.branch.temporarily_closed",
        entityType: "branch",
        entityId: branch.id,
        reason,
        beforeData: before,
        afterData: {
          operationalStatus: "temporarily_closed",
          reopenAt: reopenDate?.toISOString() || null,
        },
      },
      { transaction },
    );
    await transaction.commit();
    const responseBranch = branch.toJSON();
    delete responseBranch.temporaryClosureToken;
    res.json({
      success: true,
      branch: responseBranch,
      message: `Branch closed: ${reason}.`,
    });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};

exports.reopenBranch = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const branch = await Branch.findOne({
      where: {
        id: req.params.branchId,
        restaurantId: req.restaurant.id,
        ...(req.restaurantBranchIds
          ? {
              id: {
                [Op.and]: [
                  req.params.branchId,
                  { [Op.in]: req.restaurantBranchIds },
                ],
              },
            }
          : {}),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!branch) throw fail(404, "Branch not found.");
    if (!branch.isActive || branch.approvalStatus !== "approved")
      throw fail(409, "Only active, approved branches can reopen.");
    const before = {
      operationalStatus: branch.operationalStatus,
      temporaryClosureUntil: branch.temporaryClosureUntil,
      temporaryClosureReason: branch.temporaryClosureReason,
    };
    await branch.update(
      {
        operationalStatus: "open",
        temporaryClosureUntil: null,
        temporaryClosureReason: null,
        temporaryClosureToken: null,
      },
      { transaction },
    );
    await recordAuditEvent(
      req,
      {
        action: "restaurant.branch.reopened",
        entityType: "branch",
        entityId: branch.id,
        reason: "Manual reopening",
        beforeData: before,
        afterData: { operationalStatus: "open", scheduled: false },
      },
      { transaction },
    );
    await transaction.commit();
    res.json({ success: true, branch });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};
