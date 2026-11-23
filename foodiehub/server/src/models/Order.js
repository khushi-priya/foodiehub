const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define(
  'Order',
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

    customerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'customer_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },

    branchId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'branch_id',
    },

    tableId: { type: DataTypes.UUID, allowNull: true, field: 'table_id', references: { model: 'restaurant_tables', key: 'id' } },

    orderType: { type: DataTypes.ENUM('delivery', 'takeaway', 'dine_in'), allowNull: false, defaultValue: 'delivery', field: 'order_type' },
    kitchenStatus: { type: DataTypes.ENUM('queued', 'preparing', 'ready', 'handed_over'), allowNull: true, field: 'kitchen_status' },
    deliveryOtpHash: { type: DataTypes.STRING(64), allowNull: true, field: 'delivery_otp_hash' },
    deliveryOtpExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'delivery_otp_expires_at' },
    idempotencyKey: { type: DataTypes.UUID, allowNull: true, field: 'idempotency_key' },

    orderNumber: {
      type: DataTypes.STRING(40),
      allowNull: false,
      unique: true,
      field: 'order_number',
    },

    status: {
      type: DataTypes.ENUM(
        'pending',
        'accepted',
        'rejected',
        'preparing',
        'ready',
        'out_for_delivery',
        'completed',
        'cancelled'
      ),
      allowNull: false,
      defaultValue: 'pending',
    },

    paymentStatus: {
      type: DataTypes.ENUM(
        'pending',
        'paid',
        'failed',
        'refunded',
        'partially_refunded',
        'refund_pending',
        'refund_failed'
      ),
      allowNull: false,
      defaultValue: 'pending',
      field: 'payment_status',
    },

    paymentMethod: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'payment_method',
    },

    razorpayOrderId: { type: DataTypes.STRING(80), allowNull: true, unique: true, field: 'razorpay_order_id' },
    razorpayPaymentId: { type: DataTypes.STRING(80), allowNull: true, unique: true, field: 'razorpay_payment_id' },

    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },

    tax: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },

    deliveryFee: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'delivery_fee',
    },

    packagingFee: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'packaging_fee' },

    discount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    couponCode: { type: DataTypes.STRING(40), allowNull: true, field: 'coupon_code' },
    couponSource: { type: DataTypes.ENUM('platform_food', 'restaurant_food'), allowNull: true, field: 'coupon_source' },

    total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },

    customerName: {
      type: DataTypes.STRING(150),
      allowNull: false,
      field: 'customer_name',
    },

    customerPhone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'customer_phone',
    },

    customerEmail: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'customer_email',
    },

    deliveryAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'delivery_address',
    },

    customerNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'customer_notes',
    },

    restaurantNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'restaurant_notes',
    },

    acceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'accepted_at',
    },

    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },

    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'cancelled_at',
    },
  },
  {
    tableName: 'orders',
    indexes: [
      { fields: ['restaurant_id', 'created_at'] },
      { fields: ['restaurant_id', 'status'] },
      { fields: ['table_id', 'status'], name: 'orders_table_status_idx' },
      { fields: ['customer_id'] },
      { fields: ['customer_id', 'idempotency_key'], unique: true },
      { fields: ['order_number'], unique: true },
    ],
  }
);

module.exports = Order;
