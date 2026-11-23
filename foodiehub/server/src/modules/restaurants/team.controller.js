const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const sequelize = require("../../config/database");
const {
  User,
  RestaurantMember,
  Role,
  Permission,
  RolePermission,
  EmployeeBranchAssignment,
  Branch,
  AttendanceRecord,
  RestaurantInvitation,
} = require("../../models");
const { recordAuditEvent } = require("../../services/audit-log");
const {
  assertEmployeeCapacity,
} = require("../../services/subscription-limits");
const { invalidateRestaurantSockets } = require("../../services/socket-auth");

const fail = (status, message) => Object.assign(new Error(message), { status });
const restaurantPermissionWhere = (codes) => ({
  code: { [Op.in]: codes },
  module: { [Op.notIn]: ["admin", "customer", "delivery"] },
});
const DELIVERY_ROLE_CODES = [
  "delivery_associate",
  "senior_delivery_associate",
  "delivery_supervisor",
];
const DELIVERY_PERMISSION_CODES = [
  "delivery_orders.view",
  "delivery_orders.view_assigned",
  "delivery_orders.accept",
  "delivery_orders.reject",
  "delivery_orders.update_status",
  "delivery_orders.complete",
  "delivery_staff.view",
  "delivery_staff.create",
  "delivery_staff.update",
  "delivery_staff.deactivate",
  "delivery_staff.assign_branch",
  "delivery_staff.set_availability",
  "delivery_assignments.view",
  "delivery_assignments.create",
  "delivery_assignments.update",
  "delivery_assignments.reassign",
  "delivery_tracking.view_assigned",
  "delivery_tracking.view_branch",
  "delivery_reports.view",
  "delivery_reports.export",
  "delivery_settings.view",
  "delivery_settings.manage",
];
const deliveryCustomRolePattern = (restaurantId) =>
  `custom_delivery_${restaurantId.replace(/-/g, "").slice(0, 16)}_%`;
const isDeliveryRoleCode = (code, restaurantId) =>
  DELIVERY_ROLE_CODES.includes(code) ||
  (typeof code === "string" &&
    code.startsWith(deliveryCustomRolePattern(restaurantId).slice(0, -1)));
function deliveryRoleWhere(restaurantId) {
  return {
    scope: "restaurant",
    [Op.and]: [
      {
        [Op.or]: [
          { code: { [Op.in]: DELIVERY_ROLE_CODES } },
          {
            code: { [Op.like]: deliveryCustomRolePattern(restaurantId) },
            restaurantId,
          },
        ],
      },
      {
        [Op.or]: [
          { isSystem: true, code: { [Op.in]: DELIVERY_ROLE_CODES } },
          {
            isSystem: false,
            restaurantId,
            code: { [Op.like]: deliveryCustomRolePattern(restaurantId) },
          },
        ],
      },
    ],
  };
}
const cleanEmployee = (member) => ({
  id: member.id,
  userId: member.user.id,
  firstName: member.user.firstName,
  lastName: member.user.lastName,
  fullName: `${member.user.firstName} ${member.user.lastName || ""}`.trim(),
  email: member.user.email,
  phone: member.user.phone,
  employeeId: member.employeeId,
  availabilityStatus: member.availabilityStatus,
  status: member.status,
  loginStatus: member.user.status,
  lastLoginAt: member.user.lastLoginAt,
  joinedAt: member.joinedAt,
  createdAt: member.createdAt,
  role: {
    id: member.role.id,
    name: member.role.name,
    code: member.role.code,
    isSystem: member.role.isSystem,
  },
  branches: (member.branchAssignments || [])
    .filter((a) => a.status === "active")
    .map((a) => ({ id: a.branch.id, name: a.branch.name })),
});
const includeEmployee = [
  {
    model: User,
    as: "user",
    attributes: [
      "id",
      "firstName",
      "lastName",
      "email",
      "phone",
      "status",
      "lastLoginAt",
    ],
  },
  { model: Role, as: "role", attributes: ["id", "name", "code", "isSystem"] },
  {
    model: EmployeeBranchAssignment,
    as: "branchAssignments",
    where: { status: "active" },
    required: false,
    attributes: ["id", "branchId", "status"],
    include: [{ model: Branch, as: "branch", attributes: ["id", "name"] }],
  },
];
function employeeIncludes(req) {
  return includeEmployee.map((entry) =>
    entry.as === "branchAssignments" && req.restaurantBranchIds !== null
      ? {
          ...entry,
          where: {
            status: "active",
            branchId: { [Op.in]: req.restaurantBranchIds },
          },
          required: false,
        }
      : entry,
  );
}
async function employeeScopeIds(req, branchId = null) {
  let allowedBranchIds = req.restaurantBranchIds;
  if (branchId) {
    if (allowedBranchIds !== null && !allowedBranchIds.includes(branchId))
      throw fail(403, "You do not have access to this branch.");
    allowedBranchIds =
      allowedBranchIds === null
        ? [branchId]
        : allowedBranchIds.filter((id) => id === branchId);
  }
  if (allowedBranchIds === null) return null;
  const assignments = allowedBranchIds.length
    ? await EmployeeBranchAssignment.findAll({
        where: { branchId: { [Op.in]: allowedBranchIds }, status: "active" },
        attributes: ["restaurantMemberId"],
        raw: true,
      })
    : [];
  return [
    ...new Set(assignments.map((assignment) => assignment.restaurantMemberId)),
  ];
}

