'use strict';
const { DataTypes } = require('sequelize');

const defaults = {
  platformName: 'FoodieHub', platformLogo: '', contactEmail: '', contactPhone: '', supportInfo: '',
  defaultCurrency: 'INR', timezone: 'Asia/Kolkata', taxEnabled: false, taxRate: 0, platformAvailable: true,
};

module.exports = {
  async up(q) {
    await q.createTable('platform_settings', {
      setting_key: { type: DataTypes.STRING(80), primaryKey: true, allowNull: false },
      setting_value: { type: DataTypes.TEXT, allowNull: false },
      updated_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await q.bulkInsert('platform_settings', Object.entries(defaults).map(([key, value]) => ({ setting_key: key, setting_value: JSON.stringify(value), updated_by: null, created_at: new Date(), updated_at: new Date() })));
  },
  async down(q) { await q.dropTable('platform_settings'); },
};
