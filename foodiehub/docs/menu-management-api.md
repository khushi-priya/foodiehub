# Restaurant menu management API

All endpoints use the existing session cookie and the `/api/v1/restaurant/menu` prefix. Requests require an authenticated user with an active `restaurant_owner` membership. The backend takes the restaurant from that membership; it does not accept a restaurant ID for menu ownership. Errors use `{ success: false, message }`; successful responses use `{ success: true, data }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/summary` | Category and item totals |
| GET/POST | `/categories` | List/create categories |
| PUT/DELETE | `/categories/:categoryId` | Update/delete an empty category |
| PATCH | `/categories/:categoryId/status` | Activate/deactivate (`{ isActive }`) |
| GET | `/items` | List items; supports `search`, `categoryId`, `availability=available\|unavailable` |
| GET | `/items/:itemId` | Read item with options |
| POST | `/items` | Create item |
| PUT/DELETE | `/items/:itemId` | Update/delete item |
| PATCH | `/items/:itemId/availability` | Set `{ isAvailable }` |
| PATCH | `/items/:itemId/featured` | Set `{ isFeatured }` |
| POST | `/items/:itemId/options` | Add an option (`type` is `variant` or `addon`) |
| PUT/DELETE | `/items/:itemId/options/:optionId` | Update/delete an option |

Item writes accept `name`, `description`, `categoryId`, `price`, optional `discountedPrice`, `imageUrl`, `foodType` (`veg`, `non_veg`, `egg`), `preparationTime`, `isAvailable`, `isFeatured`, `displayOrder`, and optional `options` array of `{ type, name, price, displayOrder }`. Prices are non-negative and a discount cannot exceed the regular price. Options can be edited alongside the item (replace the current options array) or individually through the options endpoints.

Categories cannot be deleted while they contain items. All category, item, and option lookups are scoped to the active restaurant membership, preventing cross-restaurant access. No public marketplace menu endpoint is exposed.
