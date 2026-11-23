
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Branch = sequelize.define(
  'Branch',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    restaurantId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'restaurant_id',
      references: {
        model: 'restaurants',
        key: 'id',
      },
    },

    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    branchCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'branch_code',
    },

    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
      validate: { isEmail: true },
    },

    addressLine: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'address_line',
    },

    addressLine2: { type: DataTypes.STRING(255), allowNull: true, field: 'address_line_2' },
    landmark: { type: DataTypes.STRING(150), allowNull: true },

    city: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    state: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    postalCode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'postal_code',
    },

    country: {
      type: DataTypes.STRING(100),
      defaultValue: 'India',
      allowNull: false,
    },

    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
    },

    longitude: {
      type: DataTypes.DECIMAL(10, 7),
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

    operationalStatus: {
      type: DataTypes.ENUM(
        'open',
        'closed',
        'temporarily_closed',
        'inactive'
      ),
      defaultValue: 'closed',
      allowNull: false,
      field: 'operational_status',
    },

    temporaryClosureUntil: { type: DataTypes.DATE, allowNull: true, field: 'temporary_closure_until' },
    temporaryClosureReason: { type: DataTypes.STRING(100), allowNull: true, field: 'temporary_closure_reason' },
    temporaryClosureToken: { type: DataTypes.STRING(36), allowNull: true, field: 'temporary_closure_token' },

    openingTime: { type: DataTypes.TIME, allowNull: true, field: 'opening_time' },
    closingTime: { type: DataTypes.TIME, allowNull: true, field: 'closing_time' },
    timeZone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'Asia/Kolkata', field: 'time_zone' },
    workingDays: { type: DataTypes.JSON, allowNull: false, defaultValue: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], field: 'working_days' },
    closedDays: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'closed_days' },
    overnight: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    dineInEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'dine_in_enabled' },
    takeawayEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'takeaway_enabled' },
    deliveryEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'delivery_enabled' },
    cashOnDeliveryEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'cash_on_delivery_enabled' },
    razorpayEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'razorpay_enabled' },
    isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_primary' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },

    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_reason',
    },
  },
  {
    tableName: 'branches',
    defaultScope: { attributes: { exclude: ['temporaryClosureToken'] } },
    indexes: [
      {
        unique: true,
        fields: ['restaurant_id', 'branch_code'],
      },
      { fields: ['approval_status'] },
      { fields: ['operational_status'] },
    ],
  }
);

module.exports = Branch;
