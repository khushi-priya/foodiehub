const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('RestaurantInvitation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  restaurantMemberId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_member_id' },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'token_hash' },
  expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
  consumedAt: { type: DataTypes.DATE, allowNull: true, field: 'consumed_at' },
  invitedByUserId: { type: DataTypes.UUID, allowNull: false, field: 'invited_by_user_id' },
}, { tableName: 'restaurant_invitations', indexes: [{ fields: ['restaurant_member_id'] }, { fields: ['expires_at'] }] });
