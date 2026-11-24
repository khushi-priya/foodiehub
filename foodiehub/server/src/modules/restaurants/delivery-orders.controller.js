const { Op } = require("sequelize");
const crypto = require("node:crypto");
const sequelize = require("../../config/database");
const {
  Order,
  Branch,
  User,
  Role,
  RestaurantMember,
  EmployeeBranchAssignment,
  DeliveryAssignment,
  DeliveryStatusHistory,
  DeliverySetting,
  DeliveryLocation,
  CodCollection,
} = require("../../models");
const { createCustomerNotification } = require("../../services/customer-notifications");
const { createRestaurantNotification } = require("../../services/restaurant-notifications");
const { syncCommissionForOrder } = require("../../services/commission-ledger");
const { deliveryTransition, assertSingleActiveDelivery } = require("../../services/order-workflow");

const fail = (status, message, code, currentStatus = null, requiredStatus = null) => Object.assign(new Error(message), { status, code, currentStatus, requiredStatus });
function deliveryOtpHash(orderId, assignmentId, otp) {
  const secret = process.env.DELIVERY_OTP_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw fail(503, "Delivery OTP is not configured. Set DELIVERY_OTP_SECRET or SESSION_SECRET.");
  return crypto.createHmac("sha256", secret).update(`${orderId}:${assignmentId}:${otp}`).digest("hex");
}
const activeAssignmentStatuses = [
  "pending_acceptance",
  "accepted",
  "arriving_at_restaurant",
  "at_restaurant",
  "picked_up",
  "on_the_way",
  "at_customer",
];
const visibleAssignmentStatuses = [
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
];
const deliveryRoleCodes = [
  "delivery_associate",
  "senior_delivery_associate",
  "delivery_supervisor",
];
const noStaffNoticeSent = new Set();
const validFilters = [
  "pending_assignment",
  "assigned",
  "accepted",
  "arriving_at_restaurant",
  "at_restaurant",
  "preparing",
  "ready_for_pickup",
  "picked_up",
  "on_the_way",
  "at_customer",
  "delivered",
  "failed",
  "cancelled",
];
const reportStatuses = [
  "pending_acceptance",
  "accepted",
  "arriving_at_restaurant",
  "at_restaurant",
  "rejected",
  "picked_up",
  "on_the_way",
  "at_customer",
  "delivered",
  "failed",
  "cancelled",
  "reassigned",
];

function deliveryRoleFilter(restaurantId) {
  const prefix = `custom_delivery_${restaurantId.replace(/-/g, "").slice(0, 16)}_%`;
  return {
    [Op.or]: [
      { code: { [Op.in]: deliveryRoleCodes }, scope: "restaurant" },
      {
        code: { [Op.like]: prefix },
        scope: "restaurant",
        restaurantId,
        isSystem: false,
      },
    ],
  };
}

function assertBranchAccess(req, branchId) {
  if (!branchId)
    throw fail(409, "This order does not have an assigned branch.");
  if (
    req.restaurantBranchIds !== null &&
    !req.restaurantBranchIds.includes(branchId)
  )
    throw fail(403, "You do not have access to this branch.");
}

function orderWhere(req) {
  const where = {
    restaurantId: req.restaurant.id,
    orderType: "delivery",
    deliveryAddress: { [Op.ne]: null },
    branchId: { [Op.ne]: null },
  };
  if (req.restaurantBranchIds !== null)
    where.branchId = { [Op.in]: req.restaurantBranchIds };
  return where;
}

async function latestAssignments(req, orderIds, options = {}) {
  if (!orderIds.length) return new Map();
  const rows = await DeliveryAssignment.findAll({
    where: {
      restaurantId: req.restaurant.id,
      orderId: { [Op.in]: orderIds },
      status: { [Op.in]: visibleAssignmentStatuses },
      ...(options.status ? { status: options.status } : {}),
    },
    include: [
      {
        model: RestaurantMember,
        as: "deliveryEmployee",
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "firstName", "lastName", "phone"],
          },
          { model: Role, as: "role", attributes: ["id", "name", "code"] },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });
  const latest = new Map();
  for (const row of rows) {
    const current = latest.get(row.orderId);
    const rowIsActive = activeAssignmentStatuses.includes(row.status);
    const currentIsActive = current && activeAssignmentStatuses.includes(current.status);
    if (!current || (rowIsActive && !currentIsActive)) latest.set(row.orderId, row);
  }
  return latest;
}

function formatAssignment(assignment) {
  if (!assignment) return null;
  const employee = assignment.deliveryEmployee;
  return {
    id: assignment.id,
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    acceptedAt: assignment.acceptedAt,
    completedAt: assignment.completedAt,
    notes: assignment.notes,
    employee: employee
      ? {
          id: employee.id,
          firstName: employee.user?.firstName,
          lastName: employee.user?.lastName,
          fullName: [employee.user?.firstName, employee.user?.lastName]
            .filter(Boolean)
            .join(" "),
          phone: employee.user?.phone,
          employeeId: employee.employeeId,
          availabilityStatus: employee.availabilityStatus,
          role: employee.role?.name,
        }
      : null,
  };
}

