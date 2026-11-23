'use strict';

const { randomUUID } = require('crypto');

const definitions = [
  ['delivery_orders.view', 'delivery_orders', 'View restaurant delivery orders'],
  ['delivery_orders.view_assigned', 'delivery_orders', 'View deliveries assigned to the employee'],
  ['delivery_orders.accept', 'delivery_orders', 'Accept an assigned delivery'],
  ['delivery_orders.reject', 'delivery_orders', 'Reject an assigned delivery'],
  ['delivery_orders.update_status', 'delivery_orders', 'Update assigned delivery progress'],
  ['delivery_orders.complete', 'delivery_orders', 'Complete an assigned delivery'],
  ['delivery_staff.view', 'delivery_staff', 'View delivery staff'],
  ['delivery_staff.create', 'delivery_staff', 'Create delivery staff accounts'],
  ['delivery_staff.update', 'delivery_staff', 'Update delivery staff details'],
  ['delivery_staff.deactivate', 'delivery_staff', 'Deactivate delivery staff'],
  ['delivery_staff.assign_branch', 'delivery_staff', 'Assign delivery staff to restaurant branches'],
  ['delivery_assignments.view', 'delivery_assignments', 'View delivery assignments'],
  ['delivery_assignments.create', 'delivery_assignments', 'Assign delivery orders'],
  ['delivery_assignments.update', 'delivery_assignments', 'Update delivery assignments'],
  ['delivery_assignments.reassign', 'delivery_assignments', 'Reassign delivery orders'],
  ['delivery_tracking.view_assigned', 'delivery_tracking', 'View location for deliveries assigned to the employee'],
  ['delivery_tracking.view_branch', 'delivery_tracking', 'View delivery locations for assigned branches'],
  ['delivery_reports.view', 'delivery_reports', 'View delivery reports'],
  ['delivery_reports.export', 'delivery_reports', 'Export delivery reports'],
  ['delivery_settings.view', 'delivery_settings', 'View delivery settings'],
  ['delivery_settings.manage', 'delivery_settings', 'Manage restaurant delivery settings'],
].map(([code, module, description]) => ({ code, module, description }));

const associatePermissions = [
  'delivery_orders.view_assigned', 'delivery_orders.accept', 'delivery_orders.reject',
  'delivery_orders.update_status', 'delivery_orders.complete', 'delivery_tracking.view_assigned',
];
const seniorPermissions = [...associatePermissions, 'delivery_assignments.view', 'delivery_tracking.view_branch'];
const supervisorPermissions = [
  'delivery_orders.view', 'delivery_staff.view', 'delivery_staff.update', 'delivery_staff.assign_branch',
  'delivery_assignments.view', 'delivery_assignments.create', 'delivery_assignments.update',
  'delivery_assignments.reassign', 'delivery_tracking.view_branch', 'delivery_reports.view',
];
const defaultRoles = {
  delivery_associate: associatePermissions,
  senior_delivery_associate: seniorPermissions,
  delivery_supervisor: supervisorPermissions,
};

module.exports = {
  async up(queryInterface) {
    const [existingPermissions] = await queryInterface.sequelize.query("SELECT code FROM permissions WHERE module = 'delivery'");
    const existingCodes = new Set(existingPermissions.map((permission) => permission.code));
    const missing = definitions.filter((permission) => !existingCodes.has(permission.code));
    const now = new Date();
    if (missing.length) await queryInterface.bulkInsert('permissions', missing.map((permission) => ({ id: randomUUID(), ...permission, created_at: now, updated_at: now })));

    const allCodes = definitions.map((permission) => permission.code);
    const [permissions] = await queryInterface.sequelize.query(`SELECT id, code FROM permissions WHERE code IN (${allCodes.map((code) => `'${code}'`).join(',')})`);
    const permissionIds = new Map(permissions.map((permission) => [permission.code, permission.id]));
    const roleCodes = [...Object.keys(defaultRoles), 'restaurant_owner'];
    const [roles] = await queryInterface.sequelize.query(`SELECT id, code FROM roles WHERE scope = 'restaurant' AND code IN (${roleCodes.map((code) => `'${code}'`).join(',')})`);
    const roleIds = new Map(roles.map((role) => [role.code, role.id]));
    const mappings = [];
    for (const code of allCodes) if (roleIds.has('restaurant_owner') && permissionIds.has(code)) mappings.push({ role_id: roleIds.get('restaurant_owner'), permission_id: permissionIds.get(code) });
    for (const [roleCode, codes] of Object.entries(defaultRoles)) {
      for (const code of codes) if (roleIds.has(roleCode) && permissionIds.has(code)) mappings.push({ role_id: roleIds.get(roleCode), permission_id: permissionIds.get(code) });
    }
    if (mappings.length) {
      const roleIdsToCheck = [...new Set(mappings.map((mapping) => mapping.role_id))];
      const [existingLinks] = await queryInterface.sequelize.query(`SELECT role_id, permission_id FROM role_permissions WHERE role_id IN (${roleIdsToCheck.map((id) => `'${id}'`).join(',')})`);
      const linked = new Set(existingLinks.map((row) => `${row.role_id}:${row.permission_id}`));
      const missingLinks = mappings.filter((mapping) => !linked.has(`${mapping.role_id}:${mapping.permission_id}`));
      if (missingLinks.length) await queryInterface.bulkInsert('role_permissions', missingLinks);
    }
  },

  async down(queryInterface) {
    const [customRoles] = await queryInterface.sequelize.query("SELECT id FROM roles WHERE scope = 'restaurant' AND is_system = 0 AND code LIKE 'custom_delivery_%'");
    if (customRoles.length) throw new Error('Cannot roll back delivery permissions while custom delivery roles exist.');
    const codes = definitions.map((permission) => permission.code);
    await queryInterface.sequelize.query(`DELETE rp FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permission_id WHERE p.code IN (${codes.map((code) => `'${code}'`).join(',')})`);
    const { Op } = require('sequelize');
    await queryInterface.bulkDelete('permissions', { code: { [Op.in]: codes } });
  },
};
