'use strict';

const crypto = require('node:crypto');
const { DataTypes, QueryTypes } = require('sequelize');

const INDEX_NAME = 'restaurants_qr_token_unique';

module.exports = {
  async up(queryInterface) {
    let columns = await queryInterface.describeTable('restaurants');
    if (!columns.qr_token) {
      await queryInterface.addColumn('restaurants', 'qr_token', { type: DataTypes.STRING(64), allowNull: true });
      columns = await queryInterface.describeTable('restaurants');
    }
    if (!columns.qr_url) await queryInterface.addColumn('restaurants', 'qr_url', { type: DataTypes.STRING(500), allowNull: true });

    const indexes = await queryInterface.showIndex('restaurants');
    if (!indexes.some((index) => index.name === INDEX_NAME)) {
      await queryInterface.addIndex('restaurants', ['qr_token'], { unique: true, name: INDEX_NAME });
    }

    const restaurants = await queryInterface.sequelize.query(
      'SELECT id, qr_token, qr_url FROM restaurants',
      { type: QueryTypes.SELECT },
    );
    for (const restaurant of restaurants) {
      const token = restaurant.qr_token || crypto.randomBytes(32).toString('base64url');
      const qrUrl = `/qr/${token}`;
      if (restaurant.qr_token !== token || restaurant.qr_url !== qrUrl) {
        await queryInterface.sequelize.query(
          'UPDATE restaurants SET qr_token = :token, qr_url = :qrUrl WHERE id = :id',
          { replacements: { id: restaurant.id, token, qrUrl } },
        );
      }
    }
  },

  async down(queryInterface) {
    const indexes = await queryInterface.showIndex('restaurants');
    if (indexes.some((index) => index.name === INDEX_NAME)) await queryInterface.removeIndex('restaurants', INDEX_NAME);
    const columns = await queryInterface.describeTable('restaurants');
    if (columns.qr_url) await queryInterface.removeColumn('restaurants', 'qr_url');
    if (columns.qr_token) await queryInterface.removeColumn('restaurants', 'qr_token');
  },
};