exports.listEmployees = async (req, res, next) => {
  try {
    const {
      search = "",
      roleId,
      branchId,
      status,
      page = 1,
      pageSize = 20,
    } = req.query;
    const searchText =
      typeof search === "string" ? search.trim().slice(0, 100) : "";
    const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const currentPage = Math.max(1, Number(page) || 1);
    const offset = (currentPage - 1) * limit;
    const ownerRole = await Role.findOne({
      where: { code: "restaurant_owner", scope: "restaurant" },
      attributes: ["id"],
    });
    const where = {
      restaurantId: req.restaurant.id,
      ...(ownerRole ? { roleId: { [Op.ne]: ownerRole.id } } : {}),
    };
    const deliveryRoleIds = req.deliveryStaffMode
      ? (
          await Role.findAll({
            where: deliveryRoleWhere(req.restaurant.id),
            attributes: ["id"],
            raw: true,
          })
        ).map((role) => role.id)
      : null;
    if (deliveryRoleIds) where.roleId = { [Op.in]: deliveryRoleIds };
    const accessibleMemberIds = await employeeScopeIds(req, branchId);
    if (accessibleMemberIds !== null)
      where.id = { [Op.in]: accessibleMemberIds };
    if (
      status &&
      !["invited", "active", "inactive", "suspended"].includes(status)
    )
      throw fail(400, "Invalid employee status filter.");
    if (status) where.status = status;
    if (roleId) {
      where.roleId = roleId;
      if (req.deliveryStaffMode && !deliveryRoleIds.includes(roleId))
        where.id = { [Op.in]: [] };
      if (!req.deliveryStaffMode && ownerRole && roleId === ownerRole.id)
        where.id = { [Op.in]: [] };
    }
    const includes = employeeIncludes(req).map((entry) =>
      entry.as === "user" && searchText ? { ...entry, required: true } : entry,
    );
    if (searchText)
      where[Op.or] = [
        { employeeId: { [Op.like]: `%${searchText}%` } },
        ...["firstName", "lastName", "email", "phone"].map((field) => ({
          [`$user.${field}$`]: { [Op.like]: `%${searchText}%` },
        })),
      ];
    const result = await RestaurantMember.findAndCountAll({
      where,
      include: includes,
      distinct: true,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });
    const rows = result.rows.map(cleanEmployee);
    const countWhere = {
      restaurantId: req.restaurant.id,
      ...(deliveryRoleIds
        ? {
            roleId: {
              [Op.in]: roleId
                ? deliveryRoleIds.includes(roleId)
                  ? [roleId]
                  : []
                : deliveryRoleIds,
            },
          }
        : ownerRole
          ? { roleId: { [Op.ne]: ownerRole.id } }
          : {}),
      ...(accessibleMemberIds !== null
        ? { id: { [Op.in]: accessibleMemberIds } }
        : {}),
    };
    const allCounts = await RestaurantMember.findAll({
      where: countWhere,
      attributes: ["status", "roleId"],
      raw: true,
    });
    const roles = await Role.findAll({
      where: { scope: "restaurant" },
      attributes: ["id", "name", "code"],
    });
    const counts = {
      total: allCounts.length,
      active: allCounts.filter((x) => x.status === "active").length,
      inactive: allCounts.filter((x) =>
        ["inactive", "suspended"].includes(x.status),
      ).length,
      invited: allCounts.filter((x) => x.status === "invited").length,
      byRole: roles.map((role) => ({
        roleId: role.id,
        role: role.name,
        count: allCounts.filter((x) => x.roleId === role.id).length,
      })),
    };
    res.json({
      success: true,
      employees: rows,
      pagination: {
        page: currentPage,
        pageSize: limit,
        total: result.count,
        totalPages: Math.ceil(result.count / limit),
      },
      counts,
    });
  } catch (e) {
    next(e);
  }
};

exports.listDeliveryStaff = async (req, res, next) => {
  req.deliveryStaffMode = true;
  return exports.listEmployees(req, res, next);
};

