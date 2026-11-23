const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RestaurantTable = sequelize.define('RestaurantTable', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id', references: { model: 'restaurants', key: 'id' } },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id', references: { model: 'branches', key: 'id' } },
  tableNumber: { type: DataTypes.STRING(50), allowNull: false, field: 'table_number' },
  seatingCapacity: { type: DataTypes.INTEGER, allowNull: false, field: 'seating_capacity', validate: { min: 1, max: 100 } },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
  qrToken: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: 'qr_token' },
  occupancyStatus: { type: DataTypes.ENUM('available', 'occupied', 'reserved', 'cleaning', 'inactive'), allowNull: false, defaultValue: 'available', field: 'occupancy_status' },
  assignedWaiterMemberId: { type: DataTypes.UUID, allowNull: true, field: 'assigned_waiter_member_id', references: { model: 'restaurant_members', key: 'id' } },
}, {
  tableName: 'restaurant_tables',
  indexes: [
    { unique: true, fields: ['branch_id', 'table_number'], name: 'restaurant_tables_branch_number_unique' },
    { fields: ['branch_id', 'occupancy_status'], name: 'restaurant_tables_branch_occupancy_idx' },
    { fields: ['assigned_waiter_member_id'], name: 'restaurant_tables_waiter_idx' },
  ],
});

module.exports = RestaurantTable;
