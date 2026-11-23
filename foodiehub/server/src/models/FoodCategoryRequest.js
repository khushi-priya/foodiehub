const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('FoodCategoryRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  requestedBy: { type: DataTypes.UUID, allowNull: false, field: 'requested_by' },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.STRING(500), allowNull: true },
  imageUrl: { type: DataTypes.STRING(1000), allowNull: true, field: 'image_url' },
  displayOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'display_order' },
  pendingNameKey: { type: DataTypes.STRING(100), allowNull: true, field: 'pending_name_key' },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
  approvalType: { type: DataTypes.ENUM('global', 'restaurant'), allowNull: true, field: 'approval_type' },
  approvedCategoryId: { type: DataTypes.UUID, allowNull: true, field: 'approved_category_id' },
  reviewedBy: { type: DataTypes.UUID, allowNull: true, field: 'reviewed_by' },
  reviewedAt: { type: DataTypes.DATE, allowNull: true, field: 'reviewed_at' },
  rejectionReason: { type: DataTypes.TEXT, allowNull: true, field: 'rejection_reason' },
}, { tableName: 'food_category_requests', indexes: [{ fields: ['restaurant_id', 'status'] }, { fields: ['status', 'created_at'] }] });