exports.listOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize) || 20),
    );
    const where = orderWhere(req);
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";
    const searchConditions = search
      ? [
          { orderNumber: { [Op.like]: `%${search}%` } },
          { customerName: { [Op.like]: `%${search}%` } },
          { customerPhone: { [Op.like]: `%${search}%` } },
        ]
      : null;
    if (searchConditions) {
      where[Op.or] = searchConditions;
    }
    if (req.query.branchId) {
      assertBranchAccess(req, req.query.branchId);
      where.branchId = req.query.branchId;
    }
    if (req.query.status) {
      if (!validFilters.includes(req.query.status))
        throw fail(400, "Invalid delivery order status filter.");
      const status = req.query.status;
      if (status === "pending_assignment") {
        const assigned = await DeliveryAssignment.findAll({
          where: {
            restaurantId: req.restaurant.id,
            status: {
              [Op.in]: [
                ...activeAssignmentStatuses,
                "delivered",
                "failed",
                "cancelled",
              ],
            },
          },
          attributes: ["orderId"],
          raw: true,
        });
        where.id = {
          [Op.notIn]: [...new Set(assigned.map((entry) => entry.orderId))],
        };
        where.status = "ready";
      } else if (status === "preparing") where.status = "preparing";
      else if (status === "ready_for_pickup") where.status = "ready";
      else if (status === "cancelled") {
        const cancelled = await DeliveryAssignment.findAll({
          where: { restaurantId: req.restaurant.id, status: "cancelled" },
          attributes: ["orderId"],
          raw: true,
        });
        const cancelledCondition = [
          { status: "cancelled" },
          {
            id: {
              [Op.in]: [...new Set(cancelled.map((entry) => entry.orderId))],
            },
          },
        ];
        if (searchConditions) {
          delete where[Op.or];
          where[Op.and] = [
            { [Op.or]: searchConditions },
            { [Op.or]: cancelledCondition },
          ];
        } else where[Op.or] = cancelledCondition;
      } else {
        const assignmentStatus =
          status === "assigned" ? "pending_acceptance" : status;
        const assigned = await DeliveryAssignment.findAll({
          where: { restaurantId: req.restaurant.id, status: assignmentStatus },
          attributes: ["orderId"],
          raw: true,
        });
        where.id = {
          [Op.in]: [...new Set(assigned.map((entry) => entry.orderId))],
        };
      }
    }
    const result = await Order.findAndCountAll({
      where,
      include: [{ model: Branch, as: "branch", attributes: ["id", "name"] }],
      order: [["createdAt", "DESC"]],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true,
    });
    const assignments = await latestAssignments(
      req,
      result.rows.map((order) => order.id),
    );
    const orders = result.rows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      branch: order.branch
        ? { id: order.branch.id, name: order.branch.name }
        : null,
      total: order.total,
      status: order.status,
      deliveryAddress: order.deliveryAddress,
      createdAt: order.createdAt,
      orderType: order.orderType,
      assignment: formatAssignment(assignments.get(order.id)),
    }));
    res.json({
      success: true,
      orders,
      pagination: {
        page,
        pageSize,
        total: result.count,
        totalPages: Math.ceil(result.count / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.listBranches = async (req, res, next) => {
  try {
    const branches = await Branch.findAll({
      where: {
        restaurantId: req.restaurant.id,
        isActive: true,
        ...(req.restaurantBranchIds !== null
          ? { id: { [Op.in]: req.restaurantBranchIds } }
          : {}),
      },
      attributes: [
        "id",
        "name",
        "deliveryEnabled",
        "openingTime",
        "closingTime",
        "workingDays",
        "closedDays",
        "overnight",
        "timeZone",
      ],
      order: [["name", "ASC"]],
    });
    res.json({ success: true, branches });
  } catch (error) {
    next(error);
  }
};

exports.overview = async (req, res, next) => {
  try {
    const ordersWhere = orderWhere(req);
    const assignmentWhere = {
      restaurantId: req.restaurant.id,
      ...(req.restaurantBranchIds !== null
        ? { branchId: { [Op.in]: req.restaurantBranchIds } }
        : {}),
    };
    const [
      totalOrders,
      pendingOrders,
      preparingOrders,
      readyOrders,
      activeAssignmentRows,
      completedAssignmentRows,
      recentAssignments,
    ] = await Promise.all([
      Order.count({ where: ordersWhere }),
      Order.count({
        where: {
          ...ordersWhere,
          status: { [Op.notIn]: ["cancelled", "rejected", "completed"] },
        },
      }),
      Order.count({ where: { ...ordersWhere, status: "preparing" } }),
      Order.count({ where: { ...ordersWhere, status: "ready" } }),
      DeliveryAssignment.findAll({
        where: {
          ...assignmentWhere,
          status: { [Op.in]: activeAssignmentStatuses },
        },
        attributes: ["orderId"],
        raw: true,
      }),
      DeliveryAssignment.findAll({
        where: {
          ...assignmentWhere,
          status: "delivered",
          completedAt: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        attributes: ["orderId"],
        raw: true,
      }),
      DeliveryAssignment.findAll({
        where: assignmentWhere,
        attributes: [
          "id",
          "orderId",
          "branchId",
          "restaurantMemberId",
          "status",
          "assignedAt",
          "completedAt",
        ],
        include: [
          {
            model: Order,
            as: "order",
            where: { restaurantId: req.restaurant.id, orderType: "delivery" },
            attributes: ["orderNumber", "customerName", "total", "status"],
            required: true,
          },
          {
            model: Branch,
            as: "branch",
            where: { restaurantId: req.restaurant.id },
            attributes: ["name"],
            required: true,
          },
          {
            model: RestaurantMember,
            as: "deliveryEmployee",
            where: { restaurantId: req.restaurant.id },
            attributes: ["id"],
            include: [
              {
                model: User,
                as: "user",
                attributes: ["firstName", "lastName"],
                required: true,
              },
            ],
            required: true,
          },
        ],
        order: [["assignedAt", "DESC"]],
        limit: 50,
      }),
    ]);
    const activeAssignments = new Set(activeAssignmentRows.map((row) => row.orderId)).size;
    const completedToday = new Set(completedAssignmentRows.map((row) => row.orderId)).size;
    const recentByOrder = new Map();
    for (const row of recentAssignments) {
      const current = recentByOrder.get(row.orderId);
      if (!current || (activeAssignmentStatuses.includes(row.status) && !activeAssignmentStatuses.includes(current.status))) recentByOrder.set(row.orderId, row);
    }
    res.json({
      success: true,
      counts: {
        totalOrders,
        pendingOrders,
        preparingOrders,
        readyOrders,
        activeAssignments,
        completedToday,
      },
      recentAssignments: [...recentByOrder.values()].slice(0, 10).map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        customerName: row.order.customerName,
        total: row.order.total,
        orderStatus: row.order.status,
        branch: row.branch.name,
        employee: [
          row.deliveryEmployee.user.firstName,
          row.deliveryEmployee.user.lastName,
        ]
          .filter(Boolean)
          .join(" "),
        status: row.status,
        assignedAt: row.assignedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

exports.assignmentHistory = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize) || 20),
    );
    const where = {
      restaurantId: req.restaurant.id,
      ...(req.restaurantBranchIds !== null
        ? { branchId: { [Op.in]: req.restaurantBranchIds } }
        : {}),
    };
    if (req.query.branchId) {
      assertBranchAccess(req, req.query.branchId);
      where.branchId = req.query.branchId;
    }
    if (req.query.employeeId) where.restaurantMemberId = req.query.employeeId;
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    if (search) {
      const pattern = `%${search}%`;
      const [matchingOrders, matchingEmployeesByName, matchingEmployeesByCode] = await Promise.all([
        Order.findAll({ where: { restaurantId: req.restaurant.id, orderType: "delivery", orderNumber: { [Op.like]: pattern } }, attributes: ["id"], raw: true }),
        RestaurantMember.findAll({ where: { restaurantId: req.restaurant.id }, attributes: ["id"], include: [{ model: User, as: "user", attributes: [], required: true, where: { [Op.or]: ["firstName", "lastName", "phone"].map((field) => ({ [field]: { [Op.like]: pattern } })) } }] }),
        RestaurantMember.findAll({ where: { restaurantId: req.restaurant.id, employeeId: { [Op.like]: pattern } }, attributes: ["id"], raw: true }),
      ]);
      const employeeIds = [...new Set([...matchingEmployeesByName, ...matchingEmployeesByCode].map((member) => member.id))];
      where[Op.or] = [
        { orderId: { [Op.in]: matchingOrders.map((order) => order.id) } },
        { restaurantMemberId: { [Op.in]: employeeIds } },
      ];
    }
    if (req.query.status) {
      if (
        ![
          "pending_acceptance",
          ...activeAssignmentStatuses.filter(
            (status) => status !== "pending_acceptance",
          ),
          "delivered",
          "failed",
          "cancelled",
          "rejected",
          "timed_out",
          "reassigned",
        ].includes(req.query.status)
      )
        throw fail(400, "Invalid delivery assignment status.");
      where.status = req.query.status;
    }
    const result = await DeliveryAssignment.findAndCountAll({
      where,
      attributes: [
        "id",
        "orderId",
        "branchId",
        "restaurantMemberId",
        "status",
        "assignedAt",
        "acceptedAt",
        "completedAt",
        "notes",
      ],
      include: [
        {
          model: Order,
          as: "order",
          where: { restaurantId: req.restaurant.id, orderType: "delivery" },
          attributes: ["orderNumber", "customerName", "total", "status"],
          required: true,
        },
        {
          model: Branch,
          as: "branch",
          where: { restaurantId: req.restaurant.id },
          attributes: ["name"],
          required: true,
        },
        {
          model: RestaurantMember,
          as: "deliveryEmployee",
          where: { restaurantId: req.restaurant.id },
          attributes: ["id"],
          include: [
            {
              model: User,
              as: "user",
              attributes: ["firstName", "lastName"],
              required: true,
            },
          ],
          required: true,
        },
      ],
      order: [["assignedAt", "DESC"]],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      distinct: true,
    });
    const assignmentIds = result.rows.map((row) => row.id);
    const statusEvents = assignmentIds.length ? await DeliveryStatusHistory.findAll({
      where: { restaurantId: req.restaurant.id, assignmentId: { [Op.in]: assignmentIds }, event: { [Op.in]: ["picked_up", "delivered"] } },
      attributes: ["assignmentId", "event", "createdAt"],
      order: [["createdAt", "ASC"]],
    }) : [];
    const transitionTimes = new Map();
    for (const event of statusEvents) {
      const current = transitionTimes.get(event.assignmentId) || {};
      if (event.event === "picked_up" && !current.pickedUpAt) current.pickedUpAt = event.createdAt;
      if (event.event === "delivered" && !current.deliveredAt) current.deliveredAt = event.createdAt;
      transitionTimes.set(event.assignmentId, current);
    }
    res.json({
      success: true,
      assignments: result.rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        customerName: row.order.customerName,
        total: row.order.total,
        orderStatus: row.order.status,
        branchId: row.branchId,
        branch: row.branch.name,
        employeeId: row.restaurantMemberId,
        employee: [
          row.deliveryEmployee.user.firstName,
          row.deliveryEmployee.user.lastName,
        ]
          .filter(Boolean)
          .join(" "),
        status: row.status,
        assignedAt: row.assignedAt,
        acceptedAt: row.acceptedAt,
        completedAt: row.completedAt,
        pickedUpAt: transitionTimes.get(row.id)?.pickedUpAt || null,
        deliveredAt: transitionTimes.get(row.id)?.deliveredAt || null,
        notes: row.notes,
      })),
      pagination: {
        page,
        pageSize,
        total: result.count,
        totalPages: Math.ceil(result.count / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.liveLocations = async (req, res, next) => {
  try {
    const where = {
      restaurantId: req.restaurant.id,
      expiresAt: { [Op.gt]: new Date() },
      ...(req.restaurantBranchIds !== null
        ? { branchId: { [Op.in]: req.restaurantBranchIds } }
        : {}),
    };
    if (req.query.branchId) {
      assertBranchAccess(req, req.query.branchId);
      where.branchId = req.query.branchId;
    }
    const points = await DeliveryLocation.findAll({
      where,
      attributes: [
        "id",
        "orderId",
        "assignmentId",
        "branchId",
        "latitude",
        "longitude",
        "accuracyMeters",
        "capturedAt",
        "expiresAt",
      ],
      include: [
        {
          model: DeliveryAssignment,
          as: "assignment",
          where: {
            restaurantId: req.restaurant.id,
            status: { [Op.in]: activeAssignmentStatuses },
          },
          attributes: ["status", "restaurantMemberId"],
          include: [
            {
              model: Order,
              as: "order",
              where: { restaurantId: req.restaurant.id, orderType: "delivery" },
              attributes: ["orderNumber", "customerName"],
              required: true,
            },
            {
              model: Branch,
              as: "branch",
              where: { restaurantId: req.restaurant.id },
              attributes: ["name"],
              required: true,
            },
            {
              model: RestaurantMember,
              as: "deliveryEmployee",
              where: { restaurantId: req.restaurant.id },
              attributes: ["id"],
              include: [
                {
                  model: User,
                  as: "user",
                  attributes: ["firstName", "lastName"],
                  required: true,
                },
              ],
              required: true,
            },
          ],
          required: true,
        },
      ],
      order: [["capturedAt", "DESC"]],
    });
    res.json({
      success: true,
      locations: points.map((point) => ({
        orderId: point.orderId,
        assignmentId: point.assignmentId,
        branchId: point.branchId,
        orderNumber: point.assignment.order.orderNumber,
        customerName: point.assignment.order.customerName,
        branch: point.assignment.branch.name,
        employee: [
          point.assignment.deliveryEmployee.user.firstName,
          point.assignment.deliveryEmployee.user.lastName,
        ]
          .filter(Boolean)
          .join(" "),
        status: point.assignment.status,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        accuracyMeters:
          point.accuracyMeters == null ? null : Number(point.accuracyMeters),
        capturedAt: point.capturedAt,
        expiresAt: point.expiresAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

function reportDateRange(query) {
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const preset = query.period || "last7";
  let start;
  let end;
  if (preset === "today") {
    start = todayStart;
    end = new Date(todayStart.getTime() + 86_400_000);
  } else if (preset === "yesterday") {
    end = todayStart;
    start = new Date(end.getTime() - 86_400_000);
  } else if (preset === "last7" || preset === "last30") {
    end = new Date(todayStart.getTime() + 86_400_000);
    start = new Date(
      todayStart.getTime() - (preset === "last7" ? 6 : 29) * 86_400_000,
    );
  } else if (preset === "custom") {
    const validDay = (value) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    };
    if (!validDay(query.dateFrom) || !validDay(query.dateTo))
      throw fail(400, "Choose valid start and end dates for the custom range.");
    start = new Date(`${query.dateFrom}T00:00:00.000Z`);
    end = new Date(`${query.dateTo}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    if (end <= start)
      throw fail(400, "The end date must be on or after the start date.");
    if (end - start > 366 * 86_400_000)
      throw fail(400, "Custom report ranges cannot exceed 366 days.");
  } else throw fail(400, "Choose today, yesterday, last7, last30, or custom.");
  return { start, end };
}

exports.reports = async (req, res, next) => {
  try {
    const { start, end } = reportDateRange(req.query);
    const where = {
      restaurantId: req.restaurant.id,
      assignedAt: { [Op.gte]: start, [Op.lt]: end },
    };
    if (req.restaurantBranchIds !== null)
      where.branchId = { [Op.in]: req.restaurantBranchIds };
    if (req.query.branchId) {
      assertBranchAccess(req, req.query.branchId);
      where.branchId = req.query.branchId;
    }
    if (req.query.employeeId) where.restaurantMemberId = req.query.employeeId;
    if (req.query.status) {
      if (!reportStatuses.includes(req.query.status))
        throw fail(400, "Invalid delivery status filter.");
      where.status = req.query.status;
    }
    const assignments = await DeliveryAssignment.findAll({
      where,
      attributes: [
        "id",
        "branchId",
        "restaurantMemberId",
        "status",
        "assignedAt",
        "completedAt",
      ],
      include: [
        {
          model: Branch,
          as: "branch",
          where: { restaurantId: req.restaurant.id },
          attributes: ["id", "name"],
          required: true,
        },
        {
          model: RestaurantMember,
          as: "deliveryEmployee",
          where: { restaurantId: req.restaurant.id },
          attributes: ["id"],
          include: [
            {
              model: User,
              as: "user",
              attributes: ["firstName", "lastName"],
              required: true,
            },
          ],
          required: true,
        },
      ],
      order: [["assignedAt", "DESC"]],
    });
    const active = new Set(activeAssignmentStatuses);
    const byEmployee = new Map();
    const byBranch = new Map();
    let completedDurationTotal = 0;
    let completedDurationCount = 0;
    const counts = {
      total: assignments.length,
      pending: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const assignment of assignments) {
      if (assignment.status === "pending_acceptance") counts.pending += 1;
      if (assignment.status === "delivered") counts.completed += 1;
      if (assignment.status === "failed") counts.failed += 1;
      if (assignment.status === "cancelled") counts.cancelled += 1;
      const employee = assignment.deliveryEmployee;
      const name =
        [employee?.user?.firstName, employee?.user?.lastName]
          .filter(Boolean)
          .join(" ") || "Unknown employee";
      const employeeRow = byEmployee.get(employee.id) || {
        employeeId: employee.id,
        name,
        completed: 0,
        active: 0,
        total: 0,
      };
      employeeRow.total += 1;
      if (assignment.status === "delivered") employeeRow.completed += 1;
      if (active.has(assignment.status)) employeeRow.active += 1;
      byEmployee.set(employee.id, employeeRow);
      const branchRow = byBranch.get(assignment.branchId) || {
        branchId: assignment.branchId,
        name: assignment.branch?.name || "Unknown branch",
        total: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };
      branchRow.total += 1;
      if (assignment.status === "delivered") branchRow.completed += 1;
      if (assignment.status === "failed") branchRow.failed += 1;
      if (assignment.status === "cancelled") branchRow.cancelled += 1;
      byBranch.set(assignment.branchId, branchRow);
      if (assignment.status === "delivered" && assignment.completedAt) {
        const duration =
          new Date(assignment.completedAt) - new Date(assignment.assignedAt);
        if (duration >= 0) {
          completedDurationTotal += duration;
          completedDurationCount += 1;
        }
      }
    }
    res.json({
      success: true,
      range: {
        from: start.toISOString(),
        to: new Date(end.getTime() - 1).toISOString(),
        timezone: "UTC",
      },
      counts: {
        ...counts,
        averageAssignmentToCompletionMinutes: completedDurationCount
          ? Math.round(completedDurationTotal / completedDurationCount / 60_000)
          : null,
      },
      employees: [...byEmployee.values()].sort(
        (a, b) => b.completed - a.completed || a.name.localeCompare(b.name),
      ),
      branches: [...byBranch.values()].sort(
        (a, b) => b.completed - a.completed || a.name.localeCompare(b.name),
      ),
      filters: {
        branches: [...byBranch.values()].map(({ branchId, name }) => ({
          id: branchId,
          name,
        })),
        employees: [...byEmployee.values()].map(({ employeeId, name }) => ({
          id: employeeId,
          name,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { ...orderWhere(req), id: req.params.orderId },
      include: [
        { model: Branch, as: "branch", attributes: ["id", "name", "phone"] },
      ],
    });
    if (!order) throw fail(404, "Delivery order not found.");
    assertBranchAccess(req, order.branchId);
    const assignment = await latestAssignments(req, [order.id]);
    const currentAssignment = assignment.get(order.id);
    const deliverySetting =
      (await DeliverySetting.findOne({
        where: { restaurantId: req.restaurant.id, branchId: order.branchId },
      })) ||
      (await DeliverySetting.findOne({
        where: { restaurantId: req.restaurant.id, branchId: null },
      }));
    const locationIsActive =
      currentAssignment &&
      activeAssignmentStatuses.includes(currentAssignment.status) &&
      !["completed", "cancelled", "rejected"].includes(order.status);
    const trackingAuthorized =
      req.restaurantRole === "restaurant_owner" ||
      (req.restaurantGrantedPermissions || []).includes(
        "delivery_tracking.view_branch",
      );
    const liveLocation =
      trackingAuthorized &&
      locationIsActive &&
      deliverySetting?.locationSharingEnabled
        ? await DeliveryLocation.findOne({
            where: {
              restaurantId: req.restaurant.id,
              orderId: order.id,
              assignmentId: currentAssignment.id,
              expiresAt: { [Op.gt]: new Date() },
            },
            attributes: [
              "latitude",
              "longitude",
              "accuracyMeters",
              "capturedAt",
            ],
          })
        : null;
    const history = await DeliveryStatusHistory.findAll({
      where: {
        restaurantId: req.restaurant.id,
        orderId: order.id,
        ...(req.restaurantBranchIds !== null
          ? { branchId: { [Op.in]: req.restaurantBranchIds } }
          : {}),
      },
      include: [
        {
          model: RestaurantMember,
          as: "deliveryEmployee",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["firstName", "lastName", "phone"],
            },
          ],
        },
        {
          model: User,
          as: "performer",
          attributes: ["id", "firstName", "lastName", "phone"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 100,
    });
    res.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        branch: order.branch,
        total: order.total,
        status: order.status,
        deliveryAddress: order.deliveryAddress,
        customerNotes: order.customerNotes,
        createdAt: order.createdAt,
        acceptedAt: order.acceptedAt,
        completedAt: order.completedAt,
        assignment: formatAssignment(currentAssignment),
        liveLocation: liveLocation
          ? {
              latitude: Number(liveLocation.latitude),
              longitude: Number(liveLocation.longitude),
              accuracyMeters:
                liveLocation.accuracyMeters == null
                  ? null
                  : Number(liveLocation.accuracyMeters),
              capturedAt: liveLocation.capturedAt,
            }
          : null,
        history,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.eligibleStaff = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { ...orderWhere(req), id: req.params.orderId },
      attributes: ["id", "branchId", "status"],
    });
    if (!order) throw fail(404, "Delivery order not found.");
    assertBranchAccess(req, order.branchId);
    if (order.status !== "ready" || order.kitchenStatus !== "ready")
      throw fail(409, "Delivery assignment is available after the restaurant marks the order ready.");
    const settings =
      (await DeliverySetting.findOne({
        where: { restaurantId: req.restaurant.id, branchId: order.branchId },
      })) ||
      (await DeliverySetting.findOne({
        where: { restaurantId: req.restaurant.id, branchId: null },
      }));
    const workloadLimit = settings?.maxActiveAssignments || 1;
    const candidates = await RestaurantMember.findAll({
      where: {
        restaurantId: req.restaurant.id,
        status: "active",
        availabilityStatus: { [Op.in]: ["available", "on_delivery"] },
      },
      include: [
        {
          model: User,
          as: "user",
          where: { status: "active" },
          attributes: ["id", "firstName", "lastName", "phone"],
          required: true,
        },
        {
          model: Role,
          as: "role",
          where: deliveryRoleFilter(req.restaurant.id),
          attributes: ["id", "name", "code"],
          required: true,
        },
        {
          model: EmployeeBranchAssignment,
          as: "branchAssignments",
          where: { branchId: order.branchId, status: "active" },
          attributes: ["id"],
          required: true,
        },
      ],
    });
    const activeAssignments = candidates.length
      ? await DeliveryAssignment.findAll({
          where: {
            restaurantId: req.restaurant.id,
            restaurantMemberId: {
              [Op.in]: candidates.map((member) => member.id),
            },
            status: { [Op.in]: activeAssignmentStatuses },
          },
          attributes: ["restaurantMemberId"],
          raw: true,
        })
      : [];
    const workload = new Map();
    for (const assignment of activeAssignments)
      workload.set(
        assignment.restaurantMemberId,
        (workload.get(assignment.restaurantMemberId) || 0) + 1,
      );
    const staff = candidates.map((member) => {
      const currentWorkload = workload.get(member.id) || 0;
      const eligible = currentWorkload < workloadLimit;
      return {
        id: member.id,
        fullName: [member.user.firstName, member.user.lastName]
          .filter(Boolean)
          .join(" "),
        employeeId: member.employeeId,
        role: member.role.name,
        availabilityStatus: member.availabilityStatus,
        currentWorkload,
        workloadLimit,
        eligible,
        ineligibleReason: eligible
          ? null
          : "Employee is at the current workload limit.",
      };
    });
    res.json({ success: true, staff });
  } catch (error) {
    next(error);
  }
};

exports.assignStaff = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const restaurantMemberId = req.body?.restaurantMemberId;
    if (typeof restaurantMemberId !== "string" || !restaurantMemberId)
      throw fail(400, "Choose a delivery employee.");
    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim().slice(0, 1000)
        : "";
    const order = await Order.findOne({
      where: { ...orderWhere(req), id: req.params.orderId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw fail(404, "Delivery order not found.");
    assertBranchAccess(req, order.branchId);
    if (["cancelled", "rejected", "completed"].includes(order.status))
      throw fail(409, "This order cannot receive a delivery assignment.");
    if (order.status !== "ready" || order.kitchenStatus !== "ready")
      throw fail(409, "Delivery assignment is available after the restaurant marks the order ready.");
    const activeCurrentRows = await DeliveryAssignment.findAll({
      where: {
        restaurantId: req.restaurant.id,
        orderId: order.id,
        status: { [Op.in]: activeAssignmentStatuses },
      },
      order: [["createdAt", "DESC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const current = activeCurrentRows[0] || null;
    const granted = new Set(req.restaurantGrantedPermissions || []);
    if (current && !granted.has("delivery_assignments.reassign"))
      throw fail(403, "You cannot reassign this delivery order.");
    if (!current && !granted.has("delivery_assignments.create"))
      throw fail(403, "You cannot assign delivery orders.");
    if (current?.restaurantMemberId === restaurantMemberId)
      throw fail(409, "This employee is already assigned to the order.");
    const staff = await RestaurantMember.findOne({
      where: {
        id: restaurantMemberId,
        restaurantId: req.restaurant.id,
        status: "active",
        availabilityStatus: { [Op.in]: ["available", "on_delivery"] },
      },
      include: [
        {
          model: User,
          as: "user",
          where: { status: "active" },
          attributes: ["id"],
          required: true,
        },
        {
          model: Role,
          as: "role",
          where: deliveryRoleFilter(req.restaurant.id),
          attributes: ["id", "code"],
          required: true,
        },
        {
          model: EmployeeBranchAssignment,
          as: "branchAssignments",
          where: { branchId: order.branchId, status: "active" },
          attributes: ["id"],
          required: true,
        },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!staff)
      throw fail(
        400,
        "Choose an active delivery employee assigned to this order’s branch.",
      );
    const settings =
      (await DeliverySetting.findOne({
        where: { restaurantId: req.restaurant.id, branchId: order.branchId },
        transaction,
      })) ||
      (await DeliverySetting.findOne({
        where: { restaurantId: req.restaurant.id, branchId: null },
        transaction,
      }));
    if (!req.automaticAssignment && settings?.manualAssignmentEnabled === false)
      throw fail(
        409,
        "Manual delivery assignment is disabled for this branch.",
      );
    const workload = await DeliveryAssignment.count({
      where: {
        restaurantId: req.restaurant.id,
        restaurantMemberId: staff.id,
        status: { [Op.in]: activeAssignmentStatuses },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (workload >= (settings?.maxActiveAssignments || 1))
      throw fail(
        409,
        "This employee has reached the active delivery workload limit.",
      );
    const now = new Date();
    if (current) {
      for (const prior of activeCurrentRows) {
      const oldStatus = prior.status;
      await prior.update(
        {
          status: "reassigned",
          notes: reason || "Manually reassigned by restaurant staff.",
        },
        { transaction },
      );
      await DeliveryLocation.destroy({
        where: { assignmentId: prior.id },
        transaction,
      });
      const remaining = await DeliveryAssignment.count({
        where: {
          restaurantId: req.restaurant.id,
          restaurantMemberId: prior.restaurantMemberId,
          id: { [Op.ne]: prior.id },
          status: { [Op.in]: activeAssignmentStatuses },
        },
        transaction,
      });
      await RestaurantMember.update(
        { availabilityStatus: remaining ? "on_delivery" : "available" },
        {
          where: {
            id: prior.restaurantMemberId,
            restaurantId: req.restaurant.id,
          },
          transaction,
        },
      );
      await DeliveryStatusHistory.create(
        {
          restaurantId: req.restaurant.id,
          branchId: order.branchId,
          orderId: order.id,
          assignmentId: prior.id,
          restaurantMemberId: prior.restaurantMemberId,
          performedByUserId: req.authUser.id,
          event: "reassigned",
          fromStatus: oldStatus,
          toStatus: "reassigned",
          notes: reason || "Manually reassigned by restaurant staff.",
        },
        { transaction },
      );
      }
    }
    const assignment = await DeliveryAssignment.create(
      {
        restaurantId: req.restaurant.id,
        branchId: order.branchId,
        orderId: order.id,
        restaurantMemberId: staff.id,
        assignedByUserId: req.authUser.id,
        status: "pending_acceptance",
        assignedAt: now,
      },
      { transaction },
    );
    await staff.update({ availabilityStatus: "on_delivery" }, { transaction });
    await DeliveryStatusHistory.create(
      {
        restaurantId: req.restaurant.id,
        branchId: order.branchId,
        orderId: order.id,
        assignmentId: assignment.id,
        restaurantMemberId: staff.id,
        performedByUserId: req.authUser.id,
        event: current ? "reassigned_to_employee" : "assigned",
        fromStatus: null,
        toStatus: "pending_acceptance",
        notes: current
          ? reason || "Manually reassigned by restaurant staff."
          : null,
      },
      { transaction },
    );
    await transaction.commit();
    if (order.customerId) await createCustomerNotification({ app: req.app, customerId: order.customerId, category: "delivery", title: "Delivery update", message: `Delivery for order ${order.orderNumber} is pending courier acceptance.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `delivery:${assignment.id}:pending_acceptance` });
    await createRestaurantNotification({ app: req.app, restaurantId: order.restaurantId, branchId: order.branchId, category: 'delivery', title: 'Delivery associate assigned', message: `A delivery associate was assigned to order ${order.orderNumber}.`, href: `/restaurant/delivery/orders?search=${encodeURIComponent(order.orderNumber)}`, entityId: order.id, dedupeKey: `delivery:${assignment.id}:pending_acceptance` });
    const io = req.app.get("io");
    if (io) {
      io.to(`delivery:${req.restaurant.id}:${order.branchId}`).emit(
        "delivery:assignment-updated",
        {
          orderId: order.id,
          assignmentId: assignment.id,
          status: "pending_acceptance",
        },
      );
      io.to(`delivery-employee:${req.restaurant.id}:${staff.id}`).emit(
        "delivery:assignment-updated",
        {
          orderId: order.id,
          assignmentId: assignment.id,
          status: "pending_acceptance",
        },
      );
      for (const prior of activeCurrentRows) io.to(`delivery-employee:${req.restaurant.id}:${prior.restaurantMemberId}`).emit("delivery:assignment-updated", { orderId: order.id, assignmentId: prior.id, status: "reassigned" });
      io.to(`customer:${order.customerId}`).emit("delivery:customer-updated", {
        orderId: order.id,
        status: "pending_acceptance",
      });
    }
    const saved = await DeliveryAssignment.findByPk(assignment.id, {
      include: [
        {
          model: RestaurantMember,
          as: "deliveryEmployee",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["firstName", "lastName", "phone"],
            },
            { model: Role, as: "role", attributes: ["name"] },
          ],
        },
      ],
    });
    res
      .status(current ? 200 : 201)
      .json({ success: true, assignment: formatAssignment(saved) });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
};

exports.updateAssignment = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  const competingAssignments = [];
  try {
    const unlockedAssignment = await DeliveryAssignment.findOne({
      where: {
        id: req.params.assignmentId,
        restaurantId: req.restaurant.id,
        status: { [Op.in]: activeAssignmentStatuses },
      },
      attributes: ["id", "orderId"],
    });
    if (!unlockedAssignment) throw fail(404, "Active delivery assignment not found.");
    const lockedOrder = await Order.findOne({
      where: { id: unlockedAssignment.orderId, restaurantId: req.restaurant.id, orderType: "delivery" },
      attributes: ["id", "customerId", "status", "orderNumber", "kitchenStatus", "paymentMethod", "paymentStatus", "total", "deliveryOtpHash", "deliveryOtpExpiresAt"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lockedOrder) throw fail(404, "Delivery order not found.");
    const assignment = await DeliveryAssignment.findOne({
      where: { id: unlockedAssignment.id, restaurantId: req.restaurant.id, orderId: lockedOrder.id, status: { [Op.in]: activeAssignmentStatuses } },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!assignment) throw fail(404, "Active delivery assignment not found.");
    assertBranchAccess(req, assignment.branchId);
    const action = req.body?.action;
    const orderForTracking = lockedOrder;
    if (["cancelled", "rejected", "completed"].includes(orderForTracking.status))
      throw fail(409, "The restaurant order is no longer active.");
    const granted = new Set(req.restaurantGrantedPermissions || []);
    const transition = deliveryTransition(action);
    if (
      !transition ||
      !(Array.isArray(transition.from)
        ? transition.from.includes(assignment.status)
        : assignment.status === transition.from)
    ) {
      const requiredStatus = Array.isArray(transition?.from) ? transition.from.join(" or ") : transition?.from || null;
      const blockedMessages = {
        picked_up: "This order is not ready for pickup yet. Reach the restaurant, wait for kitchen readiness, and confirm restaurant handover first.",
        on_the_way: "Confirm order pickup before starting delivery.",
        at_customer: "Start the delivery before confirming arrival at the customer.",
        delivered: "Delivery cannot be completed before the delivery process reaches the customer.",
      };
      throw fail(409, blockedMessages[action] || "This delivery action is not available for the current status. Refresh your assignments and complete the next step first.", "INVALID_DELIVERY_TRANSITION", assignment.status, requiredStatus);
    }
    if (!granted.has(transition.permission))
      throw fail(403, "Your role cannot perform this delivery action.");
    if (req.restaurantMembership.id !== assignment.restaurantMemberId)
      throw fail(403, "This assignment belongs to another delivery employee.");
    if (action === "accept") {
      const setting = await DeliverySetting.findOne({ where: { restaurantId: assignment.restaurantId, branchId: assignment.branchId }, transaction }) || await DeliverySetting.findOne({ where: { restaurantId: assignment.restaurantId, branchId: null }, transaction });
      const timeoutMs = (setting?.acceptanceTimeoutMinutes || 5) * 60_000;
      if (Date.now() - new Date(assignment.assignedAt).getTime() >= timeoutMs) throw fail(409, "This assignment is no longer active. Please refresh your assignments.");
      const otherActive = await DeliveryAssignment.findAll({ where: { orderId: lockedOrder.id, restaurantId: req.restaurant.id, id: { [Op.ne]: assignment.id }, status: { [Op.in]: activeAssignmentStatuses } }, transaction, lock: transaction.LOCK.UPDATE });
      const competing = assertSingleActiveDelivery(otherActive);
      competingAssignments.push(...competing.map((other) => ({ id: other.id, memberId: other.restaurantMemberId, assignment: other })));
    }
    if (
      ["failed", "reject"].includes(action) &&
      !(typeof req.body?.reason === "string" && req.body.reason.trim())
    )
      throw fail(400, "A reason is required to reject or fail a delivery.");
    if (action === "delivered" && req.body?.confirmation !== true)
      throw fail(
        400,
        "Confirm that the order was handed to the customer before completing delivery.",
      );
    if (action === "picked_up") {
      if (orderForTracking.status !== "ready" || orderForTracking.kitchenStatus !== "handed_over")
        throw fail(
          409,
          "This order is not ready for pickup yet. Please wait for kitchen readiness and restaurant handover confirmation.",
        );
    }
    if (action === "delivered") {
      const suppliedOtp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
      if (!/^\d{6}$/.test(suppliedOtp) || !orderForTracking.deliveryOtpHash || !orderForTracking.deliveryOtpExpiresAt || new Date(orderForTracking.deliveryOtpExpiresAt) <= new Date()) throw fail(409, "Delivery confirmation is incomplete. Verify the current six-digit customer delivery OTP.");
      const submittedHash = Buffer.from(deliveryOtpHash(orderForTracking.id, assignment.id, suppliedOtp), "hex");
      const storedHash = Buffer.from(orderForTracking.deliveryOtpHash, "hex");
      if (submittedHash.length !== storedHash.length || !crypto.timingSafeEqual(submittedHash, storedHash)) throw fail(400, "That delivery OTP is incorrect. Ask the customer for the current code.");
      if (orderForTracking.paymentMethod === "cash_on_delivery") {
        const collection = await CodCollection.findOne({ where: { orderId: orderForTracking.id, restaurantMemberId: assignment.restaurantMemberId }, order: [["createdAt", "DESC"]], transaction, lock: transaction.LOCK.UPDATE });
        if (!collection || !(["collected", "reconciled"].includes(collection.status) || (collection.status === "collection_failed" && collection.resolutionStatus === "resolved"))) throw fail(409, "Confirm COD collection, or ask authorized restaurant staff to resolve the failed collection, before completing delivery.");
      }
    }
    if (action === "on_the_way" && orderForTracking.status !== "picked_up")
      throw fail(409, "Confirm physical pickup before starting delivery.");
    const fromStatus = assignment.status;
    const now = new Date();
    const reason =
      typeof req.body?.reason === "string"
        ? req.body.reason.trim().slice(0, 1000)
        : null;
    let otpForCustomer = null;
    const assignmentUpdate = {
        status: transition.to,
        ...(reason ? { notes: reason } : {}),
        ...(action === "accept" ? { acceptedAt: now } : {}),
        ...(["delivered", "failed"].includes(action) ? { completedAt: now } : {}),
      };
    if (action === "on_the_way") {
      otpForCustomer = String(crypto.randomInt(100000, 1000000));
      await lockedOrder.update({ deliveryOtpHash: deliveryOtpHash(lockedOrder.id, assignment.id, otpForCustomer), deliveryOtpExpiresAt: new Date(now.getTime() + 30 * 60_000), status: "out_for_delivery" }, { transaction });
    }
    if (action === "picked_up") {
      await lockedOrder.update({ status: "picked_up" }, { transaction });
    }
    if (action === "delivered") await lockedOrder.update({ status: "completed", completedAt: now, deliveryOtpHash: null, deliveryOtpExpiresAt: null }, { transaction });
    await assignment.update(
      assignmentUpdate,
      { transaction },
    );
    if (action === "accept") {
      for (const competing of competingAssignments) {
        const other = competing.assignment;
        await other.update({ status: "reassigned", notes: "Closed because another associate accepted this order." }, { transaction });
        await DeliveryStatusHistory.create({ restaurantId: req.restaurant.id, branchId: other.branchId, orderId: other.orderId, assignmentId: other.id, restaurantMemberId: other.restaurantMemberId, performedByUserId: req.authUser.id, event: "competing_assignment_closed", fromStatus: "pending_acceptance", toStatus: "reassigned", notes: "Another associate accepted the order." }, { transaction });
        const remainingForOther = await DeliveryAssignment.count({ where: { restaurantId: other.restaurantId, restaurantMemberId: other.restaurantMemberId, status: { [Op.in]: activeAssignmentStatuses } }, transaction });
        await RestaurantMember.update({ availabilityStatus: remainingForOther ? "on_delivery" : "available" }, { where: { id: other.restaurantMemberId, restaurantId: other.restaurantId }, transaction });
      }
    }
    await DeliveryStatusHistory.create(
      {
        restaurantId: req.restaurant.id,
        branchId: assignment.branchId,
        orderId: assignment.orderId,
        assignmentId: assignment.id,
        restaurantMemberId: assignment.restaurantMemberId,
        performedByUserId: req.authUser.id,
        event: action === "reject" ? "rejected" : action,
        fromStatus,
        toStatus: transition.to,
        notes: reason,
      },
      { transaction },
    );
    if (["reject", "delivered", "failed"].includes(action)) {
      await DeliveryLocation.destroy({
        where: { assignmentId: assignment.id },
        transaction,
      });
      const remaining = await DeliveryAssignment.count({
        where: {
          restaurantId: req.restaurant.id,
          restaurantMemberId: assignment.restaurantMemberId,
          status: { [Op.in]: activeAssignmentStatuses },
        },
        transaction,
      });
      await RestaurantMember.update(
        { availabilityStatus: remaining ? "on_delivery" : "available" },
        {
          where: {
            id: assignment.restaurantMemberId,
            restaurantId: req.restaurant.id,
          },
          transaction,
        },
      );
    }
    if (action === "delivered") await syncCommissionForOrder({ id: assignment.orderId, status: "completed", completedAt: now }, transaction);
    if (orderForTracking.customerId) {
      const deliveryLabels = { accepted: "Courier accepted your order", arriving_at_restaurant: "Courier is arriving at the restaurant", at_restaurant: "Courier reached the restaurant", picked_up: "Your order has been picked up", on_the_way: "Your order is on its way", at_customer: "Your delivery partner reached you", delivered: "Your order was delivered", failed: "Delivery could not be completed", rejected: "Courier declined the delivery" };
      const message = otpForCustomer ? `Delivery for order ${orderForTracking.orderNumber} is on the way. Share OTP ${otpForCustomer} with your delivery partner only after receiving your order.` : `Delivery for order ${orderForTracking.orderNumber} is ${transition.to.replaceAll("_", " ")}.`;
      await createCustomerNotification({ app: req.app, customerId: orderForTracking.customerId, category: "delivery", title: deliveryLabels[transition.to] || "Delivery update", message, href: `/customer/orders/${assignment.orderId}`, entityId: assignment.orderId, dedupeKey: `delivery:${assignment.id}:${transition.to}`, transaction });
    }
    const restaurantDeliveryLabels = { accepted: 'Delivery associate accepted assignment', arriving_at_restaurant: 'Delivery associate is arriving', at_restaurant: 'Delivery associate arrived', picked_up: 'Order picked up', on_the_way: 'Delivery started', at_customer: 'Delivery associate arrived at customer', delivered: 'Delivery completed', failed: 'Delivery failed', rejected: 'Delivery assignment declined' };
    await createRestaurantNotification({ app: req.app, restaurantId: assignment.restaurantId, branchId: assignment.branchId, category: 'delivery', title: restaurantDeliveryLabels[transition.to] || 'Delivery updated', message: `Order ${orderForTracking.orderNumber}: ${restaurantDeliveryLabels[transition.to] || transition.to.replaceAll('_', ' ')}.`, href: `/restaurant/delivery/orders?search=${encodeURIComponent(orderForTracking.orderNumber)}`, entityId: assignment.orderId, dedupeKey: `delivery:${assignment.id}:${transition.to}`, transaction });
    await transaction.commit();
    const io = req.app.get("io");
    if (io) {
      io.to(`delivery:${req.restaurant.id}:${assignment.branchId}`).emit(
        "delivery:assignment-updated",
        {
          orderId: assignment.orderId,
          assignmentId: assignment.id,
          status: transition.to,
        },
      );
      io.to(
        `delivery-employee:${req.restaurant.id}:${assignment.restaurantMemberId}`,
      ).emit("delivery:assignment-updated", {
        orderId: assignment.orderId,
        assignmentId: assignment.id,
        status: transition.to,
      });
      for (const competing of competingAssignments) io.to(`delivery-employee:${req.restaurant.id}:${competing.memberId}`).emit("delivery:assignment-updated", { orderId: assignment.orderId, assignmentId: competing.id, status: "reassigned" });
    }
    if (io)
      io.to(`customer:${orderForTracking.customerId}`).emit(
        "delivery:customer-updated",
        { orderId: assignment.orderId, status: transition.to },
      );
    res.json({ success: true, status: transition.to });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
};

exports.getSettings = async (req, res, next) => {
  try {
    const branchId = req.query.branchId || null;
    if (branchId) {
      assertBranchAccess(req, branchId);
      if (
        !(await Branch.findOne({
          where: { id: branchId, restaurantId: req.restaurant.id },
          attributes: ["id"],
        }))
      )
        throw fail(404, "Branch not found.");
    }
    const settings = await DeliverySetting.findOne({
      where: { restaurantId: req.restaurant.id, branchId },
    });
    res.json({
      success: true,
      settings: settings || {
        branchId,
        manualAssignmentEnabled: true,
        automaticAssignmentEnabled: false,
        maxActiveAssignments: 1,
        acceptanceTimeoutMinutes: 5,
        locationSharingEnabled: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const branchId = req.body?.branchId || null;
    if (!branchId && req.restaurantBranchIds !== null)
      throw fail(
        403,
        "Select one of your assigned branches before changing delivery settings.",
      );
    if (branchId) {
      assertBranchAccess(req, branchId);
      if (
        !(await Branch.findOne({
          where: { id: branchId, restaurantId: req.restaurant.id },
          attributes: ["id"],
        }))
      )
        throw fail(404, "Branch not found.");
    }
    const maxActiveAssignments = Number(req.body?.maxActiveAssignments ?? 1);
    const acceptanceTimeoutMinutes = Number(
      req.body?.acceptanceTimeoutMinutes ?? 5,
    );
    if (
      !Number.isInteger(maxActiveAssignments) ||
      maxActiveAssignments < 1 ||
      maxActiveAssignments > 10
    )
      throw fail(400, "Maximum active assignments must be between 1 and 10.");
    if (
      !Number.isInteger(acceptanceTimeoutMinutes) ||
      acceptanceTimeoutMinutes < 1 ||
      acceptanceTimeoutMinutes > 120
    )
      throw fail(400, "Acceptance timeout must be between 1 and 120 minutes.");
    for (const key of [
      "manualAssignmentEnabled",
      "automaticAssignmentEnabled",
      "locationSharingEnabled",
    ]) {
      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, key) &&
        typeof req.body[key] !== "boolean"
      )
        throw fail(400, `${key} must be true or false.`);
    }
    const [settings] = await DeliverySetting.findOrCreate({
      where: { restaurantId: req.restaurant.id, branchId },
      defaults: { restaurantId: req.restaurant.id, branchId },
    });
    const changes = {};
    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        "manualAssignmentEnabled",
      )
    )
      changes.manualAssignmentEnabled = req.body.manualAssignmentEnabled;
    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        "automaticAssignmentEnabled",
      )
    )
      changes.automaticAssignmentEnabled = Boolean(
        req.body.automaticAssignmentEnabled,
      );
    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        "maxActiveAssignments",
      )
    )
      changes.maxActiveAssignments = maxActiveAssignments;
    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        "acceptanceTimeoutMinutes",
      )
    )
      changes.acceptanceTimeoutMinutes = acceptanceTimeoutMinutes;
    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        "locationSharingEnabled",
      )
    )
      changes.locationSharingEnabled = Boolean(req.body.locationSharingEnabled);
    await settings.update(changes);
    if (changes.locationSharingEnabled === false) {
      const locations = await DeliveryLocation.findAll({
        where: {
          restaurantId: req.restaurant.id,
          ...(branchId ? { branchId } : {}),
        },
      });
      const io = req.app.get("io");
      for (const location of locations) {
        if (!branchId) {
          const branchOverride = await DeliverySetting.findOne({
            where: {
              restaurantId: req.restaurant.id,
              branchId: location.branchId,
            },
          });
          if (branchOverride?.locationSharingEnabled) continue;
        }
        const order = await Order.findByPk(location.orderId, {
          attributes: ["customerId"],
        });
        if (io && order)
          io.to(`customer:${order.customerId}`).emit(
            "delivery:location-cleared",
            { orderId: location.orderId },
          );
        if (io)
          io.to(
            `delivery-tracking:${req.restaurant.id}:${location.branchId}`,
          ).emit("delivery:location-cleared", {
            orderId: location.orderId,
            assignmentId: location.assignmentId,
          });
        if (io)
          io.to(
            `delivery-employee:${req.restaurant.id}:${location.restaurantMemberId}`,
          ).emit("delivery:location-cleared", {
            orderId: location.orderId,
            assignmentId: location.assignmentId,
          });
      }
      const allowedToDelete = [];
      for (const location of locations) {
        if (branchId) allowedToDelete.push(location.id);
        else {
          const branchOverride = await DeliverySetting.findOne({
            where: {
              restaurantId: req.restaurant.id,
              branchId: location.branchId,
            },
          });
          if (!branchOverride?.locationSharingEnabled)
            allowedToDelete.push(location.id);
        }
      }
      if (allowedToDelete.length)
        await DeliveryLocation.destroy({
          where: {
            id: { [Op.in]: allowedToDelete },
            restaurantId: req.restaurant.id,
          },
        });
    }
    res.json({ success: true, settings });
  } catch (error) {
    next(error);
  }
};

exports.autoAssign = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { ...orderWhere(req), id: req.params.orderId },
      attributes: ["id", "branchId"],
    });
    if (!order) throw fail(404, "Delivery order not found.");
    assertBranchAccess(req, order.branchId);
    const settings =
      (await DeliverySetting.findOne({
        where: { restaurantId: req.restaurant.id, branchId: order.branchId },
      })) ||
      (await DeliverySetting.findOne({
        where: { restaurantId: req.restaurant.id, branchId: null },
      }));
    if (!settings?.automaticAssignmentEnabled)
      throw fail(409, "Automatic assignment is disabled for this branch.");
    const candidates = await RestaurantMember.findAll({
      where: {
        restaurantId: req.restaurant.id,
        status: "active",
        availabilityStatus: { [Op.in]: ["available", "on_delivery"] },
      },
      include: [
        {
          model: User,
          as: "user",
          where: { status: "active" },
          attributes: ["id"],
          required: true,
        },
        {
          model: Role,
          as: "role",
          where: deliveryRoleFilter(req.restaurant.id),
          attributes: ["id"],
          required: true,
        },
        {
          model: EmployeeBranchAssignment,
          as: "branchAssignments",
          where: { branchId: order.branchId, status: "active" },
          attributes: ["id"],
          required: true,
        },
      ],
    });
    const active = candidates.length
      ? await DeliveryAssignment.findAll({
          where: {
            restaurantId: req.restaurant.id,
            restaurantMemberId: { [Op.in]: candidates.map((item) => item.id) },
            status: { [Op.in]: activeAssignmentStatuses },
          },
          attributes: ["restaurantMemberId"],
          raw: true,
        })
      : [];
    const counts = new Map();
    for (const assignment of active)
      counts.set(
        assignment.restaurantMemberId,
        (counts.get(assignment.restaurantMemberId) || 0) + 1,
      );
    const available = candidates
      .filter(
        (member) =>
          (counts.get(member.id) || 0) < settings.maxActiveAssignments,
      )
      .sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0));
    if (!available.length) {
      const io = req.app.get("io");
      if (io)
        io.to(`delivery:${req.restaurant.id}:${order.branchId}`).emit(
          "delivery:no-eligible-staff",
          { orderId: order.id, branchId: order.branchId },
        );
      return res
        .status(200)
        .json({
          success: true,
          assigned: false,
          message:
            "No eligible delivery employee is available. The order remains pending assignment.",
        });
    }
    req.body = { restaurantMemberId: available[0].id };
    req.automaticAssignment = true;
    return exports.assignStaff(req, res, next);
  } catch (error) {
    next(error);
  }
};

