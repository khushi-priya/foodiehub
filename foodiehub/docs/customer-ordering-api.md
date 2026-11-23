# Customer cart and ordering API

All customer endpoints use the existing `foodiehub.sid` session and require an active user with the platform `customer` role. Customer identity comes from the session. Cart and order endpoints do not accept customer IDs.

## Cart

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/customer/cart` | Read the session customer's persisted cart and server-calculated prices. |
| POST | `/api/v1/customer/cart/items` | Add `{restaurantId, branchId, menuItemId, variantOptionId?, addonOptionIds?, quantity?}`. |
| PATCH | `/api/v1/customer/cart/items/:itemId` | Set `{quantity}` from 1 to 99. |
| DELETE | `/api/v1/customer/cart/items/:itemId` | Remove an owned cart line. |
| DELETE | `/api/v1/customer/cart` | Clear the current customer's cart. |

A cart holds one restaurant and branch. Another restaurant/branch returns `409` until the cart is cleared. Prices are reloaded from menu data. A selected variant's price replaces the discounted/base item price; selected add-ons are added to that price. Each line and subtotal are calculated using integer cents. Client-supplied prices are ignored.

## Checkout and orders

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/customer/checkout/summary?orderType=delivery&addressId=...` | Return current cart snapshot, branch payment availability, public Razorpay Key ID only when available, and server-calculated breakdown. Delivery requires a saved address owned by the customer. |
| POST | `/api/v1/customer/checkout/validate` | Revalidate `{orderType, paymentMethod, addressId?, orderNotes?}` before submission. |
| POST | `/api/v1/customer/orders` | Place a COD order from the server-side cart. Requires the checkout fields and a UUID `idempotencyKey`. |
| POST | `/api/v1/customer/checkout/razorpay/order` | Create/reuse a Razorpay order for the session customer's validated cart using `{orderType, addressId?, orderNotes?, idempotencyKey}`. Retrying an existing eligible unpaid order only needs its idempotency key. |
| POST | `/api/v1/customer/orders/:orderId/payments/razorpay/verify` | Verify the Razorpay signature and fetch the payment from Razorpay before marking the owned order paid. Body contains Razorpay's `razorpay_payment_id`, `razorpay_order_id`, and `razorpay_signature`. |
| POST | `/api/v1/customer/orders/:orderId/payments/razorpay/failure` | Fetch Razorpay's payment record and record a confirmed failed attempt for the owned order. |
| GET | `/api/v1/customer/orders` | Paginated own orders; accepts `page`, `limit` and a valid status. |
| GET | `/api/v1/customer/orders/:orderId` | Read one order belonging to the current customer. |
| GET | `/api/v1/restaurant/orders` | Restaurant-owner order list, protected by active owner membership; optionally filter by status or branch ID. |
| GET | `/api/v1/restaurant/orders/:orderId` | Read one order within the authorized restaurant. |
| PATCH | `/api/v1/restaurant/orders/:orderId/status` | Use the existing order status transitions within the authorized restaurant. |

Order creation ignores client restaurant, branch, total, price, tax, fee and payment-status values. It obtains restaurant/branch from the cart, checks public listing eligibility and branch operating hours, verifies requested service and current menu selections, and creates the order/items in one transaction. A retry with the same customer-scoped idempotency key returns the existing order. Menu names/descriptions, variant/add-on names and prices, and delivery-address values are saved as snapshots.

## Configuration boundaries

Restaurant owners can enable COD and Razorpay separately on each branch. A Razorpay Key ID and secret must also be set as backend-only `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` environment variables; the API must be restarted after changing them. Use the test key pair during development. The secret is never returned to React. COD orders begin with order status `pending` and payment status `pending`; the application does not claim that cash was collected. Razorpay orders also remain unpaid until the server verifies the signature and confirms a captured INR payment for the stored total. Repeated initiation uses the customer-scoped idempotency key, and the order details screen supports payment retry. No coupon, tax-rate, packaging-fee, delivery-fee, inventory/stock, or delivery-coverage rules are configured. Accordingly, no such charges are added, coupons are rejected as unconfigured, and the checkout page states that address serviceability has not been verified.

Restaurant owners cannot accept an unpaid Razorpay order. The existing restaurant order status endpoint returns an error until the server marks that order payment as paid; COD acceptance behavior remains unchanged.

Migration `20261116180000-create-cart-and-checkout.js` creates persistent cart tables, order type and idempotency storage, variant/add-on order snapshots, and branch COD configuration with a secure default of disabled. Migration `20261116190000-add-order-packaging-fee.js` adds the packaging-fee snapshot field; it remains zero until a real fee configuration is implemented. Migration `20261116200000-add-razorpay-checkout.js` adds per-branch Razorpay opt-in and gateway order/payment references.