exports.listRoles = async (req, res, next) => {
  try {
    const where = req.deliveryStaffMode
      ? deliveryRoleWhere(req.restaurant.id)
      : {
          scope: "restaurant",
          [Op.or]: [{ isSystem: true }, { restaurantId: req.restaurant.id }],
          code: {
            [Op.notIn]: DELIVERY_ROLE_CODES,
            [Op.notLike]: "custom_delivery_%",
          },
        };
    const roles = await Role.findAll({
      where,
      include: [
        {
          model: Permission,
          as: "permissions",
          attributes: ["id", "code", "module", "description"],
          through: { attributes: [] },
        },
      ],
      order: [
        ["isSystem", "DESC"],
        ["name", "ASC"],
      ],
    });
    const accessibleMemberIds = await employeeScopeIds(req);
    const memberships = await RestaurantMember.findAll({
      where: {
        restaurantId: req.restaurant.id,
        ...(accessibleMemberIds !== null
          ? { id: { [Op.in]: accessibleMemberIds } }
          : {}),
      },
      attributes: ["roleId"],
      raw: true,
    });
    res.json({
      success: true,
      roles: roles.map((r) => ({
        ...r.toJSON(),
        memberCount: memberships.filter((m) => m.roleId === r.id).length,
      })),
    });
  } catch (e) {
    next(e);
  }
};
exports.listDeliveryRoles = async (req, res, next) => {
  req.deliveryStaffMode = true;
  return exports.listRoles(req, res, next);
};
exports.listPermissions = async (req, res, next) => {
  try {
    const permissions = await Permission.findAll({
      where: { module: { [Op.notIn]: ["admin", "customer", "delivery"] } },
      attributes: ["id", "code", "module", "description"],
      order: [
        ["module", "ASC"],
        ["code", "ASC"],
      ],
    });
    res.json({ success: true, permissions });
  } catch (e) {
    next(e);
  }
};
exports.listDeliveryPermissions = async (req, res, next) => {
  try {
    const permissions = await Permission.findAll({
      where: {
        module: "delivery",
        code: { [Op.in]: DELIVERY_PERMISSION_CODES },
      },
      attributes: ["id", "code", "module", "description"],
      order: [["code", "ASC"]],
    });
    res.json({ success: true, permissions });
  } catch (error) {
    next(error);
  }
};

exports.createDeliveryRole = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { name, description, permissions = [] } = req.body || {};
    if (
      !(req.restaurantGrantedPermissions || []).includes(
        "employees.manage_roles",
      )
    )
      throw fail(403, "You cannot manage restaurant roles.");
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 100 ||
      !Array.isArray(permissions)
    )
      throw fail(400, "Enter a valid role name and permission list.");
    if (
      permissions.some(
        (code) =>
          typeof code !== "string" || !DELIVERY_PERMISSION_CODES.includes(code),
      )
    )
      throw fail(400, "One or more delivery permissions are invalid.");
    const allowed = await Permission.findAll({
      where: { code: { [Op.in]: permissions }, module: "delivery" },
      attributes: ["id", "code"],
      transaction,
    });
    if (allowed.length !== new Set(permissions).size)
      throw fail(400, "One or more delivery permissions are invalid.");
    const slug =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 45) || "role";
    const code = `${deliveryCustomRolePattern(req.restaurant.id).slice(0, -1)}${slug}`;
    const role = await Role.create(
      {
        name: name.trim(),
        code,
        restaurantId: req.restaurant.id,
        scope: "restaurant",
        description:
          typeof description === "string" ? description.slice(0, 1000) : null,
        isSystem: false,
      },
      { transaction },
    );
    if (allowed.length)
      await RolePermission.bulkCreate(
        allowed.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        { transaction },
      );
    await recordAuditEvent(
      req,
      {
        action: "restaurant.delivery_role.created",
        entityType: "restaurant_role",
        entityId: role.id,
        afterData: {
          name: role.name,
          permissions: allowed.map((permission) => permission.code),
        },
      },
      { transaction },
    );
    await transaction.commit();
    res
      .status(201)
      .json({
        success: true,
        role: { ...role.toJSON(), permissions: allowed },
      });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.updateDeliveryRole = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const role = await Role.findOne({
      where: { id: req.params.roleId, ...deliveryRoleWhere(req.restaurant.id) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!role) throw fail(404, "Delivery role not found.");
    if (role.isSystem)
      throw fail(
        403,
        "Default delivery roles cannot be changed. Create a custom delivery role instead.",
      );
    if (
      !(req.restaurantGrantedPermissions || []).includes(
        "employees.manage_roles",
      )
    )
      throw fail(403, "You cannot manage restaurant roles.");
    const { name, description, permissions } = req.body || {};
    if (
      name !== undefined &&
      (typeof name !== "string" ||
        name.trim().length < 2 ||
        name.trim().length > 100)
    )
      throw fail(400, "Enter a valid role name.");
    if (permissions !== undefined) {
      if (!Array.isArray(permissions))
        throw fail(400, "Permissions must be a list.");
      if (
        permissions.some(
          (code) =>
            typeof code !== "string" ||
            !DELIVERY_PERMISSION_CODES.includes(code),
        )
      )
        throw fail(400, "One or more delivery permissions are invalid.");
      const allowed = await Permission.findAll({
        where: { code: { [Op.in]: permissions }, module: "delivery" },
        attributes: ["id", "code"],
        transaction,
      });
      if (allowed.length !== new Set(permissions).size)
        throw fail(400, "One or more delivery permissions are invalid.");
      await RolePermission.destroy({ where: { roleId: role.id }, transaction });
      if (allowed.length)
        await RolePermission.bulkCreate(
          allowed.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
          { transaction },
        );
    }
    await role.update(
      {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined
          ? { description: String(description).slice(0, 1000) || null }
          : {}),
      },
      { transaction },
    );
    await recordAuditEvent(
      req,
      {
        action: "restaurant.delivery_role.updated",
        entityType: "restaurant_role",
        entityId: role.id,
        afterData: { name: role.name, permissions },
      },
      { transaction },
    );
    await transaction.commit();
    if (permissions !== undefined)
      invalidateRestaurantSockets(req.app.get("io"), req.restaurant.id);
    res.json({
      success: true,
      role: await Role.findByPk(role.id, {
        include: [
          { model: Permission, as: "permissions", through: { attributes: [] } },
        ],
      }),
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.createRole = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { name, description, permissions = [] } = req.body || {};
    if (
      !(req.restaurantGrantedPermissions || []).includes(
        "employees.manage_roles",
      )
    )
      throw fail(403, "You cannot manage restaurant roles.");
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 100 ||
      !Array.isArray(permissions)
    )
      throw fail(400, "Enter a valid role name and permission list.");
    const allowed = await Permission.findAll({
      where: restaurantPermissionWhere(permissions),
      attributes: ["id", "code"],
    });
    if (allowed.length !== new Set(permissions).size)
      throw fail(400, "One or more permissions are invalid.");
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 45);
    const code = `custom_${req.restaurant.id.replace(/-/g, "").slice(0, 16)}_${slug}`;
    const role = await Role.create(
      {
        name: name.trim(),
        code,
        restaurantId: req.restaurant.id,
        scope: "restaurant",
        description:
          typeof description === "string" ? description.slice(0, 1000) : null,
        isSystem: false,
      },
      { transaction },
    );
    await RolePermission.bulkCreate(
      allowed.map((p) => ({ roleId: role.id, permissionId: p.id })),
      { transaction },
    );
    await recordAuditEvent(
      req,
      {
        action: "restaurant.role.created",
        entityType: "restaurant_role",
        entityId: role.id,
        afterData: { name: role.name, permissions: allowed.map((p) => p.code) },
      },
      { transaction },
    );
    await transaction.commit();
    res
      .status(201)
      .json({
        success: true,
        role: { ...role.toJSON(), permissions: allowed },
      });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};