exports.processTimedOutAssignments = async (io) => {
  const expiredLocations = await DeliveryLocation.findAll({
    where: { expiresAt: { [Op.lte]: new Date() } },
    limit: 500,
  });
  for (const location of expiredLocations) {
    const order = await Order.findByPk(location.orderId, {
      attributes: ["customerId"],
    });
    if (io && order)
      io.to(`customer:${order.customerId}`).emit("delivery:location-cleared", {
        orderId: location.orderId,
      });
    if (io)
      io.to(
        `delivery-tracking:${location.restaurantId}:${location.branchId}`,
      ).emit("delivery:location-cleared", {
        orderId: location.orderId,
        assignmentId: location.assignmentId,
      });
  }
  if (expiredLocations.length)
    await DeliveryLocation.destroy({
      where: {
        id: { [Op.in]: expiredLocations.map((location) => location.id) },
      },
    });
  const overdue = await DeliveryAssignment.findAll({
    where: { status: "pending_acceptance" },
    order: [["assignedAt", "ASC"]],
    limit: 100,
  });
  for (const item of overdue) {
    const settings =
      (await DeliverySetting.findOne({
        where: { restaurantId: item.restaurantId, branchId: item.branchId },
      })) ||
      (await DeliverySetting.findOne({
        where: { restaurantId: item.restaurantId, branchId: null },
      }));
    const timeout = settings?.acceptanceTimeoutMinutes || 5;
    if (Date.now() - new Date(item.assignedAt).getTime() < timeout * 60_000)
      continue;
    const transaction = await sequelize.transaction();
    try {
      const lockedOrder = await Order.findOne({ where: { id: item.orderId, restaurantId: item.restaurantId, orderType: "delivery" }, transaction, lock: transaction.LOCK.UPDATE });
      const assignment = await DeliveryAssignment.findOne({ where: { id: item.id, orderId: item.orderId, restaurantId: item.restaurantId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        !assignment ||
        assignment.status !== "pending_acceptance" ||
        Date.now() - new Date(assignment.assignedAt).getTime() <
          timeout * 60_000
      ) {
        await transaction.rollback();
        continue;
      }
      if (!lockedOrder || lockedOrder.status !== "ready" || lockedOrder.kitchenStatus !== "ready") {
        const fromStatus = assignment.status;
        await assignment.update({ status: "cancelled", notes: "Assignment closed because the order is no longer eligible for delivery." }, { transaction });
        await DeliveryStatusHistory.create({ restaurantId: assignment.restaurantId, branchId: assignment.branchId, orderId: assignment.orderId, assignmentId: assignment.id, restaurantMemberId: assignment.restaurantMemberId, performedByUserId: assignment.assignedByUserId, event: "assignment_closed_order_unavailable", fromStatus, toStatus: "cancelled", notes: assignment.notes }, { transaction });
        await transaction.commit();
        continue;
      }
      const otherActive = await DeliveryAssignment.findOne({ where: { orderId: assignment.orderId, restaurantId: assignment.restaurantId, id: { [Op.ne]: assignment.id }, status: { [Op.in]: activeAssignmentStatuses } }, transaction, lock: transaction.LOCK.UPDATE });
      if (otherActive) {
        const fromStatus = assignment.status;
        await assignment.update({ status: "reassigned", notes: "Closed because another valid assignment already exists for this order." }, { transaction });
        await DeliveryStatusHistory.create({ restaurantId: assignment.restaurantId, branchId: assignment.branchId, orderId: assignment.orderId, assignmentId: assignment.id, restaurantMemberId: assignment.restaurantMemberId, performedByUserId: assignment.assignedByUserId, event: "competing_assignment_closed", fromStatus, toStatus: "reassigned", notes: assignment.notes }, { transaction });
        const remaining = await DeliveryAssignment.count({ where: { restaurantId: assignment.restaurantId, restaurantMemberId: assignment.restaurantMemberId, status: { [Op.in]: activeAssignmentStatuses } }, transaction });
        await RestaurantMember.update({ availabilityStatus: remaining ? "on_delivery" : "available" }, { where: { id: assignment.restaurantMemberId, restaurantId: assignment.restaurantId }, transaction });
        await transaction.commit();
        continue;
      }
      const candidates = await RestaurantMember.findAll({
        where: {
          restaurantId: assignment.restaurantId,
          status: "active",
          availabilityStatus: { [Op.in]: ["available", "on_delivery"] },
          id: { [Op.ne]: assignment.restaurantMemberId },
        },
        include: [
          {
            model: User,
            as: "user",
            where: { status: "active" },
            attributes: ["id"],
            required: true,
          },
          {
            model: Role,
            as: "role",
            where: deliveryRoleFilter(assignment.restaurantId),
            attributes: ["id"],
            required: true,
          },
          {
            model: EmployeeBranchAssignment,
            as: "branchAssignments",
            where: { branchId: assignment.branchId, status: "active" },
            attributes: ["id"],
            required: true,
          },
        ],
        transaction,
      });
      const active = candidates.length
        ? await DeliveryAssignment.findAll({
            where: {
              restaurantId: assignment.restaurantId,
              restaurantMemberId: {
                [Op.in]: candidates.map((member) => member.id),
              },
              status: { [Op.in]: activeAssignmentStatuses },
            },
            attributes: ["restaurantMemberId"],
            raw: true,
            transaction,
          })
        : [];
      const counts = new Map();
      active.forEach((row) =>
        counts.set(
          row.restaurantMemberId,
          (counts.get(row.restaurantMemberId) || 0) + 1,
        ),
      );
      const target = candidates
        .filter(
          (member) =>
            (counts.get(member.id) || 0) <
            (settings?.maxActiveAssignments || 1),
        )
        .sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0))[0];
      const fromStatus = assignment.status;
      const actorId = assignment.assignedByUserId;
      await assignment.update(
        {
          status: target ? "reassigned" : "timed_out",
          notes: target
            ? "Reassigned after acceptance timeout."
            : "Timed out; no eligible employee was available.",
        },
        { transaction },
      );
      await DeliveryLocation.destroy({
        where: { assignmentId: assignment.id },
        transaction,
      });
      const remaining = await DeliveryAssignment.count({
        where: {
          restaurantId: assignment.restaurantId,
          restaurantMemberId: assignment.restaurantMemberId,
          status: { [Op.in]: activeAssignmentStatuses },
        },
        transaction,
      });
      await RestaurantMember.update(
        { availabilityStatus: remaining ? "on_delivery" : "available" },
        {
          where: {
            id: assignment.restaurantMemberId,
            restaurantId: assignment.restaurantId,
          },
          transaction,
        },
      );
      await DeliveryStatusHistory.create(
        {
          restaurantId: assignment.restaurantId,
          branchId: assignment.branchId,
          orderId: assignment.orderId,
          assignmentId: assignment.id,
          restaurantMemberId: assignment.restaurantMemberId,
          performedByUserId: actorId,
          event: target
            ? "acceptance_timeout_reassigned"
            : "acceptance_timeout_no_staff",
          fromStatus,
          toStatus: target ? "reassigned" : "timed_out",
          notes: assignment.notes,
        },
        { transaction },
      );
      let replacementId = null;
      if (target) {
        const replacement = await DeliveryAssignment.create(
          {
            restaurantId: assignment.restaurantId,
            branchId: assignment.branchId,
            orderId: assignment.orderId,
            restaurantMemberId: target.id,
            assignedByUserId: actorId,
            status: "pending_acceptance",
            assignedAt: new Date(),
            notes: "Automatic reassignment after acceptance timeout.",
          },
          { transaction },
        );
        replacementId = replacement.id;
        await target.update(
          { availabilityStatus: "on_delivery" },
          { transaction },
        );
        await DeliveryStatusHistory.create(
          {
            restaurantId: assignment.restaurantId,
            branchId: assignment.branchId,
            orderId: assignment.orderId,
            assignmentId: replacement.id,
            restaurantMemberId: target.id,
            performedByUserId: actorId,
            event: "reassigned_to_employee",
            fromStatus: null,
            toStatus: "pending_acceptance",
            notes: "Reassigned after acceptance timeout.",
          },
          { transaction },
        );
      }
      await transaction.commit();
      if (lockedOrder?.customerId) await createCustomerNotification({ io, customerId: lockedOrder.customerId, category: "delivery", title: target ? "Delivery partner reassigned" : "Delivery assignment timed out", message: target ? `A new delivery partner has been assigned to order ${lockedOrder.orderNumber}.` : `We are finding another delivery partner for order ${lockedOrder.orderNumber}.`, href: `/customer/orders/${lockedOrder.id}`, entityId: lockedOrder.id, dedupeKey: target ? `delivery:${replacementId}:pending_acceptance` : `delivery-timeout:${assignment.id}` });
      if (io) {
        io.to(
          `delivery:${assignment.restaurantId}:${assignment.branchId}`,
        ).emit(
          target ? "delivery:assignment-updated" : "delivery:no-eligible-staff",
          {
            orderId: assignment.orderId,
            branchId: assignment.branchId,
            ...(target ? { assignmentId: assignment.id } : {}),
          },
        );
        io.to(
          `delivery-employee:${assignment.restaurantId}:${assignment.restaurantMemberId}`,
        ).emit("delivery:assignment-updated", {
          orderId: assignment.orderId,
          assignmentId: assignment.id,
          status: "reassigned",
        });
        if (target)
          io.to(
            `delivery-employee:${assignment.restaurantId}:${target.id}`,
          ).emit("delivery:assignment-updated", {
            orderId: assignment.orderId,
            assignmentId: replacementId,
            status: "pending_acceptance",
          });
      }
      if (io) {
        const order = await Order.findByPk(assignment.orderId, {
          attributes: ["customerId"],
        });
        if (order)
          io.to(`customer:${order.customerId}`).emit(
            "delivery:customer-updated",
            {
              orderId: assignment.orderId,
              status: target ? "pending_acceptance" : "rejected",
            },
          );
      }
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      throw error;
    }
  }
};

