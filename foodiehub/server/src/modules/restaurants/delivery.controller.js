const { Op } = require("sequelize");
const {
  RestaurantMember,
  User,
  Role,
  EmployeeBranchAssignment,
  Branch,
  DeliveryAssignment,
  DeliveryStatusHistory,
  DeliverySetting,
  DeliveryLocation,
  CodCollection,
  CashHandover,
  CashHandoverItem,
  Order,
  OrderItem,
} = require("../../models");
const { recordAuditEvent } = require("../../services/audit-log");

const fail = (status, message) => Object.assign(new Error(message), { status });
const activeAssignmentStatuses = ['pending_acceptance', 'accepted', 'arriving_at_restaurant', 'at_restaurant', 'picked_up', 'on_the_way', 'at_customer'];
const formatAddressParts = (parts) => {
  const seen = new Set();
  return parts.flatMap((part) => String(part || '').split(',')).map((part) => part.trim().replace(/^[^:]{1,24}:\s*/, '').replace(/[.\s]+$/, '')).filter((part) => {
    const key = part.toLocaleLowerCase().replace(/\s+/g, ' ');
    if (!key || seen.has(key)) return false;
    const componentAlreadyInAddress = [...seen].some((existing) => (` ${existing} `).includes(` ${key} `));
    if (componentAlreadyInAddress) return false;
    seen.add(key); return true;
  }).join(', ');
};
const DEFAULT_DELIVERY_ROLES = new Set([
  "delivery_associate",
  "senior_delivery_associate",
  "delivery_supervisor",
]);
const formatDeliveryAddress = (value) => {
  if (typeof value !== "string") return value || "";
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object")
      return formatAddressParts([
        parsed.house,
        parsed.street,
        parsed.landmark,
        parsed.city,
        parsed.state,
        parsed.postalCode,
        parsed.country,
      ]);
  } catch {}
  return formatAddressParts([value]);
};
const deliveryAddressCoordinates = (value) => {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    if (
      parsed?.latitude != null &&
      parsed.latitude !== "" &&
      parsed?.longitude != null &&
      parsed.longitude !== "" &&
      Number.isFinite(Number(parsed.latitude)) &&
      Number.isFinite(Number(parsed.longitude))
    )
      return {
        latitude: Number(parsed.latitude),
        longitude: Number(parsed.longitude),
      };
  } catch {}
  return {};
};

function assertDeliveryMember(req) {
  const code = req.restaurantRole;
  const tenantPrefix = `custom_delivery_${req.restaurant.id.replace(/-/g, "").slice(0, 16)}_`;
  if (
    !DEFAULT_DELIVERY_ROLES.has(code) &&
    !(typeof code === "string" && code.startsWith(tenantPrefix))
  ) {
    throw fail(403, "An active delivery employee account is required.");
  }
}

exports.requireDeliveryMember = (req, res, next) => {
  try {
    assertDeliveryMember(req);
    return next();
  } catch (error) {
    return res
      .status(error.status || 403)
      .json({ success: false, message: error.message });
  }
};

