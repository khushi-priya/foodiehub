# Database notes

Menu data is stored at restaurant level because the current application does not associate menus with branches.

Branch management extends the existing `branches` table rather than creating a duplicate. Migration `server/src/migrations/20261116120000-extend-branches.js` adds the optional second address line and landmark, operating schedule and overnight flag, service booleans, `is_active`, and `is_primary`. Existing branches remain intact; inactive operational rows are marked inactive and the oldest active branch per restaurant becomes primary where available. Existing `restaurant_id + branch_code` uniqueness remains in effect. Owner APIs serialize primary branch changes by locking the restaurant row in a transaction.

Marketplace open/closed status requires timezone context for branch operating times. Migration `server/src/migrations/20261116150000-add-branch-time-zone.js` adds `branches.time_zone` as an IANA timezone with an `Asia/Kolkata` default. Restaurant cuisine, rating, cover image, minimum order amount, and customer delivery locations are not modeled; the marketplace does not fabricate them.

- `menu_categories`: restaurant-owned categories with unique names per restaurant, active state, and display order.
- `menu_items`: restaurant-owned food items linked to a category; includes price, optional discount and image URL, food type, preparation time, availability, featured state, and display order.
- `menu_item_options`: optional `variant` and `addon` choices linked to an item and restaurant.

The migration `server/src/migrations/20261116090000-create-menu-tables.js` creates these tables and indexes without changing existing tables or data. To apply it, run from `server`:

```sh
npx sequelize-cli db:migrate --config src/config/sequelize-cli-config.js --migrations-path src/migrations
```

To undo the latest migration only, run the command below after reviewing that migration's `down` method. It can remove tables or columns and data created by that migration:

```sh
npx sequelize-cli db:migrate:undo --config src/config/sequelize-cli-config.js --migrations-path src/migrations
```

Customer dashboard storage is added by `server/src/migrations/20261116170000-create-customer-dashboard-data.js`. It creates customer addresses and wishlist entries, plus `orders` and `order_items` tables because the Sequelize models existed but these tables were absent in the inspected database. Customer-owned rows reference `users`; address and wishlist ownership cascades on account deletion.

Phase 6 migration `server/src/migrations/20261116180000-create-cart-and-checkout.js` adds unique per-customer cart headers, cart lines with selected option IDs, branch-level COD configuration (disabled by default), order type/idempotency fields, and order-item variant/add-on snapshots. Migration `20261116190000-add-order-packaging-fee.js` adds an order fee snapshot column, defaulting to zero until configured. Order models use Sequelize's standard camel-case timestamp attributes mapped by the global `underscored` setting to `created_at` and `updated_at`.
