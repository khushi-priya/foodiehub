const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('MenuItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  restaurantId: { type: DataTypes.UUID, allowNull: false, field: 'restaurant_id' },
  categoryId: { type: DataTypes.UUID, allowNull: false, field: 'category_id' },
  name: { type: DataTypes.STRING(150), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, validate: { min: 0 } },
  discountedPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'discounted_price', validate: { min: 0 } },
  imageUrl: { type: DataTypes.STRING(1000), allowNull: true, field: 'image_url' },
  foodType: { type: DataTypes.ENUM('veg', 'non_veg', 'egg'), defaultValue: 'veg', allowNull: false, field: 'food_type' },
  dietaryTags: { type: DataTypes.JSON, allowNull: true, field: 'dietary_tags' },
  allergenTags: { type: DataTypes.JSON, allowNull: true, field: 'allergen_tags' },
  preparationTime: { type: DataTypes.INTEGER, allowNull: true, field: 'preparation_time', validate: { min: 0 } },
  isAvailable: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false, field: 'is_available' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false, field: 'is_active' },
  moderationStatus: { type: DataTypes.ENUM('clear', 'hidden', 'disabled'), defaultValue: 'clear', allowNull: false, field: 'moderation_status' },
  moderationReason: { type: DataTypes.TEXT, allowNull: true, field: 'moderation_reason' },
  moderatedBy: { type: DataTypes.UUID, allowNull: true, field: 'moderated_by' },
  moderatedAt: { type: DataTypes.DATE, allowNull: true, field: 'moderated_at' },
  isFeatured: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false, field: 'is_featured' },
  displayOrder: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false, field: 'display_order' },
}, { tableName: 'menu_items', indexes: [{ fields: ['restaurant_id', 'category_id'] }, { fields: ['restaurant_id', 'is_available'] }] });