exports.getDashboard = async (req, res, next) => {
  try {
    assertDeliveryMember(req);
    const member = await RestaurantMember.findOne({
      where: {
        id: req.restaurantMembership.id,
        restaurantId: req.restaurant.id,
        userId: req.authUser.id,
        status: "active",
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "firstName", "lastName", "email"],
        },
        { model: Role, as: "role", attributes: ["id", "name", "code"] },
      ],
      attributes: [
        "id",
        "employeeId",
        "availabilityStatus",
        "joinedAt",
        "status",
      ],
    });
    if (!member) throw fail(404, "Delivery employee account not found.");
    const assignments = await EmployeeBranchAssignment.findAll({
      where: { restaurantMemberId: member.id, status: "active" },
      attributes: ["branchId"],
      raw: true,
    });
    const branchIds = assignments
      .map((assignment) => assignment.branchId)
      .filter(
        (id) =>
          !req.restaurantBranchIds || req.restaurantBranchIds.includes(id),
      );
    const branches = branchIds.length
      ? await Branch.findAll({
          where: {
            id: { [Op.in]: branchIds },
            restaurantId: req.restaurant.id,
          },
          attributes: ["id", "name"],
          order: [["name", "ASC"]],
        })
      : [];
    const deliveryAssignments = await DeliveryAssignment.findAll({
      where: {
        restaurantId: req.restaurant.id,
        restaurantMemberId: member.id,
        branchId: { [Op.in]: branchIds },
        status: {
          [Op.in]: [
            "pending_acceptance",
            "accepted",
            "arriving_at_restaurant",
            "at_restaurant",
            "rejected",
            "timed_out",
            "picked_up",
            "on_the_way",
            "at_customer",
            "delivered",
            "failed",
            "cancelled",
            "reassigned",
          ],
        },
      },
      include: [
        {
          model: Order,
          as: "order",
          where: { restaurantId: req.restaurant.id, orderType: "delivery" },
          attributes: [
            "id",
            "orderNumber",
            "customerName",
            "customerPhone",
            "deliveryAddress",
            "customerNotes",
            "restaurantNotes",
            "total",
            "paymentMethod",
            "paymentStatus",
            "status",
            "kitchenStatus",
            "createdAt",
          ],
          include: [
            {
              model: OrderItem,
              as: "items",
              attributes: [
                "id",
                "itemName",
                "variantName",
                "addonsSnapshot",
                "quantity",
                "itemNotes",
              ],
            },
          ],
          required: true,
        },
        {
          model: Branch,
          as: "branch",
          where: { restaurantId: req.restaurant.id },
          attributes: [
            "id",
            "name",
            "phone",
            "addressLine",
            "addressLine2",
            "landmark",
            "city",
            "state",
            "postalCode",
            "country",
            "latitude",
            "longitude",
          ],
          required: true,
        },
      ],
      order: [["assignedAt", "DESC"]],
    });
    const restaurantSetting = await DeliverySetting.findOne({ where: { restaurantId: req.restaurant.id, branchId: null } });
    const branchSettings = await DeliverySetting.findAll({ where: { restaurantId: req.restaurant.id, branchId: { [Op.in]: branchIds } } });
    const settingByBranch = new Map(branchSettings.map((setting) => [setting.branchId, setting]));
    const isAssignmentExpired = (attempt) => attempt.status === 'pending_acceptance' && Date.now() - new Date(attempt.assignedAt).getTime() >= ((settingByBranch.get(attempt.branchId)?.acceptanceTimeoutMinutes || restaurantSetting?.acceptanceTimeoutMinutes || 5) * 60_000);
    // Assignment rows are audit attempts. Keep them for history, but expose one
    // current row per order so retries never render as duplicate deliveries.
    const activeStatuses = new Set([
      "pending_acceptance", "accepted", "arriving_at_restaurant", "at_restaurant", "picked_up", "on_the_way", "at_customer",
    ]);
    const attemptsByOrder = new Map();
    for (const attempt of deliveryAssignments) {
      if (!attemptsByOrder.has(attempt.orderId)) attemptsByOrder.set(attempt.orderId, []);
      attemptsByOrder.get(attempt.orderId).push(attempt);
    }
    const visibleAssignments = [];
    const assignmentAttempts = [];
    for (const [orderId, attempts] of attemptsByOrder) {
      attempts.sort((a, b) => new Date(a.assignedAt) - new Date(b.assignedAt));
      const active = attempts.filter((attempt) => activeStatuses.has(attempt.status) && !isAssignmentExpired(attempt));
      // Lock based assignment services should maintain one active row; choose
      // the newest defensively if legacy data contains more than one.
      const current = active.at(-1);
      if (current) visibleAssignments.push(current);
      const newest = attempts.at(-1);
      assignmentAttempts.push({
        orderId,
        orderNumber: attempts[0].order?.orderNumber,
        attempts: attempts.map((attempt) => ({
          id: attempt.id,
          status: isAssignmentExpired(attempt) ? "timed_out" : attempt.status,
          assignedAt: attempt.assignedAt,
          acceptedAt: attempt.acceptedAt,
          completedAt: attempt.completedAt,
          notes: isAssignmentExpired(attempt) ? (attempt.notes || "Acceptance window expired; reassignment is processing.") : attempt.notes,
          statusUpdatedAt: attempt.updatedAt,
          isCurrent: attempt.id === current?.id,
        })),
        currentAssignmentId: current?.id || null,
        updatedAt: newest?.updatedAt || newest?.assignedAt,
      });
    }
    visibleAssignments.sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));
    const currentAssignments = [...visibleAssignments];
    visibleAssignments.splice(30);
    const histories = deliveryAssignments.length
      ? await DeliveryStatusHistory.findAll({
          where: {
            restaurantId: req.restaurant.id,
            assignmentId: {
              [Op.in]: deliveryAssignments.map((assignment) => assignment.id),
            },
            restaurantMemberId: member.id,
          },
          attributes: [
            "id",
            "assignmentId",
            "event",
            "fromStatus",
            "toStatus",
            "notes",
            "createdAt",
          ],
          include: [{ model: User, as: "performer", attributes: ["firstName", "lastName"], required: false }],
          order: [["createdAt", "ASC"]],
        })
      : [];
    const codRows = visibleAssignments.length ? await CodCollection.findAll({
      where: { orderId: { [Op.in]: visibleAssignments.map((assignment) => assignment.orderId) }, restaurantMemberId: member.id },
      order: [["createdAt", "DESC"]],
    }) : [];
    const codByOrder = new Map();
    for (const row of codRows) if (!codByOrder.has(row.orderId)) codByOrder.set(row.orderId, row);
    const historyByAssignment = new Map();
    for (const entry of histories) {
      if (!historyByAssignment.has(entry.assignmentId))
        historyByAssignment.set(entry.assignmentId, []);
      historyByAssignment.get(entry.assignmentId).push(entry);
    }
    for (const group of assignmentAttempts) for (const attempt of group.attempts) attempt.history = historyByAssignment.get(attempt.id) || [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const activeAssignments = currentAssignments.filter((assignment) =>
      activeStatuses.has(assignment.status),
    );
    const locationSharingEnabled =
      ["available", "on_delivery"].includes(member.availabilityStatus) &&
      activeAssignments.some((assignment) => assignment.status !== "pending_acceptance" &&
        Boolean(
          settingByBranch.get(assignment.branchId)?.locationSharingEnabled ??
          restaurantSetting?.locationSharingEnabled,
        ),
      );
    const liveLocations = await DeliveryLocation.count({
      where: {
        restaurantId: req.restaurant.id,
        restaurantMemberId: member.id,
        expiresAt: { [Op.gt]: new Date() },
        assignmentId: {
          [Op.in]: activeAssignments.map((assignment) => assignment.id),
        },
      },
    });
    const cashHandovers = await CashHandover.findAll({
      where: { restaurantId: req.restaurant.id, restaurantMemberId: member.id, branchId: { [Op.in]: branchIds } },
      include: [{ model: Branch, as: "branch", attributes: ["name"] }],
      order: [["submittedAt", "DESC"]],
      limit: 10,
    });
    const collectedCash = await CodCollection.findAll({
      where: { restaurantId: req.restaurant.id, restaurantMemberId: member.id, branchId: { [Op.in]: branchIds }, status: 'collected' },
      include: [{ model: CashHandoverItem, as: 'handoverItems', required: false }, { model: Order, as: 'order', attributes: ['orderNumber'], required: true }],
      order: [['collectedAt', 'ASC']],
    });
    const cashReadyByBranch = branches.map((branch) => {
      const eligible = collectedCash.filter((row) => row.branchId === branch.id && !row.handoverItems?.length);
      return { branchId: branch.id, branchName: branch.name, orders: eligible.map((row) => ({ collectionId: row.id, orderNumber: row.order.orderNumber, amount: Number(row.collectedAmount), collectedAt: row.collectedAt })), totalAmount: eligible.reduce((sum, row) => sum + Number(row.collectedAmount || 0), 0) };
    });
    const orders = visibleAssignments.map((assignment) => {
      const branch = assignment.branch;
      const pickupAddress = formatAddressParts([
        branch.addressLine,
        branch.addressLine2,
        branch.landmark,
        branch.city,
        branch.state,
        branch.postalCode,
        branch.country,
      ]);
      return {
        id: assignment.order.id,
        assignmentId: assignment.id,
        orderNumber: assignment.order.orderNumber,
        customerName: assignment.order.customerName,
        customerPhone: assignment.order.customerPhone,
        deliveryAddress: formatDeliveryAddress(
          assignment.order.deliveryAddress,
        ),
        destination: deliveryAddressCoordinates(
          assignment.order.deliveryAddress,
        ),
        customerNotes: assignment.order.customerNotes,
        restaurantNotes: assignment.order.restaurantNotes,
        orderItems: assignment.order.items,
        orderStatus: assignment.order.status,
        kitchenStatus: assignment.order.kitchenStatus,
        paymentMethod: assignment.order.paymentMethod,
        paymentStatus: assignment.order.paymentStatus,
        codExpectedAmount: assignment.order.paymentMethod === "cash_on_delivery" ? Number(assignment.order.total) : null,
        codCollection: codByOrder.get(assignment.order.id) || null,
        deliveryStatus: assignment.status,
        branch: {
          id: branch.id,
          name: branch.name,
          phone: branch.phone,
          latitude: branch.latitude,
          longitude: branch.longitude,
        },
        pickupAddress,
        assignedAt: assignment.assignedAt,
        acceptedAt: assignment.acceptedAt,
        completedAt: assignment.completedAt,
        history: historyByAssignment.get(assignment.id) || [],
      };
    });
    const counts = {
      today: assignmentAttempts.filter((group) => group.attempts.some((attempt) => new Date(attempt.assignedAt) >= todayStart)).length,
      pendingAcceptance: activeAssignments.filter(
        (assignment) => assignment.status === "pending_acceptance",
      ).length,
      accepted: activeAssignments.filter(
        (assignment) => assignment.status === "accepted",
      ).length,
      awaitingPickup: activeAssignments.filter((assignment) => ["accepted", "arriving_at_restaurant", "at_restaurant"].includes(assignment.status) && assignment.order.status === "ready" && assignment.order.kitchenStatus === "ready").length,
      active: activeAssignments.filter((assignment) =>
        ["accepted", "arriving_at_restaurant", "at_restaurant", "picked_up", "on_the_way", "at_customer"].includes(
          assignment.status,
        ),
      ).length,
      completed: assignmentAttempts.filter((group) =>
        group.attempts.some((attempt) => attempt.status === "delivered"),
      ).length,
    };
    res.json({
      success: true,
      employee: {
        id: member.id,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
        email: member.user.email,
        employeeId: member.employeeId,
        role: member.role.name,
        availabilityStatus: member.availabilityStatus,
        joinedAt: member.joinedAt,
        branches,
        locationSharingEnabled,
        locationSharingActive: liveLocations > 0,
      },
      assignmentsAvailable: true,
      counts,
      deliveries: orders,
      cashHandovers,
      cashReadyByBranch,
      assignmentAttempts: assignmentAttempts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    });
  } catch (error) {
    next(error);
  }
};