exports.processAutomaticAssignments = async (io) => {
  const pending = await Order.findAll({
    where: {
      orderType: "delivery",
      deliveryAddress: { [Op.ne]: null },
      branchId: { [Op.ne]: null },
      status: "ready",
    },
    order: [["createdAt", "ASC"]],
    limit: 100,
  });
  for (const order of pending) {
    const settings =
      (await DeliverySetting.findOne({
        where: { restaurantId: order.restaurantId, branchId: order.branchId },
      })) ||
      (await DeliverySetting.findOne({
        where: { restaurantId: order.restaurantId, branchId: null },
      }));
    if (!settings?.automaticAssignmentEnabled) continue;
    const transaction = await sequelize.transaction();
    try {
      const lockedOrder = await Order.findByPk(order.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        !lockedOrder ||
        lockedOrder.status !== "ready" || lockedOrder.kitchenStatus !== "ready"
      ) {
        await transaction.rollback();
        continue;
      }
      const existing = await DeliveryAssignment.findOne({
        where: {
          restaurantId: order.restaurantId,
          orderId: order.id,
          status: { [Op.in]: activeAssignmentStatuses },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existing) {
        await transaction.rollback();
        continue;
      }
      const candidates = await RestaurantMember.findAll({
        where: {
          restaurantId: order.restaurantId,
          status: "active",
          availabilityStatus: { [Op.in]: ["available", "on_delivery"] },
        },
        include: [
          {
            model: User,
            as: "user",
            where: { status: "active" },
            attributes: ["id"],
            required: true,
          },
          {
            model: Role,
            as: "role",
            where: deliveryRoleFilter(order.restaurantId),
            attributes: ["id"],
            required: true,
          },
          {
            model: EmployeeBranchAssignment,
            as: "branchAssignments",
            where: { branchId: order.branchId, status: "active" },
            attributes: ["id"],
            required: true,
          },
        ],
        transaction,
      });
      const active = candidates.length
        ? await DeliveryAssignment.findAll({
            where: {
              restaurantId: order.restaurantId,
              restaurantMemberId: {
                [Op.in]: candidates.map((member) => member.id),
              },
              status: { [Op.in]: activeAssignmentStatuses },
            },
            attributes: ["restaurantMemberId"],
            raw: true,
            transaction,
          })
        : [];
      const counts = new Map();
      active.forEach((row) =>
        counts.set(
          row.restaurantMemberId,
          (counts.get(row.restaurantMemberId) || 0) + 1,
        ),
      );
      const target = candidates
        .filter(
          (member) =>
            (counts.get(member.id) || 0) < settings.maxActiveAssignments,
        )
        .sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0))[0];
      if (!target) {
        await transaction.rollback();
        if (io && !noStaffNoticeSent.has(order.id)) {
          noStaffNoticeSent.add(order.id);
          io.to(`delivery:${order.restaurantId}:${order.branchId}`).emit(
            "delivery:no-eligible-staff",
            { orderId: order.id, branchId: order.branchId },
          );
        }
        continue;
      }
      const owner = await RestaurantMember.findOne({
        where: { restaurantId: order.restaurantId, status: "active" },
        include: [
          {
            model: Role,
            as: "role",
            where: { code: "restaurant_owner" },
            attributes: ["id"],
            required: true,
          },
        ],
        attributes: ["userId"],
        transaction,
      });
      if (!owner) {
        await transaction.rollback();
        continue;
      }
      const now = new Date();
      const assignment = await DeliveryAssignment.create(
        {
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          orderId: order.id,
          restaurantMemberId: target.id,
          assignedByUserId: owner.userId,
          status: "pending_acceptance",
          assignedAt: now,
        },
        { transaction },
      );
      await target.update(
        { availabilityStatus: "on_delivery" },
        { transaction },
      );
      await DeliveryStatusHistory.create(
        {
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          orderId: order.id,
          assignmentId: assignment.id,
          restaurantMemberId: target.id,
          performedByUserId: owner.userId,
          event: "automatically_assigned",
          fromStatus: null,
          toStatus: "pending_acceptance",
        },
        { transaction },
      );
      await transaction.commit();
      noStaffNoticeSent.delete(order.id);
      if (order.customerId) await createCustomerNotification({ io, customerId: order.customerId, category: "delivery", title: "Delivery partner assigned", message: `A delivery partner has been assigned to order ${order.orderNumber}.`, href: `/customer/orders/${order.id}`, entityId: order.id, dedupeKey: `delivery:${assignment.id}:pending_acceptance` });
      await createRestaurantNotification({ io, restaurantId: order.restaurantId, branchId: order.branchId, category: 'delivery', title: 'Delivery associate assigned', message: `A delivery associate was assigned to order ${order.orderNumber}.`, href: `/restaurant/delivery/orders?search=${encodeURIComponent(order.orderNumber)}`, entityId: order.id, dedupeKey: `delivery:${assignment.id}:pending_acceptance` });
      if (io) {
        io.to(`delivery:${order.restaurantId}:${order.branchId}`).emit(
          "delivery:assignment-updated",
          {
            orderId: order.id,
            assignmentId: assignment.id,
            status: "pending_acceptance",
          },
        );
        io.to(`delivery-employee:${order.restaurantId}:${target.id}`).emit(
          "delivery:assignment-updated",
          {
            orderId: order.id,
            assignmentId: assignment.id,
            status: "pending_acceptance",
          },
        );
      }
      if (io)
        io.to(`customer:${order.customerId}`).emit(
          "delivery:customer-updated",
          { orderId: order.id, status: "pending_acceptance" },
        );
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      throw error;
    }
  }
};
