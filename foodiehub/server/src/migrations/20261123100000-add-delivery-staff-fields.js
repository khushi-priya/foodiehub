'use strict';

const { DataTypes } = require('sequelize');
const { randomUUID } = require('crypto');

async function hasColumn(queryInterface, tableName, columnName) {
  const description = await queryInterface.describeTable(tableName);
  return Object.hasOwn(description, columnName);
}

async function ensureIndex(queryInterface, tableName, indexName, fields, options = {}) {
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((index) => index.name === indexName)) {
    await queryInterface.addIndex(tableName, fields, { name: indexName, ...options });
  }
}

module.exports = {
  async up(queryInterface) {
    if (!(await hasColumn(queryInterface, 'restaurant_members', 'employee_id'))) {
      await queryInterface.addColumn('restaurant_members', 'employee_id', { type: DataTypes.STRING(40), allowNull: true });
    }
    if (!(await hasColumn(queryInterface, 'restaurant_members', 'availability_status'))) {
      await queryInterface.addColumn('restaurant_members', 'availability_status', { type: DataTypes.ENUM('offline', 'available', 'on_delivery'), allowNull: false, defaultValue: 'offline' });
    }
    await ensureIndex(queryInterface, 'restaurant_members', 'restaurant_members_restaurant_employee_id_uq', ['restaurant_id', 'employee_id'], { unique: true });

    const now = new Date();
    const roles = [
      ['Delivery Associate', 'delivery_associate'],
      ['Senior Delivery Associate', 'senior_delivery_associate'],
      ['Delivery Supervisor', 'delivery_supervisor'],
    ];
    const [existing] = await queryInterface.sequelize.query("SELECT code FROM roles WHERE code IN ('delivery_associate','senior_delivery_associate','delivery_supervisor')");
    const existingCodes = new Set(existing.map((role) => role.code));
    const missing = roles.filter(([, code]) => !existingCodes.has(code));
    if (missing.length) {
      await queryInterface.bulkInsert('roles', missing.map(([name, code]) => ({
        id: randomUUID(), name, code, restaurant_id: null, scope: 'restaurant',
        description: `${name} delivery role`, is_system: true, created_at: now, updated_at: now,
      })));
    }
  },

  async down(queryInterface) {
    const { Op } = require('sequelize');
    const roleCodes = ['delivery_associate', 'senior_delivery_associate', 'delivery_supervisor'];
    const [assigned] = await queryInterface.sequelize.query("SELECT COUNT(*) AS total FROM restaurant_members rm INNER JOIN roles r ON r.id = rm.role_id WHERE r.code IN ('delivery_associate','senior_delivery_associate','delivery_supervisor')");
    if (Number(assigned[0]?.total || 0) > 0) {
      throw new Error('Cannot roll back delivery staff roles while restaurant members are assigned to them.');
    }
    await queryInterface.bulkDelete('roles', { code: { [Op.in]: roleCodes } });
    const indexes = await queryInterface.showIndex('restaurant_members');
    if (indexes.some((index) => index.name === 'restaurant_members_restaurant_employee_id_uq')) {
      await queryInterface.removeIndex('restaurant_members', 'restaurant_members_restaurant_employee_id_uq');
    }
    if (await hasColumn(queryInterface, 'restaurant_members', 'availability_status')) await queryInterface.removeColumn('restaurant_members', 'availability_status');
    if (await hasColumn(queryInterface, 'restaurant_members', 'employee_id')) await queryInterface.removeColumn('restaurant_members', 'employee_id');
  },
};