exports.updateAvailability = async (req, res, next) => {
  try {
    assertDeliveryMember(req);
    const availabilityStatus = req.body?.availabilityStatus;
    if (!["offline", "available"].includes(availabilityStatus))
      throw fail(400, "Availability must be online or offline.");
    const member = await RestaurantMember.findOne({
      where: {
        id: req.restaurantMembership.id,
        restaurantId: req.restaurant.id,
        userId: req.authUser.id,
        status: "active",
      },
    });
    if (!member) throw fail(404, "Delivery employee account not found.");
    const activeCount = await DeliveryAssignment.count({ where: { restaurantId: req.restaurant.id, restaurantMemberId: member.id, status: { [Op.in]: activeAssignmentStatuses } } });
    if (activeCount > 0 && availabilityStatus === "offline")
      throw fail(
        409,
        "You cannot go offline while an active delivery is in progress.",
      );
    const previous = member.availabilityStatus;
    const nextAvailability = activeCount > 0 ? "on_delivery" : availabilityStatus;
    await member.update({ availabilityStatus: nextAvailability });
    await recordAuditEvent(req, {
      action: "restaurant.delivery_staff.availability_changed",
      entityType: "restaurant_member",
      entityId: member.id,
      beforeData: { availabilityStatus: previous },
      afterData: { availabilityStatus: nextAvailability },
    });
    res.json({ success: true, availabilityStatus: member.availabilityStatus });
  } catch (error) {
    next(error);
  }
};
