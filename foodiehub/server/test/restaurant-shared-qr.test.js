const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../src/migrations/20261213100000-add-restaurant-shared-qr');

test('shared restaurant QR migration adds restaurant fields and backfills each restaurant once', async () => {
  const columns = { id: {}, name: {} };
  const indexes = [];
  const restaurants = [
    { id: 'restaurant-a', qr_token: null, qr_url: null },
    { id: 'restaurant-b', qr_token: 'existing-restaurant-token-0000000000000000000000000000000000', qr_url: '/legacy/path' },
  ];
  const updates = [];
  const queryInterface = {
    sequelize: {
      async query(sql, options = {}) {
        if (sql.startsWith('SELECT')) return restaurants;
        updates.push(options.replacements);
        return [];
      },
    },
    async describeTable() { return { ...columns }; },
    async addColumn(_table, name) { columns[name] = {}; },
    async showIndex() { return [...indexes]; },
    async addIndex(_table, _fields, options) { indexes.push({ name: options.name }); },
  };

  await migration.up(queryInterface);

  assert.ok(columns.qr_token);
  assert.ok(columns.qr_url);
  assert.equal(indexes.length, 1);
  assert.equal(updates.length, 2);
  assert.match(updates[0].token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(updates[0].qrUrl, `/qr/${updates[0].token}`);
  assert.equal(updates[1].token, restaurants[1].qr_token);
  assert.equal(updates[1].qrUrl, `/qr/${restaurants[1].qr_token}`);
  assert.notEqual(updates[0].token, updates[1].token);
});

test('shared restaurant QR migration is safe to rerun when schema and QR values already exist', async () => {
  const token = 'restaurant-token-00000000000000000000000000000000000000';
  const columns = { id: {}, qr_token: {}, qr_url: {} };
  const indexes = [{ name: 'restaurants_qr_token_unique' }];
  let updates = 0;
  const queryInterface = {
    sequelize: { async query(sql) { if (sql.startsWith('SELECT')) return [{ id: 'restaurant-a', qr_token: token, qr_url: `/qr/${token}` }]; updates += 1; return []; } },
    async describeTable() { return columns; },
    async showIndex() { return indexes; },
  };

  await migration.up(queryInterface);
  assert.equal(updates, 0);
});
