const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CustomerNotificationPreference', {
  customerId: { type: DataTypes.UUID, primaryKey: true, field: 'customer_id' },
  orderUpdates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'order_updates' },
  paymentUpdates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'payment_updates' },
  reservationUpdates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'reservation_updates' },
  deliveryUpdates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'delivery_updates' },
  supportUpdates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'support_updates' },
  marketingUpdates: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'marketing_updates' },
}, { tableName: 'customer_notification_preferences' });
