const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('Reservation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id', references: { model: 'restaurants', key: 'id' } },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id', references: { model: 'branches', key: 'id' } },
  tableId: { type: DataTypes.UUID, allowNull: true, field: 'table_id', references: { model: 'restaurant_tables', key: 'id' } },
  createdByMemberId: { type: DataTypes.UUID, allowNull: true, field: 'created_by_member_id', references: { model: 'restaurant_members', key: 'id' } },
  customerId: { type: DataTypes.UUID, allowNull: true, field: 'customer_id', references: { model: 'users', key: 'id' } },
  guestName: { type: DataTypes.STRING(150), allowNull: false, field: 'guest_name' },
  guestPhone: { type: DataTypes.STRING(20), allowNull: false, field: 'guest_phone' },
  guestEmail: { type: DataTypes.STRING(150), allowNull: true, field: 'guest_email' },
  partySize: { type: DataTypes.INTEGER, allowNull: false, field: 'party_size', validate: { min: 1, max: 100 } },
  startsAt: { type: DataTypes.DATE, allowNull: false, field: 'starts_at' },
  endsAt: { type: DataTypes.DATE, allowNull: false, field: 'ends_at' },
  status: { type: DataTypes.ENUM('pending', 'confirmed', 'rejected', 'cancelled', 'checked_in', 'seated', 'completed', 'no_show'), allowNull: false, defaultValue: 'pending' },
  notes: { type: DataTypes.TEXT, allowNull: true },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true, field: 'rejection_reason' },
  checkedInAt: { type: DataTypes.DATE, allowNull: true, field: 'checked_in_at' },
  seatedAt: { type: DataTypes.DATE, allowNull: true, field: 'seated_at' },
  completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
}, {
  tableName: 'reservations',
  indexes: [
    { fields: ['restaurant_id', 'branch_id', 'starts_at', 'status'], name: 'reservations_branch_schedule_idx' },
    { fields: ['table_id', 'starts_at', 'ends_at', 'status'], name: 'reservations_table_schedule_idx' },
    { fields: ['customer_id', 'starts_at', 'status'], name: 'reservations_customer_schedule_idx' },
  ],
});
