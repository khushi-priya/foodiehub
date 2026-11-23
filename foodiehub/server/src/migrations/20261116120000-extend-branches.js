'use strict';
const { DataTypes, QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('branches', 'address_line_2', { type: DataTypes.STRING(255), allowNull: true });
    await queryInterface.addColumn('branches', 'landmark', { type: DataTypes.STRING(150), allowNull: true });
    await queryInterface.addColumn('branches', 'opening_time', { type: DataTypes.TIME, allowNull: true });
    await queryInterface.addColumn('branches', 'closing_time', { type: DataTypes.TIME, allowNull: true });
    await queryInterface.addColumn('branches', 'working_days', { type: DataTypes.JSON, allowNull: false, defaultValue: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] });
    await queryInterface.addColumn('branches', 'closed_days', { type: DataTypes.JSON, allowNull: false, defaultValue: [] });
    await queryInterface.addColumn('branches', 'overnight', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('branches', 'dine_in_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    await queryInterface.addColumn('branches', 'takeaway_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    await queryInterface.addColumn('branches', 'delivery_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    await queryInterface.addColumn('branches', 'is_primary', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('branches', 'is_active', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true });
    await queryInterface.addIndex('branches', ['restaurant_id', 'is_active']);
    await queryInterface.addIndex('branches', ['restaurant_id', 'is_primary']);

    // Preserve existing branch records and choose the oldest branch as primary
    // where a restaurant has not yet had an explicit primary designation.
    const branches = await queryInterface.sequelize.query(
      'SELECT id, restaurant_id, operational_status FROM branches ORDER BY created_at ASC',
      { type: QueryTypes.SELECT }
    );
    const firstByRestaurant = new Map();
    for (const branch of branches) {
      if (branch.operational_status === 'inactive') {
        await queryInterface.sequelize.query('UPDATE branches SET is_active = 0 WHERE id = :id', { replacements: { id: branch.id } });
      }
      if (!firstByRestaurant.has(branch.restaurant_id) && branch.operational_status !== 'inactive') firstByRestaurant.set(branch.restaurant_id, branch.id);
    }
    for (const id of firstByRestaurant.values()) {
      await queryInterface.sequelize.query('UPDATE branches SET is_primary = 1 WHERE id = :id', { replacements: { id } });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('branches', ['restaurant_id', 'is_primary']);
    await queryInterface.removeIndex('branches', ['restaurant_id', 'is_active']);
    for (const column of ['is_active', 'is_primary', 'delivery_enabled', 'takeaway_enabled', 'dine_in_enabled', 'overnight', 'closed_days', 'working_days', 'closing_time', 'opening_time', 'landmark', 'address_line_2']) {
      await queryInterface.removeColumn('branches', column);
    }
  },
};
