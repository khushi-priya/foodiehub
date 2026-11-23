'use strict';
const { DataTypes } = require('sequelize');

const tableExists = async (queryInterface, name) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => String(typeof table === 'string' ? table : table.tableName || table.name).toLowerCase() === name.toLowerCase());
};

module.exports = {
  async up(queryInterface) {
    if (await tableExists(queryInterface, 'customer_addresses')) {
      const columns = await queryInterface.describeTable('customer_addresses');
      if (!columns.latitude) await queryInterface.addColumn('customer_addresses', 'latitude', { type: DataTypes.DECIMAL(10, 7), allowNull: true });
      if (!columns.longitude) await queryInterface.addColumn('customer_addresses', 'longitude', { type: DataTypes.DECIMAL(10, 7), allowNull: true });
    }
    if (await tableExists(queryInterface, 'delivery_settings')) {
      const columns = await queryInterface.describeTable('delivery_settings');
      if (!columns.location_sharing_enabled) await queryInterface.addColumn('delivery_settings', 'location_sharing_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    }
    if (!(await tableExists(queryInterface, 'delivery_locations'))) {
      await queryInterface.createTable('delivery_locations', {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        assignment_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'delivery_assignments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        restaurant_member_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurant_members', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
        longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: false },
        accuracy_meters: { type: DataTypes.DECIMAL(9, 2), allowNull: true },
        captured_at: { type: DataTypes.DATE, allowNull: false },
        expires_at: { type: DataTypes.DATE, allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex('delivery_locations', ['restaurant_id', 'branch_id', 'expires_at'], { name: 'delivery_locations_restaurant_branch_expiry_idx' });
      await queryInterface.addIndex('delivery_locations', ['order_id', 'expires_at'], { name: 'delivery_locations_order_expiry_idx' });
    }
  },
  async down(queryInterface) {
    if (await tableExists(queryInterface, 'delivery_locations')) await queryInterface.dropTable('delivery_locations');
    if (await tableExists(queryInterface, 'delivery_settings')) {
      const columns = await queryInterface.describeTable('delivery_settings');
      if (columns.location_sharing_enabled) await queryInterface.removeColumn('delivery_settings', 'location_sharing_enabled');
    }
    if (await tableExists(queryInterface, 'customer_addresses')) {
      const columns = await queryInterface.describeTable('customer_addresses');
      if (columns.longitude) await queryInterface.removeColumn('customer_addresses', 'longitude');
      if (columns.latitude) await queryInterface.removeColumn('customer_addresses', 'latitude');
    }
  },
};
