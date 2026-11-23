const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('DeliverySetting', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id', references: { model: 'restaurants', key: 'id' } },
  branchId: { type: DataTypes.UUID, allowNull: true, field: 'branch_id', references: { model: 'branches', key: 'id' } },
  manualAssignmentEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'manual_assignment_enabled' },
  automaticAssignmentEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'automatic_assignment_enabled' },
  maxActiveAssignments: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'max_active_assignments' },
  acceptanceTimeoutMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5, field: 'acceptance_timeout_minutes' },
  locationSharingEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'location_sharing_enabled' },
}, { tableName: 'delivery_settings', indexes: [{ fields: ['restaurant_id', 'branch_id'] }] });
