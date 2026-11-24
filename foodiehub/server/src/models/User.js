
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'first_name',
    },

    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'last_name',
    },

    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },

    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
    },

    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },

    status: {
      type: DataTypes.ENUM(
        'pending',
        'active',
        'suspended',
        'blocked'
      ),
      defaultValue: 'pending',
      allowNull: false,
    },

    emailVerifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'email_verified_at',
    },

    emailVerificationOtpHash: { type: DataTypes.STRING(64), allowNull: true, field: 'email_verification_otp_hash' },
    emailVerificationOtpExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'email_verification_otp_expires_at' },
    emailVerificationOtpAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'email_verification_otp_attempts' },
    emailVerificationOtpSentAt: { type: DataTypes.DATE, allowNull: true, field: 'email_verification_otp_sent_at' },
    emailVerificationOtpRequestCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'email_verification_otp_request_count' },
    emailVerificationOtpRequestWindowAt: { type: DataTypes.DATE, allowNull: true, field: 'email_verification_otp_request_window_at' },

    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login_at',
    },
  },
  {
    tableName: 'users',
    defaultScope: { attributes: { exclude: ['emailVerificationOtpHash', 'emailVerificationOtpExpiresAt', 'emailVerificationOtpAttempts', 'emailVerificationOtpSentAt', 'emailVerificationOtpRequestCount', 'emailVerificationOtpRequestWindowAt'] } },
    indexes: [
      { fields: ['status'] },
    ],
  }
);

module.exports = User;
