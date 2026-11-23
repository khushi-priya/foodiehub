# Customer dashboard API

Customer APIs reuse the existing `foodiehub.sid` session cookie. Register at `POST /api/v1/auth/customer/register`, then sign in through the existing `POST /api/v1/auth/login`. Customer endpoints derive the user ID from the session and require an active account with the platform `customer` role. No endpoint accepts a customer ID for authorization.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/customer/register` | Create a customer account (first name, last name, email, optional phone, password, confirmation). |
| GET | `/api/v1/customer/summary` | Customer order and wishlist counts. |
| GET, PUT | `/api/v1/customer/profile` | Read profile; update first name, last name and phone. Email is read-only. |
| PUT | `/api/v1/customer/password` | Change password with current password and confirmation. |
| GET | `/api/v1/customer/orders` | Paginated orders for the session customer. Supports `page`, `limit` and `status`. Phase 6 also provides `GET /api/v1/customer/orders/:orderId` and `POST /api/v1/customer/orders`; see [cart and ordering API](customer-ordering-api.md). |
| GET, POST | `/api/v1/customer/addresses` | List or create the current customer's addresses. |
| PUT, DELETE | `/api/v1/customer/addresses/:addressId` | Update or remove an address owned by the current customer. |
| GET, POST | `/api/v1/customer/wishlist` | List saved items, or add `{type: "restaurant", restaurantId}` / `{type: "food", menuItemId}`. |
| DELETE | `/api/v1/customer/wishlist/:wishlistItemId` | Remove an item owned by the current customer. |

Address input uses `fullName`, `phone`, `house`, `street`, optional `landmark`, `city`, `state`, `postalCode`, `addressType` (`home`, `work`, `other`) and `isDefault`. The first saved address becomes default automatically. Setting a different default clears the previous default.

Restaurant wishlist entries are accepted only for marketplace-listed restaurants with an eligible active branch. Food entries must refer to available menu items in active categories under an eligible listed restaurant.

## Scope

Order history, order details, persistent cart, checkout and cash-on-delivery order placement are implemented in Phase 6. Online payments, coupons, configured tax/fees, delivery coverage checks, Help & Support and Settings remain unavailable and are not simulated.
