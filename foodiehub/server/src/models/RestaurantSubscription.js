const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('RestaurantSubscription', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  planId: { type: DataTypes.UUID, allowNull: false, field: 'plan_id' },
  planSnapshot: { type: DataTypes.JSON, allowNull: false, field: 'plan_snapshot' },
  status: { type: DataTypes.ENUM('pending', 'active', 'expired', 'cancelled', 'failed'), allowNull: false, defaultValue: 'pending' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
  startDate: { type: DataTypes.DATE, allowNull: true, field: 'start_date' },
  endDate: { type: DataTypes.DATE, allowNull: true, field: 'end_date' },
  renewalDate: { type: DataTypes.DATE, allowNull: true, field: 'renewal_date' },
}, { tableName: 'restaurant_subscriptions', indexes: [{ fields: ['restaurant_id', 'status'] }, { fields: ['restaurant_id', 'end_date'] }, { fields: ['plan_id', 'status'] }] });
