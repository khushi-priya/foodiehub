'use strict';
const { DataTypes } = require('sequelize');

async function hasColumn(queryInterface, table, column) {
  const description = await queryInterface.describeTable(table);
  return Object.hasOwn(description, column);
}

async function hasTable(queryInterface, table) {
  const tables = await queryInterface.showAllTables();
  return tables.some((entry) => String(typeof entry === 'string' ? entry : entry.tableName || entry.name).toLowerCase() === table.toLowerCase());
}

async function ensureIndex(queryInterface, table, name, fields) {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) await queryInterface.addIndex(table, fields, { name });
}

async function insertMissingRolePermissions(queryInterface, roleId, permissions) {
  if (!roleId || !permissions.length) return;
  const [existing] = await queryInterface.sequelize.query(`SELECT role_id, permission_id FROM role_permissions WHERE role_id = '${roleId}' AND permission_id IN (${permissions.map((item) => `'${item.id}'`).join(',')})`);
  const existingIds = new Set(existing.map((entry) => entry.permission_id));
  const missing = permissions.filter((permission) => !existingIds.has(permission.id));
  if (missing.length) await queryInterface.bulkInsert('role_permissions', missing.map((permission) => ({ role_id: roleId, permission_id: permission.id })));
}

module.exports = {
  async up(queryInterface) {
    if (!(await hasColumn(queryInterface,'roles','restaurant_id'))) await queryInterface.addColumn('roles','restaurant_id',{type:DataTypes.UUID,allowNull:true,references:{model:'restaurants',key:'id'},onDelete:'CASCADE'});
    await ensureIndex(queryInterface,'roles','roles_restaurant_id_idx',['restaurant_id']);
    if (!(await hasColumn(queryInterface,'restaurants','accepting_orders'))) await queryInterface.addColumn('restaurants', 'accepting_orders', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    if (!(await hasTable(queryInterface,'attendance_records'))) await queryInterface.createTable('attendance_records', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' } },
      restaurant_member_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_members', key: 'id' } },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' } },
      checked_in_at: { type: DataTypes.DATE, allowNull: false }, checked_out_at: { type: DataTypes.DATE, allowNull: true },
      check_in_note: { type: DataTypes.STRING(500), allowNull: true }, check_out_note: { type: DataTypes.STRING(500), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false }, updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await ensureIndex(queryInterface,'attendance_records','attendance_records_restaurant_checked_in_idx',['restaurant_id', 'checked_in_at']);
    await ensureIndex(queryInterface,'attendance_records','attendance_records_member_checked_in_idx',['restaurant_member_id', 'checked_in_at']);
    await ensureIndex(queryInterface,'attendance_records','attendance_records_branch_checked_in_idx',['branch_id', 'checked_in_at']);
    if (!(await hasTable(queryInterface,'restaurant_invitations'))) await queryInterface.createTable('restaurant_invitations', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' } },
      restaurant_member_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_members', key: 'id' } },
      token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expires_at: { type: DataTypes.DATE, allowNull: false }, consumed_at: { type: DataTypes.DATE, allowNull: true },
      invited_by_user_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      created_at: { type: DataTypes.DATE, allowNull: false }, updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await ensureIndex(queryInterface,'restaurant_invitations','restaurant_invitations_member_idx',['restaurant_member_id']);
    await ensureIndex(queryInterface,'restaurant_invitations','restaurant_invitations_expires_idx',['expires_at']);
    const { randomUUID } = require('crypto');
    const now = new Date();
    const definitions = [
      ['employees.create','employees','Create restaurant employees'], ['employees.update','employees','Update restaurant employees'], ['employees.deactivate','employees','Deactivate restaurant employees'], ['employees.manage_roles','employees','Manage restaurant roles'], ['employees.assign_branches','employees','Assign employee branches'],
      ['attendance.view','attendance','View attendance'], ['attendance.check_in','attendance','Record own check-in'], ['attendance.check_out','attendance','Record own check-out'], ['attendance.manage','attendance','Manage employee attendance'],
      ['business.view','business','View restaurant business settings'], ['business.update','business','Manage restaurant business settings'],
      ['orders.create','orders','Create restaurant orders'], ['orders.cancel','orders','Cancel restaurant orders'], ['orders.manage_status','orders','Manage restaurant order status'], ['kitchen.view','kitchen','View kitchen tickets'], ['kitchen.update_status','kitchen','Update kitchen status'],
      ['reservations.view','reservations','View restaurant reservations'], ['reservations.create','reservations','Create restaurant reservations'], ['reservations.update','reservations','Update restaurant reservations'], ['menu.create','menu','Create menu items'], ['menu.update','menu','Update menu items'], ['menu.delete','menu','Delete menu items'], ['payments.collect','payments','Collect payments'], ['payments.refund','payments','Process refunds'],
    ].map(([code,module,description])=>({id:randomUUID(),code,module,description,created_at:now,updated_at:now}));
    const [existingPermissions] = await queryInterface.sequelize.query(`SELECT code FROM permissions WHERE code IN (${definitions.map((permission)=>`'${permission.code}'`).join(',')})`);
    const existingCodes = new Set(existingPermissions.map((permission)=>permission.code));
    const missingDefinitions = definitions.filter((permission)=>!existingCodes.has(permission.code));
    if (missingDefinitions.length) await queryInterface.bulkInsert('permissions', missingDefinitions);
    const [owners] = await queryInterface.sequelize.query("SELECT id FROM roles WHERE code = 'restaurant_owner'");
    if (owners[0]) {
      const [inserted] = await queryInterface.sequelize.query("SELECT id, code FROM permissions WHERE code IN ('employees.create','employees.update','employees.deactivate','employees.manage_roles','employees.assign_branches','attendance.view','attendance.check_in','attendance.check_out','attendance.manage','business.view','business.update','orders.create','orders.cancel','orders.manage_status','kitchen.view','kitchen.update_status','reservations.view','menu.create','menu.update','menu.delete','payments.collect','payments.refund')");
      await insertMissingRolePermissions(queryInterface, owners[0].id, inserted);
    }
    const [managers] = await queryInterface.sequelize.query("SELECT id FROM roles WHERE code = 'manager'");
    if (managers[0]) {
      const [inserted] = await queryInterface.sequelize.query("SELECT id FROM permissions WHERE code IN ('employees.create','employees.update','employees.assign_branches','attendance.view','attendance.manage','business.view','orders.create','orders.manage_status','kitchen.view','kitchen.update_status','reservations.view','menu.create','menu.update')");
      await insertMissingRolePermissions(queryInterface, managers[0].id, inserted);
    }
    const selfServiceCodes = ['attendance.check_in','attendance.check_out'];
    const [selfServicePermissions] = await queryInterface.sequelize.query("SELECT id FROM permissions WHERE code IN ('attendance.check_in','attendance.check_out')");
    const [serviceRoles] = await queryInterface.sequelize.query("SELECT id FROM roles WHERE code IN ('manager','waiter','kitchen_staff','cashier')");
    if (selfServicePermissions.length && serviceRoles.length) for (const role of serviceRoles) await insertMissingRolePermissions(queryInterface, role.id, selfServicePermissions);
    const [kitchenRole] = await queryInterface.sequelize.query("SELECT id FROM roles WHERE code = 'kitchen_staff'");
    const [kitchenPermissions] = await queryInterface.sequelize.query("SELECT id FROM permissions WHERE code IN ('kitchen.view','kitchen.update_status')");
    if (kitchenRole[0] && kitchenPermissions.length) await insertMissingRolePermissions(queryInterface, kitchenRole[0].id, kitchenPermissions);
    const [managerMore] = await queryInterface.sequelize.query("SELECT id FROM permissions WHERE code IN ('reservations.view','reservations.create','reservations.update')");
    if (managers[0] && managerMore.length) await insertMissingRolePermissions(queryInterface, managers[0].id, managerMore);
  },
  async down(queryInterface) {
    const { Op } = require('sequelize');
    await queryInterface.sequelize.query("DELETE rp FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permission_id WHERE p.code IN ('employees.create','employees.update','employees.deactivate','employees.manage_roles','employees.assign_branches','attendance.view','attendance.check_in','attendance.check_out','attendance.manage','business.view','business.update','orders.create','orders.cancel','orders.manage_status','kitchen.view','kitchen.update_status','reservations.view','reservations.create','reservations.update','menu.create','menu.update','menu.delete','payments.collect','payments.refund')");
    await queryInterface.bulkDelete('permissions', { code: { [Op.in]: ['employees.create','employees.update','employees.deactivate','employees.manage_roles','employees.assign_branches','attendance.view','attendance.check_in','attendance.check_out','attendance.manage','business.view','business.update','orders.create','orders.cancel','orders.manage_status','kitchen.view','kitchen.update_status','reservations.view','menu.create','menu.update','menu.delete','payments.collect','payments.refund'] } }, {});
    await queryInterface.dropTable('restaurant_invitations'); await queryInterface.dropTable('attendance_records'); await queryInterface.removeColumn('restaurants','accepting_orders'); await queryInterface.removeIndex('roles','roles_restaurant_id_idx'); await queryInterface.removeColumn('roles','restaurant_id');
  },
};
