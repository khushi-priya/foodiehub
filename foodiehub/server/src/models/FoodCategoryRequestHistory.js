const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('FoodCategoryRequestHistory', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  requestId: { type: DataTypes.UUID, allowNull: false, field: 'request_id' },
  action: { type: DataTypes.STRING(40), allowNull: false },
  previousStatus: { type: DataTypes.STRING(20), allowNull: true, field: 'previous_status' },
  newStatus: { type: DataTypes.STRING(20), allowNull: false, field: 'new_status' },
  performedBy: { type: DataTypes.UUID, allowNull: false, field: 'performed_by' },
  comments: { type: DataTypes.TEXT, allowNull: true },
}, { tableName: 'food_category_request_history', updatedAt: false, indexes: [{ fields: ['request_id', 'created_at'] }] });