exports.updateRole = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const role = await Role.findOne({
      where: {
        id: req.params.roleId,
        scope: "restaurant",
        restaurantId: req.restaurant.id,
      },
      transaction,
    });
    if (!role) throw fail(404, "Role not found.");
    if (role.isSystem)
      throw fail(
        403,
        "System roles cannot be modified. Create a custom role instead.",
      );
    if (
      !(req.restaurantGrantedPermissions || []).includes(
        "employees.manage_roles",
      )
    )
      throw fail(403, "You cannot manage restaurant roles.");
    const { name, description, permissions } = req.body || {};
    if (
      name !== undefined &&
      (!String(name).trim() || String(name).length > 100)
    )
      throw fail(400, "Enter a valid role name.");
    if (permissions !== undefined) {
      if (!Array.isArray(permissions))
        throw fail(400, "Permissions must be a list.");
      const allowed = await Permission.findAll({
        where: restaurantPermissionWhere(permissions),
        attributes: ["id", "code"],
        transaction,
      });
      if (allowed.length !== new Set(permissions).size)
        throw fail(400, "One or more permissions are invalid.");
      await RolePermission.destroy({ where: { roleId: role.id }, transaction });
      await RolePermission.bulkCreate(
        allowed.map((p) => ({ roleId: role.id, permissionId: p.id })),
        { transaction },
      );
    }
    await role.update(
      {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined
          ? { description: String(description).slice(0, 1000) }
          : {}),
      },
      { transaction },
    );
    await recordAuditEvent(
      req,
      {
        action: "restaurant.role.updated",
        entityType: "restaurant_role",
        entityId: role.id,
        afterData: { name: role.name, permissions },
      },
      { transaction },
    );
    await transaction.commit();
    if (permissions !== undefined)
      invalidateRestaurantSockets(req.app.get("io"), req.restaurant.id);
    res.json({
      success: true,
      role: await Role.findByPk(role.id, {
        include: [
          { model: Permission, as: "permissions", through: { attributes: [] } },
        ],
      }),
    });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};

