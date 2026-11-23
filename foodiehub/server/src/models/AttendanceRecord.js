const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('AttendanceRecord', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  restaurantMemberId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_member_id' },
  branchId: { type: DataTypes.UUID, allowNull: false, field: 'branch_id' },
  checkedInAt: { type: DataTypes.DATE, allowNull: false, field: 'checked_in_at' },
  checkedOutAt: { type: DataTypes.DATE, allowNull: true, field: 'checked_out_at' },
  checkInNote: { type: DataTypes.STRING(500), allowNull: true, field: 'check_in_note' },
  checkOutNote: { type: DataTypes.STRING(500), allowNull: true, field: 'check_out_note' },
}, { tableName: 'attendance_records', indexes: [{ fields: ['restaurant_id', 'checked_in_at'] }, { fields: ['restaurant_member_id', 'checked_in_at'] }, { fields: ['branch_id', 'checked_in_at'] }] });
