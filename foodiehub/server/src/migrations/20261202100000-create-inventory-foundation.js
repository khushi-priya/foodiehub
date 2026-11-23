'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('inventory_items', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      name: { type: DataTypes.STRING(150), allowNull: false },
      sku: { type: DataTypes.STRING(60), allowNull: false },
      unit: { type: DataTypes.STRING(24), allowNull: false },
      quantity_on_hand: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
      reorder_level: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
      unit_cost: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('inventory_items', ['branch_id', 'sku'], { unique: true, name: 'inventory_items_branch_sku_uq' });
    await queryInterface.addIndex('inventory_items', ['restaurant_id', 'branch_id', 'is_active'], { name: 'inventory_items_scope_active_idx' });

    await queryInterface.createTable('inventory_movements', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      inventory_item_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inventory_items', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      movement_type: { type: DataTypes.ENUM('opening', 'adjustment_in', 'adjustment_out', 'wastage', 'purchase_receipt', 'order_deduction'), allowNull: false },
      quantity_change: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
      quantity_after: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
      idempotency_key: { type: DataTypes.STRING(120), allowNull: false },
      note: { type: DataTypes.STRING(500), allowNull: true },
      actor_user_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('inventory_movements', ['inventory_item_id', 'idempotency_key'], { unique: true, name: 'inventory_movement_idempotency_uq' });
    await queryInterface.addIndex('inventory_movements', ['restaurant_id', 'branch_id', 'created_at'], { name: 'inventory_movement_scope_date_idx' });

    await queryInterface.createTable('inventory_suppliers', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      name: { type: DataTypes.STRING(150), allowNull: false },
      contact_name: { type: DataTypes.STRING(150), allowNull: true },
      email: { type: DataTypes.STRING(150), allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      address: { type: DataTypes.STRING(500), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('inventory_suppliers', ['restaurant_id', 'name'], { name: 'inventory_supplier_restaurant_name_idx' });

    await queryInterface.createTable('inventory_purchase_orders', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      supplier_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inventory_suppliers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      reference: { type: DataTypes.STRING(60), allowNull: false },
      status: { type: DataTypes.ENUM('draft', 'ordered', 'received', 'cancelled'), allowNull: false, defaultValue: 'draft' },
      total_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      ordered_at: { type: DataTypes.DATE, allowNull: true },
      received_at: { type: DataTypes.DATE, allowNull: true },
      created_by_user_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('inventory_purchase_orders', ['restaurant_id', 'branch_id', 'reference'], { unique: true, name: 'inventory_po_reference_uq' });
    await queryInterface.addIndex('inventory_purchase_orders', ['restaurant_id', 'branch_id', 'status'], { name: 'inventory_po_scope_status_idx' });

    await queryInterface.createTable('inventory_purchase_order_items', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      purchase_order_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inventory_purchase_orders', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      inventory_item_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inventory_items', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
      unit_cost: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
      line_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('inventory_purchase_order_items', ['purchase_order_id', 'inventory_item_id'], { unique: true, name: 'inventory_po_item_unique' });

    await queryInterface.createTable('inventory_recipes', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      restaurant_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'restaurants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      branch_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'branches', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      menu_item_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'menu_items', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      yield_quantity: { type: DataTypes.DECIMAL(8, 3), allowNull: false, defaultValue: 1 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('inventory_recipes', ['restaurant_id', 'branch_id', 'menu_item_id'], { unique: true, name: 'inventory_recipe_menu_branch_uq' });

    await queryInterface.createTable('inventory_recipe_ingredients', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      recipe_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inventory_recipes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      inventory_item_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inventory_items', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex('inventory_recipe_ingredients', ['recipe_id', 'inventory_item_id'], { unique: true, name: 'inventory_recipe_ingredient_uq' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('inventory_recipe_ingredients');
    await queryInterface.dropTable('inventory_recipes');
    await queryInterface.dropTable('inventory_purchase_order_items');
    await queryInterface.dropTable('inventory_purchase_orders');
    await queryInterface.dropTable('inventory_suppliers');
    await queryInterface.dropTable('inventory_movements');
    await queryInterface.dropTable('inventory_items');
  },
};