exports.createEmployee = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      firstName,
      lastName = "",
      email,
      phone = null,
      roleId,
      branchIds = [],
      employeeId,
    } = req.body || {};
    if (process.env.NODE_ENV === "production")
      throw fail(
        503,
        "Employee invitations are unavailable because email delivery is not configured. Configure the existing mail service before inviting employees.",
      );
    if (
      !String(firstName || "").trim() ||
      !String(email || "").trim() ||
      !roleId ||
      !Array.isArray(branchIds)
    )
      throw fail(400, "Name, email, role and branch assignments are required.");
    const granted = new Set(req.restaurantGrantedPermissions || []);
    if (!granted.has("employees.create"))
      throw fail(403, "You cannot create employees.");
    if (!granted.has("employees.manage_roles"))
      throw fail(403, "You cannot assign employee roles.");
    if (branchIds.length && !granted.has("employees.assign_branches"))
      throw fail(403, "You cannot assign employee branches.");
    const role = await Role.findOne({
      where: {
        id: roleId,
        scope: "restaurant",
        [Op.or]: [{ isSystem: true }, { restaurantId: req.restaurant.id }],
      },
      transaction,
    });
    if (
      !role ||
      role.code === "restaurant_owner" ||
      (req.deliveryStaffMode
        ? !isDeliveryRoleCode(role.code, req.restaurant.id)
        : isDeliveryRoleCode(role.code, req.restaurant.id))
    )
      throw fail(
        400,
        req.deliveryStaffMode
          ? "Choose a delivery staff role."
          : "Choose an assignable restaurant role.",
      );
    const normalizedEmployeeId =
      typeof employeeId === "string" && employeeId.trim()
        ? employeeId.trim().toUpperCase()
        : null;
    if (normalizedEmployeeId) {
      if (normalizedEmployeeId.length > 40)
        throw fail(400, "Employee ID must be 40 characters or fewer.");
      if (
        await RestaurantMember.findOne({
          where: {
            restaurantId: req.restaurant.id,
            employeeId: normalizedEmployeeId,
          },
          transaction,
        })
      )
        throw fail(409, "This employee ID is already used by this restaurant.");
    }
    await assertEmployeeCapacity(req.restaurant.id, transaction);
    if (branchIds.length) {
      const branches = await Branch.findAll({
        where: { id: { [Op.in]: branchIds }, restaurantId: req.restaurant.id },
        attributes: ["id"],
        transaction,
      });
      if (branches.length !== new Set(branchIds).size)
        throw fail(
          400,
          "Every assigned branch must belong to this restaurant.",
        );
    }
    if (
      req.restaurantBranchIds !== null &&
      branchIds.some((id) => !req.restaurantBranchIds.includes(id))
    )
      throw fail(
        403,
        "You can assign employees only to branches assigned to you.",
      );
    const normalized = email.trim().toLowerCase();
    let user = await User.findOne({
      where: { email: normalized },
      transaction,
    });
    if (
      user &&
      (await RestaurantMember.findOne({
        where: { restaurantId: req.restaurant.id, userId: user.id },
        transaction,
      }))
    )
      throw fail(409, "This person already belongs to the restaurant.");
    if (user && user.status === "active")
      throw fail(409, "This email is already in use by an active account.");
    if (!user)
      user = await User.create(
        {
          firstName: firstName.trim(),
          lastName: String(lastName).trim() || null,
          email: normalized,
          phone: phone ? String(phone).trim() : null,
          passwordHash: await bcrypt.hash(
            crypto.randomBytes(48).toString("hex"),
            12,
          ),
          status: "pending",
        },
        { transaction },
      );
    const member = await RestaurantMember.create(
      {
        restaurantId: req.restaurant.id,
        userId: user.id,
        roleId: role.id,
        employeeId: normalizedEmployeeId,
        status: "invited",
      },
      { transaction },
    );
    if (branchIds.length)
      await EmployeeBranchAssignment.bulkCreate(
        [...new Set(branchIds)].map((branchId) => ({
          restaurantMemberId: member.id,
          branchId,
          assignedByUserId: req.authUser.id,
          status: "active",
        })),
        { transaction },
      );
    const rawToken = crypto.randomBytes(32).toString("hex");
    await RestaurantInvitation.create(
      {
        restaurantId: req.restaurant.id,
        restaurantMemberId: member.id,
        tokenHash: crypto.createHash("sha256").update(rawToken).digest("hex"),
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        invitedByUserId: req.authUser.id,
      },
      { transaction },
    );
    await recordAuditEvent(
      req,
      {
        action: "restaurant.employee.invited",
        entityType: "restaurant_member",
        entityId: member.id,
        afterData: { email: normalized, role: role.code, branchIds },
      },
      { transaction },
    );
    await transaction.commit();
    const inviteUrl =
      process.env.NODE_ENV === "production"
        ? undefined
        : `${(process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].replace(/\/$/, "")}/restaurant/accept-invite?token=${rawToken}`;
    res
      .status(201)
      .json({
        success: true,
        message: "Employee invitation created.",
        employee: {
          id: member.id,
          email: normalized,
          status: "invited",
          role: role.name,
        },
        ...(inviteUrl ? { inviteUrl } : {}),
        inviteExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};

exports.createDeliveryStaff = async (req, res, next) => {
  req.deliveryStaffMode = true;
  return exports.createEmployee(req, res, next);
};

exports.updateEmployee = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await RestaurantMember.findOne({
      where: { id: req.params.memberId, restaurantId: req.restaurant.id },
      include: employeeIncludes(req),
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!member) throw fail(404, "Employee not found.");
    const allPreviousAssignments = await EmployeeBranchAssignment.findAll({
      where: { restaurantMemberId: member.id, status: "active" },
      attributes: ["branchId"],
      raw: true,
      transaction,
    });
    const allPreviousBranchIds = allPreviousAssignments.map(
      (assignment) => assignment.branchId,
    );
    const previousBranchIds =
      req.restaurantBranchIds === null
        ? allPreviousBranchIds
        : allPreviousBranchIds.filter((id) =>
            req.restaurantBranchIds.includes(id),
          );
    if (req.restaurantBranchIds !== null && !previousBranchIds.length)
      throw fail(404, "Employee not found.");
    const {
      firstName,
      lastName,
      phone,
      roleId,
      branchIds,
      status,
      employeeId,
    } = req.body || {};
    const granted = new Set(req.restaurantGrantedPermissions || []);
    if (
      (firstName !== undefined ||
        lastName !== undefined ||
        phone !== undefined) &&
      !granted.has("employees.update")
    )
      throw fail(403, "You cannot edit employee details.");
    if (
      roleId &&
      roleId !== member.roleId &&
      !granted.has("employees.manage_roles")
    )
      throw fail(403, "You cannot change employee roles.");
    const requestedBranchIds = Array.isArray(branchIds)
      ? [...new Set(branchIds)]
      : null;
    const branchesChanged =
      requestedBranchIds &&
      JSON.stringify([...previousBranchIds].sort()) !==
        JSON.stringify([...requestedBranchIds].sort());
    if (branchesChanged && !granted.has("employees.assign_branches"))
      throw fail(403, "You cannot change employee branch assignments.");
    if (
      status !== undefined &&
      status !== member.status &&
      status !== "active" &&
      !granted.has("employees.deactivate")
    )
      throw fail(403, "You cannot deactivate employees.");
    if (
      status !== undefined &&
      !["active", "inactive", "suspended"].includes(status)
    )
      throw fail(400, "Invalid employee status.");
    if (member.role.code === "restaurant_owner")
      throw fail(403, "Owner membership cannot be changed here.");
    if (
      req.deliveryStaffMode
        ? !isDeliveryRoleCode(member.role.code, req.restaurant.id)
        : isDeliveryRoleCode(member.role.code, req.restaurant.id)
    )
      throw fail(404, "Employee not found.");
    const normalizedEmployeeId =
      employeeId === undefined
        ? undefined
        : typeof employeeId === "string" && employeeId.trim()
          ? employeeId.trim().toUpperCase()
          : null;
    if (normalizedEmployeeId && normalizedEmployeeId.length > 40)
      throw fail(400, "Employee ID must be 40 characters or fewer.");
    if (
      normalizedEmployeeId &&
      normalizedEmployeeId !== member.employeeId &&
      (await RestaurantMember.findOne({
        where: {
          restaurantId: req.restaurant.id,
          employeeId: normalizedEmployeeId,
          id: { [Op.ne]: member.id },
        },
        transaction,
      }))
    )
      throw fail(409, "This employee ID is already used by this restaurant.");
    const changes = {};
    if (firstName !== undefined) changes.firstName = String(firstName).trim();
    if (lastName !== undefined)
      changes.lastName = String(lastName).trim() || null;
    if (phone !== undefined) changes.phone = phone || null;
    if (normalizedEmployeeId !== undefined)
      changes.employeeId = normalizedEmployeeId;
    if (Object.keys(changes).length)
      await member.user.update(changes, { transaction });
    if (roleId && roleId !== member.roleId) {
      const role = await Role.findOne({
        where: {
          id: roleId,
          scope: "restaurant",
          [Op.or]: [{ isSystem: true }, { restaurantId: req.restaurant.id }],
        },
        transaction,
      });
      if (
        !role ||
        role.code === "restaurant_owner" ||
        (req.deliveryStaffMode
          ? !isDeliveryRoleCode(role.code, req.restaurant.id)
          : isDeliveryRoleCode(role.code, req.restaurant.id))
      )
        throw fail(
          400,
          req.deliveryStaffMode
            ? "Choose a delivery staff role."
            : "Choose an assignable restaurant role.",
        );
      await member.update({ roleId: role.id }, { transaction });
    }
    if (branchesChanged) {
      if (
        req.restaurantBranchIds !== null &&
        requestedBranchIds.some((id) => !req.restaurantBranchIds.includes(id))
      )
        throw fail(
          403,
          "You can assign employees only to branches assigned to you.",
        );
      const hiddenBranchIds =
        req.restaurantBranchIds === null
          ? []
          : allPreviousBranchIds.filter(
              (id) => !req.restaurantBranchIds.includes(id),
            );
      const ids = [...new Set([...requestedBranchIds, ...hiddenBranchIds])];
      const branches = await Branch.findAll({
        where: { id: { [Op.in]: ids }, restaurantId: req.restaurant.id },
        attributes: ["id"],
        transaction,
      });
      if (branches.length !== ids.length)
        throw fail(
          400,
          "Every assigned branch must belong to this restaurant.",
        );
      await EmployeeBranchAssignment.update(
        { status: "inactive" },
        {
          where: { restaurantMemberId: member.id, status: "active" },
          transaction,
        },
      );
      for (const branchId of ids)
        await EmployeeBranchAssignment.findOrCreate({
          where: { restaurantMemberId: member.id, branchId },
          defaults: { assignedByUserId: req.authUser.id, status: "active" },
          transaction,
        }).then(async ([a]) =>
          a.update(
            { status: "active", assignedByUserId: req.authUser.id },
            { transaction },
          ),
        );
    }
    if (status && status !== member.status) {
      await member.update(
        {
          status,
          ...(status === "active" && !member.joinedAt
            ? { joinedAt: new Date() }
            : {}),
        },
        { transaction },
      );
      if (
        status === "active" &&
        member.user.status === "pending" &&
        member.joinedAt
      )
        await member.user.update({ status: "active" }, { transaction });
    }
    await recordAuditEvent(
      req,
      {
        action:
          status && status !== "active"
            ? "restaurant.employee.deactivated"
            : "restaurant.employee.updated",
        entityType: "restaurant_member",
        entityId: member.id,
        afterData: { roleId, status, branchIds },
      },
      { transaction },
    );
    if (branchesChanged)
      await recordAuditEvent(
        req,
        {
          action: "restaurant.employee.branches_changed",
          entityType: "restaurant_member",
          entityId: member.id,
          beforeData: { branchIds: allPreviousBranchIds },
          afterData: {
            branchIds: [
              ...new Set([
                ...(req.restaurantBranchIds === null
                  ? []
                  : allPreviousBranchIds.filter(
                      (id) => !req.restaurantBranchIds.includes(id),
                    )),
                ...requestedBranchIds,
              ]),
            ],
          },
        },
        { transaction },
      );
    await transaction.commit();
    if (roleId !== undefined || branchesChanged || status !== undefined)
      invalidateRestaurantSockets(req.app.get("io"), req.restaurant.id);
    const updated = await RestaurantMember.findByPk(member.id, {
      include: employeeIncludes(req),
    });
    res.json({ success: true, employee: cleanEmployee(updated) });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};

exports.updateDeliveryStaff = async (req, res, next) => {
  req.deliveryStaffMode = true;
  return exports.updateEmployee(req, res, next);
};

exports.acceptInvitation = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { token, password } = req.body || {};
    if (
      typeof token !== "string" ||
      typeof password !== "string" ||
      password.length < 10
    )
      throw fail(
        400,
        "A valid invitation token and password of at least 10 characters are required.",
      );
    const invitation = await RestaurantInvitation.findOne({
      where: {
        tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        consumedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!invitation) throw fail(400, "This invitation is invalid or expired.");
    const member = await RestaurantMember.findOne({
      where: { id: invitation.restaurantMemberId, status: "invited" },
      include: [{ model: User, as: "user" }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!member) throw fail(400, "This invitation is no longer available.");
    await member.user.update(
      { passwordHash: await bcrypt.hash(password, 12), status: "active" },
      { transaction },
    );
    await member.update(
      { status: "active", joinedAt: new Date() },
      { transaction },
    );
    await invitation.update({ consumedAt: new Date() }, { transaction });
    await transaction.commit();
    res.json({
      success: true,
      message: "Account activated. You can now sign in.",
    });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};

exports.attendanceStatus = async (req, res, next) => {
  try {
    const memberId = req.restaurantMembership.id;
    const current = await AttendanceRecord.findOne({
      where: { restaurantMemberId: memberId, checkedOutAt: null },
      include: [{ model: Branch, as: "branch", attributes: ["id", "name"] }],
      order: [["checkedInAt", "DESC"]],
    });
    res.json({ success: true, current });
  } catch (e) {
    next(e);
  }
};
exports.attendanceBranches = async (req, res, next) => {
  try {
    const branches =
      req.restaurantRole === "restaurant_owner"
        ? await Branch.findAll({
            where: { restaurantId: req.restaurant.id, isActive: true },
            attributes: ["id", "name"],
            order: [["name", "ASC"]],
          })
        : await Branch.findAll({
            where: {
              restaurantId: req.restaurant.id,
              isActive: true,
              id: { [Op.in]: req.restaurantBranchIds || [] },
            },
            attributes: ["id", "name"],
            order: [["name", "ASC"]],
          });
    res.json({ success: true, branches });
  } catch (e) {
    next(e);
  }
};
exports.checkIn = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const branchId = req.body?.branchId;
    if (!branchId) throw fail(400, "Select a branch to check in.");
    await RestaurantMember.findByPk(req.restaurantMembership.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
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
    });
    if (!branch)
      throw fail(403, "This branch is not available to your account.");
    const open = await AttendanceRecord.findOne({
      where: {
        restaurantMemberId: req.restaurantMembership.id,
        checkedOutAt: null,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (open) throw fail(409, "You already have an active check-in.");
    const record = await AttendanceRecord.create(
      {
        restaurantId: req.restaurant.id,
        restaurantMemberId: req.restaurantMembership.id,
        branchId,
        checkedInAt: new Date(),
        checkInNote: req.body?.note
          ? String(req.body.note).slice(0, 500)
          : null,
      },
      { transaction },
    );
    await recordAuditEvent(
      req,
      {
        action: "restaurant.attendance.checked_in",
        entityType: "attendance_record",
        entityId: record.id,
        afterData: { branchId },
      },
      { transaction },
    );
    await transaction.commit();
    res.status(201).json({ success: true, attendance: record });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};
exports.checkOut = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    await RestaurantMember.findByPk(req.restaurantMembership.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const record = await AttendanceRecord.findOne({
      where: {
        restaurantMemberId: req.restaurantMembership.id,
        checkedOutAt: null,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!record) throw fail(409, "There is no active check-in.");
    await record.update(
      {
        checkedOutAt: new Date(),
        checkOutNote: req.body?.note
          ? String(req.body.note).slice(0, 500)
          : null,
      },
      { transaction },
    );
    await recordAuditEvent(
      req,
      {
        action: "restaurant.attendance.checked_out",
        entityType: "attendance_record",
        entityId: record.id,
        afterData: { checkedOutAt: record.checkedOutAt },
      },
      { transaction },
    );
    await transaction.commit();
    res.json({ success: true, attendance: record });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};
exports.attendanceList = async (req, res, next) => {
  try {
    const where = { restaurantId: req.restaurant.id };
    if (req.query.employeeId) where.restaurantMemberId = req.query.employeeId;
    if (req.query.branchId) where.branchId = req.query.branchId;
    if (req.restaurantBranchIds)
      where.branchId = {
        ...(where.branchId ? { [Op.eq]: where.branchId } : {}),
        [Op.in]: req.restaurantBranchIds,
      };
    if (req.query.from || req.query.to)
      where.checkedInAt = {
        [Op.between]: [
          req.query.from ? new Date(req.query.from) : new Date(0),
          req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : new Date(),
        ],
      };
    const rows = await AttendanceRecord.findAll({
      where,
      include: [
        {
          model: RestaurantMember,
          as: "restaurantMember",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "firstName", "lastName", "email"],
            },
            { model: Role, as: "role", attributes: ["name"] },
          ],
        },
        { model: Branch, as: "branch", attributes: ["id", "name"] },
      ],
      order: [["checkedInAt", "DESC"]],
      limit: 500,
    });
    res.json({ success: true, attendance: rows });
  } catch (e) {
    next(e);
  }
};
exports.updateAttendance = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const record = await AttendanceRecord.findOne({
      where: {
        id: req.params.attendanceId,
        restaurantId: req.restaurant.id,
        ...(req.restaurantBranchIds
          ? { branchId: { [Op.in]: req.restaurantBranchIds } }
          : {}),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!record) throw fail(404, "Attendance record not found.");
    const { checkedInAt, checkedOutAt, checkInNote, checkOutNote } =
      req.body || {};
    const updates = {};
    for (const key of ["checkedInAt", "checkedOutAt"])
      if (req.body[key] !== undefined) {
        const value = req.body[key];
        if (
          value !== null &&
          (!Number.isFinite(Date.parse(value)) || typeof value !== "string")
        )
          throw fail(400, `${key} must be a valid date and time.`);
        updates[key] = value === null ? null : new Date(value);
      }
    for (const key of ["checkInNote", "checkOutNote"])
      if (req.body[key] !== undefined) {
        if (req.body[key] !== null && typeof req.body[key] !== "string")
          throw fail(400, `${key} must be text.`);
        updates[key] = req.body[key]?.slice(0, 500) || null;
      }
    const nextIn = updates.checkedInAt || record.checkedInAt;
    const nextOut = Object.hasOwn(updates, "checkedOutAt")
      ? updates.checkedOutAt
      : record.checkedOutAt;
    if (nextOut && new Date(nextOut) <= new Date(nextIn))
      throw fail(400, "Check-out must be later than check-in.");
    if (!Object.keys(updates).length)
      throw fail(400, "Provide attendance fields to update.");
    const before = {
      checkedInAt: record.checkedInAt,
      checkedOutAt: record.checkedOutAt,
      checkInNote: record.checkInNote,
      checkOutNote: record.checkOutNote,
    };
    await record.update(updates, { transaction });
    await recordAuditEvent(
      req,
      {
        action: "restaurant.attendance.corrected",
        entityType: "attendance_record",
        entityId: record.id,
        beforeData: before,
        afterData: updates,
      },
      { transaction },
    );
    await transaction.commit();
    res.json({ success: true, attendance: record });
  } catch (e) {
    await transaction.rollback();
    next(e);
  }
};
