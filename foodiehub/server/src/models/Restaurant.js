
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Restaurant = sequelize.define(
  'Restaurant',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    slug: {
      type: DataTypes.STRING(180),
      allowNull: false,
      unique: true,
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: { isEmail: true },
    },

    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    acceptingOrders: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'accepting_orders' },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    logo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    approvalStatus: {
      type: DataTypes.ENUM(
        'pending',
        'approved',
        'rejected',
        'suspended'
      ),
      defaultValue: 'pending',
      allowNull: false,
      field: 'approval_status',
    },

    listingStatus: {
      type: DataTypes.ENUM('draft', 'published', 'unlisted'),
      defaultValue: 'draft',
      allowNull: false,
      field: 'listing_status',
    },

    marketplaceEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      field: 'marketplace_enabled',
    },

    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason',
    },
  },
  {
    tableName: 'restaurants',
    indexes: [
      { fields: ['approval_status'] },
      { fields: ['listing_status'] },
    ],
  }
);

module.exports = Restaurant;
