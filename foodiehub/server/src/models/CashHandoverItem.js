'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CashHandoverItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  handoverId: { type: DataTypes.UUID, allowNull: false, field: 'handover_id' },
  codCollectionId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'cod_collection_id' },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
}, { tableName: 'cash_handover_items', underscored: true });
