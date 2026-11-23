const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('PlatformSetting', {
  key: { type: DataTypes.STRING(80), primaryKey: true, allowNull: false, field: 'setting_key' },
  value: { type: DataTypes.TEXT, allowNull: false, field: 'setting_value' },
  updatedBy: { type: DataTypes.UUID, allowNull: true, field: 'updated_by' },
}, { tableName: 'platform_settings', underscored: true, timestamps: true });
