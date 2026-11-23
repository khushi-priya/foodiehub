const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('SupportTicket', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  reference: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  restaurantId: { type: DataTypes.UUID, allowNull: true, field: 'restaurant_id' },
  createdByUserId: { type: DataTypes.UUID, allowNull: false, field: 'created_by_user_id' },
  relatedBranchId: { type: DataTypes.UUID, allowNull: true, field: 'related_branch_id' },
  relatedOrderId: { type: DataTypes.UUID, allowNull: true, field: 'related_order_id' },
  assignedAdminUserId: { type: DataTypes.UUID, allowNull: true, field: 'assigned_admin_user_id' },
  subject: { type: DataTypes.STRING(180), allowNull: false },
  category: { type: DataTypes.STRING(60), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  priority: { type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'), allowNull: false, defaultValue: 'normal' },
  status: { type: DataTypes.ENUM('open', 'in_progress', 'waiting_for_restaurant', 'resolved', 'closed'), allowNull: false, defaultValue: 'open' },
  lastReplyAt: { type: DataTypes.DATE, allowNull: true, field: 'last_reply_at' },
}, {
  tableName: 'support_tickets',
  indexes: [
    { fields: ['restaurant_id', 'created_at'], name: 'support_tickets_restaurant_created_idx' },
    { fields: ['restaurant_id', 'status'], name: 'support_tickets_restaurant_status_idx' },
    { fields: ['created_by_user_id', 'created_at'], name: 'support_tickets_customer_created_idx' },
    { fields: ['reference'], unique: true, name: 'support_tickets_reference_uq' },
  ],
});
