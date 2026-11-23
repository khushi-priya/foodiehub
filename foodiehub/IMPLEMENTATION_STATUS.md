# Implementation status

## Initial master audit checkpoint (2026-11-22; subsequent implementation is recorded below)

- Added `AUDIT_REPORT.md` with the repository-based requirement matrix, identified gaps, priority plan, and verification boundary for the single FoodieHub codebase present in this workspace. Project 2 is not present and is not treated as audited or merged.
- Fixed the cashier post-login path in `client/src/context/AuthContext.jsx`: it now opens the existing protected restaurant order workspace instead of unregistered `/restaurant/pos`. This is a safe reachable fallback; it does not represent a POS implementation.
- Confirmed major remaining gaps from source inspection: POS/billing, inventory/ingredients/suppliers/purchasing, customer notification preferences, and durable restaurant/customer notifications. Customer support has since been implemented through shared support tickets; the audit lists broader items requiring end-to-end verification.
- Verification on 2026-11-22: server `npm test` passed (52/52); client `npm run build` passed (Vite emitted the existing >500 kB chunk advisory); client `npm run lint` exited 0 with existing warnings. The cashier path has compile/build coverage but no browser login interaction was run.

## Phase 1 – Razorpay order refunds

- Added `OrderRefund` as a separate financial record. A unique order reference prevents duplicate refund submissions. Full refunds are allowed only for captured and paid Razorpay orders already cancelled or rejected by restaurant staff.
- Added `payments.refund`, granted to restaurant owners and available to authorized custom roles. The API derives restaurant and branch access from authenticated membership middleware, never from request-supplied tenant IDs.
- Added `POST /api/v1/restaurant/orders/:orderId/refund` and `GET /api/v1/restaurant/orders/:orderId/refund`. Provider state is verified before submission; uncertain responses are stored as `unknown` and reconciled against Razorpay notes/refund records without automatically submitting a duplicate. Order payment state becomes refunded only when Razorpay reports processed; commission adjustments run in that database transaction.
- Refund requests write immutable audit-log events. Restaurant order details support issuing/reconciling refunds; customer order details show progress; Super Admin order details and refund reports show saved refund amount/reference.
- Migration `20261201100000-create-order-refunds.js` was applied to the configured development database. A follow-up query verified the new model/order association and confirmed the seeded restaurant-owner role has `payments.refund`.
- Added `server/test/order-refunds.test.js`: 5 service workflow tests cover eligibility, full amount and pending state, duplicate suppression, uncertain provider results, reconciliation, payment status, and one-time commission reversal. These tests use mocked provider responses.
- Phase 1 verification on 2026-11-22: full server suite passed (57/57); client production build passed (existing >500 kB chunk advisory); lint exited 0 with existing warnings; refund table/association read queries passed; migration status reports the refund migration up. No browser session/API acceptance suite or real Razorpay refund was run. There is no captured test payment available; external payment verification remains outstanding.
- **Phase 1 remains in progress.** See `AUDIT_REPORT.md` for the high-risk end-to-end acceptance checks still needed. No Phase 2 work has started.

## Completed

- Existing customer, Super Admin, and Restaurant Owner authentication and role-protected layouts remain in place.
- Restaurant Owners can manage restaurant-level menu categories, food items, availability, featured status, variants, and add-ons.
- Menu dashboard totals, category item counts, search, and filters load from the menu API.
- Menu APIs derive the restaurant from the authenticated active owner membership. Pending approval does not block private menu management and no public listing endpoint was added.
- Database migration: `20261116090000-create-menu-tables.js`.

## Current limitations

- Image entry accepts an HTTP(S) image URL. No file upload storage or upload middleware is configured in the existing project.
- Menu ordering is customer-visible from approved marketplace listings; persistent carts and order placement are covered under Phase 6 below.
- Category deletion is blocked while items are assigned; item deletion removes its option records.

## Phase 4: Branch management

- Extended the existing `Branch` model and table with location address fields, operating hours/days, overnight support, service flags, active state, and primary state.
- Restaurant Owners can create and update branches, inspect details, search and filter with pagination, activate/deactivate locations, and set an active branch as primary.
- Primary changes run inside transactions that lock the restaurant row; the first active branch is primary by default. A primary branch cannot be deactivated while another active branch exists until a replacement is selected.
- Branch code uniqueness continues to use the existing per-restaurant unique index. Operational data is retained through deactivation; no branch delete operation is exposed.
- Super Admin restaurant details include read-only branch location and status information.
- Database migration: `20261116120000-extend-branches.js`.

## Phase 5: Customer marketplace

- Activated the existing customer homepage design, connected its restaurant search and featured listings to public marketplace data, and kept the existing `/login` account selection and role destinations.
- Added public restaurant discovery with search, category and food-type filters, branch services, open-now filtering, preparation-time sorting, and pagination.
- Added public restaurant details, eligible branch selection, available menu browsing, and a food detail dialog with selectable variants and add-ons (no cart or checkout persistence).
- Public APIs require an approved restaurant, a published listing, marketplace enabled, and at least one active eligible branch. Responses are whitelisted and exclude owner and internal management fields.
- Restaurant schema currently has no cuisine, rating, minimum order, or cover image field; customer UI reports these as unavailable. The logo is used when present.
- Added branch timezone support (default `Asia/Kolkata`) so opening status uses the branch's stored hours, working days, overnight rule, and IANA timezone.
- Database migration: `20261116150000-add-branch-time-zone.js`.

## Verification

- `client`: `npm run build` passed.
- `client`: `npm run lint` exited successfully; it reports existing repository warnings in AuthContext, admin/restaurant pages, and marketplace effects. No warnings originate from the new customer layout/profile/address/login/register pages.
- `server`: `node --check` passed for the modified auth/customer controllers, middleware, routes, model registry, and customer migration.
- Applied and checked migrations through `20261116180000-create-cart-and-checkout.js`; no migrations are pending.
- API smoke test against the configured local server passed registration, login, session restoration, zero-data summary, profile read/update, unauthenticated API rejection, and cross-customer address isolation. Temporary test users and addresses were removed.
- Admin and restaurant-owner browser login flows were not exercised; their role destinations and protected layouts were left unchanged by inspection.

## Phase 6: customer cart, checkout, and orders

- Added persistent `CustomerCart` and `CustomerCartItem` storage. A cart is bound to exactly one restaurant and branch. Adding a different restaurant/branch returns a clear conflict; customers can remove lines or clear the cart.
- Cart endpoints re-read current menu and option records and calculate prices in integer cents. A variant price replaces the menu base price; add-on prices are added to the selected base. Frontend-supplied price and total fields are ignored. Invalid/stale options and unavailable menu items are rejected at add/update/checkout.
- Added checkout summary and validation for saved customer-owned addresses, branch-supported Delivery/Takeaway/Dine-in choices, open hours in the branch time zone, and COD configuration. Delivery coverage is explicitly unverified. No stock module exists.
- Added branch-level payment configuration for restaurant owners. COD orders begin with `paymentStatus=pending`; no payment-success simulation is used. (Razorpay was added in the checkout update below.) No coupon module, tax, packaging-fee, or delivery-fee configuration exists. Such charges remain zero, and checkout discloses the missing configuration.
- Order creation reads the session customer's cart, validates the marketplace restaurant and branch, reprices all lines, snapshots item descriptions, variants, add-ons and delivery address, creates records transactionally, and clears the cart only on success. A customer-scoped unique idempotency key prevents retry duplicates.
- Added customer order history/detail/confirmation pages and own-order authorization. Connected the existing restaurant order controller to protected routes and the Restaurant Owner portal; the owner sees only orders for the restaurant resolved from their active membership.

## Marketplace visibility bug fix

- The saved `noodles` item (₹200, discounted to ₹150) and active `chinese` category are attached to restaurant `Pizza House`. The restaurant is approved but remains `listingStatus=draft`, `marketplaceEnabled=false`, and has no branches. The public browse API correctly excludes it because listing publication and an eligible branch are both required.
- Added a Super Admin-only listing endpoint and controls to publish/unpublish approved restaurants. Publishing requires an existing eligible active branch; it does not approve restaurants or alter branch/menu data. The restaurant owner must create a real branch, then a Super Admin can explicitly publish it.
- The reported restaurant was not modified. See `docs/marketplace-api.md` for the endpoint and public visibility rules.
- Corrected Order/OrderItem timestamp mapping so existing owner/customer order queries address the migration's `created_at` and `updated_at` columns through Sequelize's standard `createdAt`/`updatedAt` attributes.
- Database migrations: `20261116180000-create-cart-and-checkout.js` and `20261116190000-add-order-packaging-fee.js`.

### Phase 6 verification

- Production client build passed. Backend `node --check` passed for cart/checkout/order routes, controllers, models, migration and branch availability helper.
- Applied the Phase 6 migration to the configured database.
- API integration checks passed for persistent cart reads, selected variant/add-on repricing, quantity update, invalid option and unavailable item rejection, restaurant/branch mixing rejection, ignoring client totals, unsupported service rejection, zero configured fees, COD order creation with snapshots, idempotent retry, cart clearing after order, customer order isolation, and authorized restaurant-owner order visibility. All temporary test fixtures were removed.
- Coupon flows are unavailable because that integration is absent. COD must be enabled per branch by its restaurant owner.

## Checkout and Razorpay update

- Root cause of the missing Razorpay option: there was no Razorpay SDK, payment API/controller, route, branch opt-in, or order payment flow. The checkout was deliberately hard-coded to COD and displayed an unavailable Razorpay message; the backend environment has both `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` configured.
- Added the official Razorpay Node SDK and per-branch online payment opt-in (secure default disabled). Checkout summary only offers Razorpay when both backend credentials and the selected branch opt-in are present, and returns the public Key ID only in that enabled state. The secret never leaves the backend.
- Added server-calculated Razorpay order creation with customer-scoped idempotency, an order retry path, signature verification, server-side payment fetch/capture/amount/currency confirmation, and server-confirmed payment failure recording. Orders remain `pending` until verification confirms the full captured amount; COD continues to use pending payment status.
- Restaurant order acceptance is blocked for Razorpay orders until payment is verified; the owner order list marks unpaid online orders and disables Accept. COD acceptance remains unchanged.
- Redesigned customer checkout with responsive delivery, address, instructions, payment selection, item thumbnails, an itemized total, responsive payment action, loading/error/empty states, and secure-payment feedback. Eligible unpaid online orders can be retried from order details.
- Migration: `20261116200000-add-razorpay-checkout.js` adds branch opt-in and payment identifiers. Backend setup uses `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`; restart the API after configuration changes. Test keys start with `rzp_test_`.

### Checkout update verification

- Applied and checked the Razorpay migration against the configured database.
- The configured database currently has one branch, COD enabled, and no branches opted into Razorpay. To display Razorpay for customers, the restaurant owner must edit the branch and enable “Accept Razorpay online payments.” This explicit opt-in is retained as the secure default.
- Production client build passed; lint exited successfully with existing warnings in other files. The checkout and order retry pages report no new lint warnings.
- Temporary database-backed checks passed for COD availability/order creation/unpaid status/idempotency, Razorpay availability and secret isolation, server-calculated totals, pending-before-verification state, invalid signature rejection, customer order ownership, confirmed failure, retry without duplicate FoodieHub orders, and blocking restaurant acceptance until online payment is paid. Mocked provider responses tested authorized-to-captured, captured, and failed payment paths.
- The configured Razorpay test credentials successfully created a small unpaid test-mode Razorpay order through the real SDK. No customer payment was completed. Browser checkout interaction and a test capture were not performed.
- API response security headers were checked to allow Razorpay Checkout while retaining Helmet defaults. Customer authentication and Super Admin dashboard flows remain unchanged; the Restaurant Owner branch settings and order acceptance control were extended for payment availability and safety.

## Customer dashboard

- Added a customer-only protected `/customer` layout and `/customer/dashboard`, with customer navigation, responsive mobile drawer, profile menu, logout, marketplace search, database-backed order and wishlist summaries, recent orders, and marketplace recommendations.
- Added customer registration through the existing session authentication system. Customer login and registration route to the customer dashboard; role checks keep customer pages separate from admin and restaurant-owner portals.
- Added customer profile editing for name and phone, email display, and password change with current-password verification. Customer identity is always derived from the session.
- Added private address CRUD with single-default behavior and customer-owned restaurant/food wishlist APIs and UI.
- Connected the dashboard to customer-owned order history. The configured database initially had no order tables; migrations now create the order schema and Phase 6 adds transactional order creation.
- Settings and notification preferences remain clearly labelled later-phase placeholders. Customer Help & Support now uses the shared persisted ticket system. The cart, checkout, and order flow uses persisted database records; no fake cart or orders are created.
- Database migration: `20261116170000-create-customer-dashboard-data.js`.

## Restaurant order operations and customer tracking

- Reworked restaurant order management into a responsive operations workspace with backend search, branch/date/status filters, server-derived status counts, pagination, payment state, order details, and confirmed rejection/cancellation actions.
- Added dedicated kitchen queue and waiter service screens. Active kitchen and waiter memberships are limited to their assigned branches; kitchen staff can advance accepted orders through preparation, and waiters can mark ready orders served. Owner order access and the Razorpay payment acceptance guard remain in place.
- Added customer order progress timeline, automatic status refresh, item totals and payment state. No delivery-time estimate is shown because the order data has no reliable estimate.
- Current menu item images are included when available for restaurant and customer order line items. Missing/deleted menu images remain absent rather than being replaced with placeholders.

## Phase 1 end-to-end verification checkpoint — 2026-11-22

The existing Razorpay refund implementation was inspected alongside its tests, audit, status notes, and `docs/order-refunds-api.md`; it was preserved and not recreated. This checkpoint is explicitly **incomplete** and does not authorize Phase 2.

### Checks performed

- `server`: `npm test` passed: 57 passed, 0 failed, 0 skipped. Refund provider behavior in the existing tests is mocked.
- `client`: `npm run build` passed. Vite emitted a large-chunk warning (>500 kB minified).
- `client`: `npm run lint` exited successfully with existing repository warnings.
- Local API HTTP checks: health returned 200; anonymous requests to `/api/v1/auth/me`, `/api/v1/admin/dashboard`, `/api/v1/restaurant/branches`, and `/api/v1/customer/summary` returned 401.
- Database fixture count inspection found one Super Admin and two Customers; no employee or Restaurant Owner role users exist. No persistent user/business fixture was inserted in this checkpoint.
- Source inspection confirms delivery work is modeled as restaurant delivery employee roles; a separate delivery-partner portal is not implemented.
- Source inspection found no restaurant document submission endpoint/field in the registration contract/model.
- QR source review found `resolveTableQr` permits active tables with occupancy status `available` or `occupied`; public table selection is available-only. This policy discrepancy requires a real workflow decision and test. No change was made based on inspection alone.
- No scanner/phone/browser-camera was available. QR generation and actual scan workflows were not tested; no scan is claimed.
- No captured Razorpay test payment was available. No customer payment or provider refund was initiated. No duplicate provider reconciliation was exercised over HTTP.

### Acceptance matrix

| Requirement | Status | Notes |
|---|---|---|
| Authenticated access for Super Admin, Owner, Manager, Waiter, Kitchen Staff, Cashier, Customer | **PARTIAL / API CHECKS PASSED** | Disposable live sessions exercised selected positive and denied APIs for all listed roles. This is not exhaustive feature or browser route coverage. |
| Delivery Staff authenticated access | **PARTIAL / API CHECKS PASSED** | Restaurant Delivery Associate dashboard, self-availability, and POS denial passed. No independent delivery partner portal exists. |
| Restaurant and branch isolation; custom role permissions; refund authorization | **PARTIAL** | Cross-tenant/branch/custom permission tests passed in inventory/POS/reservation routes; waiter refund denial passed; owner request reached captured-payment eligibility validation (409), confirming authorization without provider refund. Broader endpoint coverage remains open. |
| Customer rejection from restaurant/admin APIs; client/backend route agreement | **PARTIAL** | Customer denial from admin, restaurant, and POS APIs passed. Browser route/backend agreement was not tested. |
| Customer and restaurant registration, document submission, admin approval/rejection, activation/login | **PARTIAL / API CHECKS PASSED** | Customer registration/login and restaurant registration, pending session, approval/rejection and approved owner API access passed. Document submission is unsupported; browser destination checks remain untested. |
| Concurrent reservations, confirmation contention, cancellation and availability restoration | **PARTIAL / PASSED** | Two concurrent customers created unassigned requests; racing staff confirmation calls for the same overlapping table yielded exactly one 200 and one 409. Customer cancellation restored availability; a competing request then confirmed. Other capacity/date/timezone and browser cases remain open. |
| Restaurant/branch/table QR, scanner resolution, invalid/inactive token, occupancy and ordering | **PARTIAL** | Restaurant/branch/table QR generation and token resolution passed; authenticated cart and idempotent dine-in order passed; table only occupied on order placement, and deactivated QR could not add items. PNG optical scan and ordering from an already occupied table remain untested. |
| Order creation/status/cancel, payment verification, refund eligibility and duplicate reconciliation | **PARTIAL / LIVE CHECKS INCOMPLETE** | QR/COD order creation/idempotency and separate order/payment states passed; POS split cash passed. Razorpay captured payment verification/refund and cancellation/reconciliation remain untested. |
| Existing refund service tests and migration | **PASSED / PRESERVED** | Existing suite passed. No checkpoint migration changes or applications. Pre-existing refund migration remains `20261201100000-create-order-refunds.js`. |

### Files and migrations

- Changed: `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md` only.
- Source/tests: none changed.
- Migrations created/applied in this checkpoint: none.
- Existing refund migration: `server/src/migrations/20261201100000-create-order-refunds.js` (preserved; previously applied status unchanged).

### Phase 1 decision

**Phase 1 is not complete.** The requested authenticated role matrix, registration/approval, reservation concurrency, QR scan/order, and live payment/refund acceptance cases are blocked or not tested. Resume these against isolated disposable fixtures, preserve production records, and use Razorpay test mode only with a captured test payment. Do not proceed to Phase 2 until each required case passes or is explicitly blocked with a concrete external dependency.

## Role matrix and QR API acceptance — 2026-11-22

- Re-ran the opt-in real HTTP fixture workflow. Customer, Super Admin, Owner, Manager, Waiter, Kitchen Staff, Cashier, and restaurant Delivery Associate sessions exercised selected permitted and denied routes. Selected branch checks returned 403 for an unassigned branch; cross-restaurant inventory mutation returned 404; custom `inventory.view` access allowed read and denied write; waiter refund request returned 403. These checks are partial authorization coverage, not an exhaustive route matrix. Owner refund allow-path and browser/client route parity are not yet tested.
- Manager inventory read returned 200 and POS denial 403. Waiter assigned-table order read returned 200; unassigned branch, kitchen transition, inventory, and refund access were denied. Kitchen order read and preparation transition returned 200, inventory denial 403. Delivery Associate dashboard and own availability returned 200, POS denial 403. Customer admin, restaurant, and POS operations were denied (403). Cashier POS access/branch restrictions passed in the POS suite.
- Customer registration/login/session/logout and restaurant registration, pending owner session, Super Admin approval and rejection, and approved owner API access passed. No document-upload contract/model exists. Browser dashboard destinations were not exercised.
- Concurrent reservation confirmation, cancellation restoration, ownership and branch mismatch checks passed as documented below.
- Restaurant and branch menu QR endpoints each returned a PNG data URL with URLs identifying the restaurant and branch. Individual table QR generation returned a data URL and token URL; the public resolver returned the expected branch/table, malformed and revoked tokens returned 404, inactive QR issuance returned 409, and resolution did not change available occupancy. Authenticated customer QR ordering then added a menu item to a cart bound to that table and created a dine-in order with `status=pending` and `paymentStatus=pending`; retry returned the same order. The table changed to occupied only after order submission, and a revoked token could no longer add an item. No phone or optical QR decoder is installed, so the generated PNG itself was not scanned. Further ordering from an already occupied table remains unresolved by business-policy test.
- This run's Razorpay POS test-order request returned 502 due provider connectivity; the acceptance runner permits that status as an external dependency outcome. Earlier test-mode order creation and no-capture reconciliation passed, but provider availability is intermittent. No payment was captured and no provider refund was performed.
- The fixture runner completed with `result: PASS` and verified cleanup. The pass means assertions matched, not that the provider-dependent or optical-scan checks passed.
- Changed: `server/scripts/phase1-auth-onboarding-smoke.js`, `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`. No migrations applied. Phase 1 remains incomplete.

## Phase 1 follow-up: authentication and restaurant approval

The following HTTP acceptance cases now pass using the opt-in disposable-fixture runner `server/scripts/phase1-auth-onboarding-smoke.js`:

- Customer registration/login/session restore succeeded. Customer requests to Super Admin and restaurant APIs returned 403. Logout invalidated the session (subsequent `/auth/me` returned 401).
- Temporary Super Admin dashboard access succeeded (200). Restaurant Owner login/session restoration succeeded while approval was pending; Owner admin access was denied (403). After approval, the Owner restaurant branch API succeeded (200).
- Restaurant registration returned 201. Super Admin approval returned 200 (`approved`); a separate registration rejection returned 200 (`rejected`).
- The runner removed its unique temporary users, restaurants, memberships, and audit entries, logged out temporary sessions, and verified no matching user or restaurant rows remained.

### Verified defect fixed

The first live approval request failed with MySQL lock wait timeout. The audit mutation helper held a row lock in a transaction, but approve/reject/suspend/reactivate called `current.update()` without that transaction. Those updates now use the existing transaction. The acceptance runner passed after the fix.

### Regression verification and remaining status

- Server test suite: 57 passed, 0 failed, 0 skipped.
- Server syntax checks passed for the changed controller and smoke runner.
- Client build passed with the large-chunk warning; lint exited successfully with existing repository warnings.
- Still incomplete/blocked: Manager, Waiter, Kitchen Staff, Cashier, and Delivery Staff authenticated checks; custom permissions, branch/tenant isolation, refund authorization, browser/backend route agreement; document upload (no existing endpoint/model field found); reservation concurrency/cancel restoration; QR scan/token/ordering; captured Razorpay payment, refund reconciliation, and full order/payment lifecycle.
- Phase 1 remains **INCOMPLETE**. No Phase 2 work started.

Files changed in this follow-up: `server/src/modules/admin/restaurant.controller.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `AUDIT_REPORT.md`, and `IMPLEMENTATION_STATUS.md`. No migrations were added or applied. The refund implementation and migration remain unchanged.

## Inventory foundation and order recipe deduction — partial

Implemented the first end-to-end inventory operations slice from the master prompt:

- Branch-scoped ingredient records, SKU uniqueness, opening balances, stock ledger, quantity adjustments, wastage, low-stock alerts, unit costs, restaurant suppliers, purchase orders, transactional receiving, recipe definitions, and ingredient cost estimates.
- When a configured recipe order enters `preparing`, its ingredient stock is deducted inside the existing order status transaction. Insufficient stock rejects the transition and leaves both order and stock unchanged. Existing orders without recipes remain supported and do not deduct ingredients.
- Added the restaurant Inventory workspace for stock, movement, supplier, purchase order, and recipe workflows.
- Backend permissions use existing `inventory.view` and `inventory.manage` roles. Branch checks are enforced on requested and resolved records.

### Verification

- Applied `server/src/migrations/20261202100000-create-inventory-foundation.js` using Sequelize CLI. No data reset or destructive sync was used.
- Extended `server/scripts/phase1-auth-onboarding-smoke.js`; live HTTP acceptance passed for stock/opening balance/valuation, adjustment idempotency, wastage/low-stock, supplier, PO create/place/receive, duplicate receipt prevention, recipe save/read/cost, owner acceptance/preparing, stock deduction, repeated status protection, insufficient-stock rollback, cross-restaurant item access, cashier denial, custom-role read/write enforcement, unassigned branch rejection, registration approval/rejection and session invalidation. Temporary records and sessions were removed and cleanup verified.
- `server/test/inventory-stock.test.js`: four tests cover stock deduction, complete replay idempotency, insufficient stock, and orders without recipes.
- Server suite: 61 passed, 0 failed, 0 skipped. Changed JS syntax checks passed.
- Client build passed (large bundle warning). Client lint exited successfully; it reports repository warnings, including some in the new inventory screen. Browser and responsive viewport verification remains outstanding.
- Recipe page now renders cost per serving, food cost %, menu price, estimated gross margin and the cost exclusions from the API response. Client build and quiet lint were rerun after this update and passed; the >500 kB bundle warning remains.

### Incomplete inventory work

Inventory is not complete to the full prompt. Partial purchase receipts, supplier invoice/payment reconciliation, unit conversions, batch/expiry tracking, configurable valuation methods, waste approvals, restock/void accounting policy, and inventory reports remain unimplemented. POS orders use the shared recipe deduction workflow when entering `preparing`. Recipe cost is an estimate from latest unit costs; labor, tax, packaging and overhead are excluded. Menu items without recipes do not deduct stock.

### Files and migration

- Created: `server/src/migrations/20261202100000-create-inventory-foundation.js`; `server/src/models/InventoryItem.js`, `InventoryMovement.js`, `InventorySupplier.js`, `InventoryPurchaseOrder.js`, `InventoryPurchaseOrderItem.js`, `InventoryRecipe.js`, `InventoryRecipeIngredient.js`; `server/src/modules/restaurants/inventory.controller.js`, `inventory.routes.js`; `server/src/services/inventory-stock.js`; `server/test/inventory-stock.test.js`; `client/src/portals/restaurant/pages/RestaurantInventory.jsx`.
- Modified: `server/src/models/index.js`, `server/src/app.js`, `server/src/modules/orders/order.controller.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `client/src/routes/AppRoutes.jsx`, `client/src/portals/restaurant/layouts/RestaurantLayout.jsx`, `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`.
- Migration applied: `20261202100000-create-inventory-foundation.js`.
- Razorpay refund implementation and its migration were not changed.

## POS and billing workflow — partial (2026-11-22)

- Added cashier-specific POS API and responsive React workspace for takeaway and dine-in service. API routes derive restaurant identity from the authenticated membership, enforce `pos.access` / `pos.manage`, validate branch assignment, and reuse customer checkout's menu option and pricing validator.
- Walk-in order customer snapshots are stored without a fake user account (`customer_id` is nullable). Migration `20261203100000-create-pos-workflows.js` adds uniquely keyed POS order requests and tender ledger records. Order and cash tender retries are idempotent, partial payments remain pending, and overpayment is rejected.
- UI supports branch/menu/table selection, variants/add-ons, customer name/phone, quantity changes, split cash/online tenders, recent POS orders, receipt details, and browser print. Cashier login redirects to `/restaurant/pos` when the account has `pos.access`.
- Razorpay POS uses provider order creation, signature validation, provider status fetch/capture, and dismissal reconciliation. Provider-reported uncertainty keeps the tender pending; only no-capture/failed states allow a retry. A full single-Razorpay tender stores the existing refund identifiers; mixed tenders are not eligible for tender-level refunds.

### POS verification

- Migration `20261203100000-create-pos-workflows.js` applied successfully. Initial MySQL attempt failed due incompatible `SET NULL` FK action; corrected migration preserves the previous FK and changes only nullability. No reset/destructive sync.
- Opt-in real HTTP acceptance passed: cashier menu access; tenant/branch and customer denial; variant/add-on total validation; dine-in table occupancy; order idempotency/replay mismatch; partial cash, duplicate tender idempotency, overpayment denial, final exact settlement and receipt lookup. Temporary records were cleaned and cleanup verified.
- Confirmed configured Razorpay key is test-mode without displaying credentials. Test-mode order creation returned 201. Provider reconciliation found no captured payment, marked the tender retryable, then cash settlement passed. No capture or charge was made. Captured-payment verification and refund are not tested; no captured test payment was available.
- Server tests: 61 passed, 0 failed, 0 skipped. Client build and quiet lint passed; Vite reported existing >500 kB bundle advisory. No browser viewport or physical printer test.

### Remaining POS work

Captured online payment verification, mixed-tender refunds, void/comp approval, receipt reprint audit, physical printer integration, POS sales/shift reports, offline POS, responsive browser checks, and broader role acceptance remain incomplete. POS orders deduct configured recipe stock when they enter preparation.

### POS files and migration

- Created: `server/src/migrations/20261203100000-create-pos-workflows.js`, `server/src/models/PosOrderRequest.js`, `server/src/models/PosTender.js`, `server/src/modules/restaurants/pos.controller.js`, `server/src/modules/restaurants/pos.routes.js`, `client/src/portals/restaurant/pages/RestaurantPOS.jsx`, and guarded `server/scripts/cleanup-pos-acceptance-fixture.js` for one explicitly supplied failed-run suffix.
- Modified: `server/src/models/Order.js`, `server/src/models/index.js`, `server/src/modules/customer/checkout.controller.js`, `server/src/app.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `client/src/routes/AppRoutes.jsx`, `client/src/context/AuthContext.jsx`, `client/src/portals/restaurant/layouts/RestaurantLayout.jsx`, `AUDIT_REPORT.md`, and `IMPLEMENTATION_STATUS.md`.
- Existing Razorpay refund implementation remains preserved. The full prompt and Phase 1 remain incomplete; production readiness is not claimed.

## Reservation concurrency verification — partial (2026-11-22)

- Extended the opt-in live HTTP runner to create two customer sessions and submit overlapping requests concurrently. Both returned 201 as pending unassigned requests, which do not reserve a table or change its occupancy.
- Raced two staff confirmation calls for the same table/time. Exactly one succeeded (200) and one was rejected (409). The reservation assigned to the table marks it reserved.
- The winning customer's cancellation returned the table to available; the competing pending request could then be confirmed. A different customer attempting cancellation received 404, and a customer pairing an approved restaurant with another restaurant's branch received 404.
- Full acceptance runner passed and cleaned up fixtures. This verifies confirmation concurrency and availability restoration in the configured development DB. It does not test every party size/date/timezone, reservation waitlist, or browser interaction. No source defect or migration change was needed for this verification increment.
- Modified: `server/scripts/phase1-auth-onboarding-smoke.js`, `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`.

### Overall master-prompt status at this checkpoint (updated by the consolidated acceptance section below)

This work continues the full master objective; it does **not** complete it. POS and inventory remain partial, many business modules and broad role/API acceptance remain open, and browser/viewport acceptance is outstanding. Reservation confirmation contention and QR API ordering passed on disposable data, but optical QR scan and occupied-table ordering policy remain untested. Razorpay captured payment/refund verification is blocked by the lack of a captured test payment and intermittent provider connectivity. Phase 1 stays incomplete. This continuation did not claim POS or overall production readiness.
- Updated restaurant order list responses with status counts and order line notes. No database migration was needed.
- Verification: client production build succeeded; Oxlint completed with warnings; changed backend controllers, routes and model associations passed `node --check`. Chromium renders were reviewed at desktop, tablet and narrow viewport sizes. The protected order APIs returned unauthenticated errors during visual review, so populated order cards, staff membership flows and status updates could not be exercised without a signed-in owner/staff session.

## QR table management foundation

- Added branch-scoped restaurant table records and owner APIs for list/search/filter/pagination, create, detail, edit, and active status. Server derives the restaurant from the owner session, checks branch ownership, enforces unique table names per branch, and clears any QR token on deactivation.
- Added `/restaurant/tables` with real branch filters, table CRUD, status control, details, loading/error/empty states, secure QR generation and confirmed regeneration, preview, and PNG download. No sample tables are created.
- Added public token resolution at `/api/v1/public/qr/:token` and a responsive customer menu at `/qr/:token`. It shows public restaurant/branch/table context and available menu items, and uses the existing item dialog and customer cart for ordering. Tokens are random 256-bit base64url values and are omitted from owner list/detail API responses.
- QR menu data includes configured variant/add-on labels and prices; QR customers can customize items through the existing item dialog and customer cart. The scanned table token supplies dine-in context for server validation. Normal restaurant detail browsing does not require QR scanning; View menu and Order online links remain available for standard online ordering.
- Added separate customer-facing branch menu QR access on the restaurant detail page. `GET /api/v1/public/restaurants/:slug/branches/:branchId/qr` dynamically creates a QR to the current public restaurant page with its selected branch. It reuses marketplace eligibility filters and shared secure public-origin validation, stores no token, and does not alter table QR behavior. The customer can preview, download, share, or open the menu from a QR modal.
- Added a single restaurant-level menu QR at `GET /api/v1/public/restaurants/:slug/qr`; it opens the public restaurant page without a branch or table assignment. The owner Tables page separates this restaurant QR from per-table QRs and supports download, copy, print, and opening the menu. Individual table QR actions include copy, print, download, and isolated regeneration; a print sheet covers active tables and generates missing table tokens only when the owner requests the sheet.
- QR issuance checks the restaurant is approved, published, and marketplace-enabled, and the table and dine-in branch are active. Set `PUBLIC_APP_URL` to the public frontend origin; HTTPS is required in production. QR dine-in cart/order wiring resolves table context from the scanned token and links orders to tables in owner/kitchen/waiter/customer views. The configured development DB reports `20261116220000-add-qr-dine-in-ordering.js` applied; direct read-only inspection confirmed `orders.order_type`, `orders.table_id`, cart QR columns, and the table/status index. Since the reported API error still says `Order.table_id` is missing, verify that the API process targets the same database. The new manual table-selection UI validates branch ownership server-side; occupancy remains untracked.
- Migration `20261116210000-create-restaurant-tables.js` was applied successfully. A rolled-back database check passed table creation, branch association, duplicate rejection, and active status update. Client production build/lint and changed backend syntax checks passed. Read-only API checks verified branch QR URL/data for one eligible branch, branch resolution on its public restaurant page, unpublished restaurant rejection, and continued resolution of an existing table QR token. Customer modal download/share and multi-branch behavior were not manually tested in a browser; no physical scan was performed.
- Remaining QR ecosystem work and verification gaps, including authenticated UI checks and future ordering work, are tracked in `docs/QR_IMPLEMENTATION_STATUS.md`.
- Customer cart, checkout, COD/Razorpay, and order history/tracking foundations are documented in `docs/CUSTOMER_ORDERING_IMPLEMENTATION_STATUS.md`, including the unresolved API database-target discrepancy and unverified QR end-to-end ordering, delivery coverage, pickup scheduling, reservations, and live updates.

## Customer support ticket workflow — partial (2026-11-22)

- Replaced the customer Help & Support placeholder with a responsive ticket workspace to create requests, list customer-owned tickets, read conversations, and reply. It has loading, validation, success and error feedback.
- Reused the existing `SupportTicket`, `SupportMessage`, and `SupportAttachment` records and the Super Admin support inbox. Customer tickets use `restaurant_id = NULL`; every customer list/detail/reply/download query scopes by authenticated customer ID and null restaurant ownership. Optional related orders must belong to that customer. Priorities are assigned server-side; customer input cannot mark a ticket urgent.
- Admin responses and status changes appear on the customer thread. Customer replies to a resolved ticket reopen it as `in_progress`; closed tickets reject replies. Admin inbox labels customer requesters and displays customer replies.
- Added `GET /api/v1/customer/support/options`, `GET/POST /api/v1/customer/support/tickets`, `GET /api/v1/customer/support/tickets/:ticketId`, `POST /api/v1/customer/support/tickets/:ticketId/replies`, and customer-scoped attachment download. Existing Admin reply/status APIs now notify customer ticket rooms when the ticket has no restaurant owner.
- Applied `20261204100000-enable-customer-support-tickets.js` and `20261204110000-correct-customer-support-ticket-schema.js`. The initial MySQL `changeColumn` left `restaurant_id` non-null and added an extra FK; the corrective migration uses an explicit nullable column change and removes only duplicate restaurant FK constraints. Schema inspection verified `allowNull=true`, one restaurant FK, and both migrations up. Existing ticket data was preserved.
- The live disposable API runner passed ticket creation, authenticated ticket list/detail, other-customer read/reply denial (404), order ownership validation (400), attachment download for owner and denial for another customer (200/404), Admin inbox visibility, Admin reply, customer thread read, resolution, reopen on customer reply, and customer denial from the Admin API (403). Temporary users/tickets/audit rows were cleaned and verified.
- Regression checks: server tests 61 passed / 0 failed; client production build and quiet lint passed; new controller/routes/migrations and acceptance runner passed `node --check`. Vite still reports a >500 kB chunk warning. No manual browser or responsive viewport run was performed.
- Created: `server/src/migrations/20261204100000-enable-customer-support-tickets.js`, `server/src/migrations/20261204110000-correct-customer-support-ticket-schema.js`, `server/src/modules/support/customer.controller.js`, and `client/src/portals/customer/pages/CustomerSupport.jsx`.
- Modified: `server/src/models/SupportTicket.js`, `server/src/models/SupportMessage.js`, `server/src/modules/support/support.shared.js`, `server/src/modules/customer/customer.routes.js`, `server/src/modules/admin/support.controller.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `client/src/routes/AppRoutes.jsx`, `client/src/portals/admin/pages/AdminSupport.jsx`, `AUDIT_REPORT.md`, and `IMPLEMENTATION_STATUS.md`.
- Remaining at this support checkpoint: no customer support reply attachments in the customer UI, no order selector (API verifies supplied order ownership), and no browser accessibility/viewport acceptance. Durable customer notification center/preferences are implemented in the following section. The full master objective remains active and incomplete.

## Customer notification center and preferences â€” partial (2026-11-22)

- Implemented durable customer notifications and six preference switches (orders, payments, reservations, delivery, support and marketing). Operational updates default on; marketing defaults off. Customers can list notifications with unread totals, mark individual/all read, and update only valid boolean preference fields.
- Added event hooks for customer checkout, payment verification/failure, processed refunds, order status changes, reservation decisions, delivery assignment/status, and Super Admin support replies/status changes. Unique customer+dedupe keys prevent duplicate event records; transaction-backed events publish through Socket.IO after commit. Customer notifications page, account settings, unread sidebar badge, live event listener, and route protection are wired.
- Migration `20261205100000-create-customer-notifications.js` is applied. It adds `customer_notification_preferences` and `customer_notifications`, FK/index constraints, and no changes to existing data. The initial MySQL attempt failed due FK type/collation mismatch; using `DataTypes.UUID` resolved it and the successful retry is recorded in the audit report.
- Verification: disposable API runner passed notification persistence/access checks, including a real QR checkout order-created event and support reply notification, duplicate-event suppression, disabled-category suppression, and fixture cleanup. Server tests 61/61 passed. Client build passed with the existing >500 kB advisory; lint exited 0 with existing warnings. Syntax checks passed. No live browser/socket client, viewport, physical QR scanner, external channel, or captured-payment test was performed.
- Created: `server/src/models/CustomerNotification.js`, `server/src/models/CustomerNotificationPreference.js`, `server/src/migrations/20261205100000-create-customer-notifications.js`, `server/src/services/customer-notifications.js`, `server/src/modules/customer/notification.controller.js`, `client/src/portals/customer/pages/CustomerNotifications.jsx`, and `client/src/portals/customer/pages/CustomerSettings.jsx`.
- Modified: `server/src/models/index.js`, `server/src/modules/customer/customer.routes.js`, `server/src/modules/customer/checkout.controller.js`, `server/src/modules/orders/order.controller.js`, `server/src/modules/orders/refund.controller.js`, `server/src/modules/restaurants/floor.controller.js`, `server/src/modules/restaurants/delivery-orders.controller.js`, `server/src/modules/admin/support.controller.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `client/src/routes/AppRoutes.jsx`, `client/src/services/socket.js`, `client/src/portals/customer/layouts/CustomerLayout.jsx`, and both status documents.
- Remaining: email/SMS/WhatsApp channels and controls for those unavailable external channels, browser viewport/accessibility review, and the larger master-prompt requirements remain open. Phase 1 and overall project completion are not claimed; continue with outstanding requirements.

## Latest consolidated acceptance update â€” partial (2026-11-22)

- Re-ran `PHASE1_ALLOW_DB_FIXTURES=yes node scripts/phase1-auth-onboarding-smoke.js`; result `PASS`, exit 0, with fixture cleanup verified. Expected negative cases generated 400/403/404/409 responses which matched the runner assertions; these are not unexpected failures.
- This run passed selected authenticated API workflows for Super Admin, Restaurant Owner, Manager, Waiter, Kitchen Staff, Cashier and restaurant Delivery Associate. Customer/admin/restaurant denials, custom inventory permission boundaries, tested branch/tenant isolation, and waiter refund denial passed. Browser/client route/backend permission parity and exhaustive endpoint checks remain **not tested**.
- Customer registration, restaurant registration, pending owner login, Super Admin approval/rejection and post-approval restaurant API access passed. Document submission remains **unsupported**; no upload contract/model field or endpoint exists in this registration flow.
- Reservation overlap test and staff confirmation race passed (one confirmation 200, competing confirmation 409); customer cancellation restored table availability; customer ownership and restaurant/branch isolation passed.
- Restaurant, branch, and individual table QR generation and token resolution passed. Authenticated cart and idempotent dine-in checkout used the QR table context; scanning/resolution alone did not occupy the table; successful order placement did. Invalid, inactive and revoked token checks passed. Optical decoding/phone scan and the existing-occupied-table repeat-order policy are **not tested**.
- Customer QR/COD order creation and idempotent replay passed with payment/order states separate. Captured Razorpay payment verification, customer cancellation/refund eligibility and live refund reconciliation are **blocked/not tested**: no captured Razorpay test payment was available and provider connectivity has been intermittent. No real payment was made.
- Durable notification APIs and event hooks passed in this same run, including owner-scoped records, preferences, duplicate/category suppression, checkout order notification, support reply notification, and read/unread. Fixtures were removed.
- Regression results: server tests 61 passed / 0 failed / 0 skipped; client production build passed with existing 510.63 kB main chunk warning; lint exited 0 with existing warnings; changed JS syntax checks passed.
- **Phase 1 remains incomplete.** Items left open or blocked: browser route parity and responsive/accessibility review; unsupported restaurant document submission; optical QR decoding; occupied-table QR policy; captured Razorpay payment/refund verification and full live payment/cancellation reconciliation; exhaustive route authorization. The wider master prompt still has partially implemented modules and enhancements; continue without advancing the stale earlier “not tested” claims as if they were current.

## Customer order cancellation and payment-state safety — partial (2026-11-22)

- Implemented `PATCH /api/v1/customer/orders/:orderId/cancel`, scoped to the authenticated customer and serialized on a locked order row. Only pending orders may be customer-cancelled; repeat cancellation is idempotent. Live checks: owner 200, another customer 404, accepted order 409.
- Cancellation releases coupons, restores table availability, cancels active delivery records/locations, writes an audit event, and creates a durable notification. Payment state remains independent and unchanged by cancellation. Customer order details now exposes cancellation and clarifies that cancelled/paid does not mean refunded.
- Payment verification handles the callback race where Razorpay captures after cancellation: persist paid status, preserve cancelled/rejected order state, skip table occupancy/coupon redemption, and flag refund review. The disposable HTTP runner used a valid signed fixture payload plus a stubbed Razorpay SDK response; the callback and duplicate callback passed with zero provider network calls. A real captured Razorpay payment remains untested.
- The disposable API runner passed cancellation, order/payment separation, availability restoration, idempotent replay, cross-customer isolation, denial after acceptance, and the signed capture-after-cancellation callback. A synthetic DB fixture confirmed cancellation preserves an already-paid payment status; no real payment was used. Fixture cleanup passed. Regression: server 61/61; client build/lint exited 0 with existing warnings; syntax checks passed. No migration required.
- The first SDK-stub test attempt hit a duplicate synthetic payment ID and returned 500; the test fixture ID was corrected and the complete runner passed. Cleanup verified after both failed and successful runs.
- Modified: `server/src/modules/customer/checkout.controller.js`, `server/src/modules/customer/customer.routes.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `client/src/portals/customer/pages/CustomerOrderDetails.jsx`, and both status documents.
- Remaining Phase 1 risks: real captured online payment/refund reconciliation; browser route parity and responsive review; optical QR decoding and occupied-table policy; unsupported restaurant document submission; exhaustive authorization coverage. The overall master objective remains active and incomplete.

## Occupied-table QR order policy — verified and enforced (2026-11-22)

- Public table QR resolution and new customer QR cart items now require occupancyStatus=available. Cart validation can still load an existing cart for an occupied table, but transactional checkout only claims an available table, so independently created carts cannot produce concurrent customer dine-in orders against that table.
- POS retains occupied-table ticket creation for authorized staff. Payment verification for an existing Razorpay order can retain its own already-claimed occupied state.
- Live disposable API runner passed the contested checkout sequence: second customer prepared a cart while available; first customer order made the table occupied; resolver and fresh QR-cart add returned 404; second checkout returned 409; first cancellation restored availability; second checkout then returned 201 and its cancellation restored availability. Cleanup passed.
- Server tests: 61 passed, 0 failed. Backend syntax checks passed. Client code did not change, so no build/lint rerun was needed. No schema migration.
- Modified: server/src/services/table-operations.js, server/src/modules/customer/checkout.controller.js, server/src/modules/public/public.controller.js, server/src/modules/restaurants/pos.controller.js, server/scripts/phase1-auth-onboarding-smoke.js, and both status documents.
- Optical QR decoding, captured Razorpay payment/refund, browser route parity, restaurant documents, and the rest of the master specification remain incomplete.

## Customer one-tap reorder � implemented and verified (2026-11-22)

- Added customer-scoped reorder API. It takes menu selections from an order owned by the signed-in customer, checks current item/variant/add-on availability, and applies the full cart update atomically. A dine-in order is converted into an ordinary cart without reserving the old table.
- Added durable per-customer idempotency using `20261206100000-create-customer-reorder-requests.js`; migration applied. Replaying the same key leaves quantities unchanged and cannot transfer the key to another source order.
- Added �Order again� to customer order details with loading/error states and cart navigation.
- Tests: disposable HTTP runner passed own order, expected cart contents, deduplicated retry, cross-customer 404, and cleanup. Server suite: 61 passed / 0 failed / 0 skipped. Client production build passed (existing 510.63 kB chunk advisory); lint exited 0 with existing warnings. No actual external payment or browser automation was involved.
- Created: `server/src/models/CustomerReorderRequest.js`, `server/src/migrations/20261206100000-create-customer-reorder-requests.js`.
- Modified: `server/src/models/index.js`, `server/src/modules/customer/checkout.controller.js`, `server/src/modules/customer/customer.routes.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `client/src/portals/customer/pages/CustomerOrderDetails.jsx`, `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`.
- Overall implementation remains active and incomplete. Phase 1 verification gaps and many master-prompt requirements across later phases/enhancements remain outstanding.

## Dietary and allergen menu labels and filters � implemented (2026-11-22)

- Applied migration `20261207100000-add-menu-dietary-allergen-tags.js`, adding nullable JSON tags without rewriting existing menu records. New/edit menu APIs validate controlled dietary and allergen vocabularies.
- Restaurant menu editor supports the tags. Public restaurant and table QR menu APIs return them, and both customer menu experiences filter by dietary label and hide items tagged with selected allergens. Cards surface available labels and caution that restaurant-entered tags do not cover missing data or cross-contact.
- Verification: live disposable API checks rejected unsupported labels, persisted valid labels, and read them through the public menu. Full fixture workflow completed with cleanup verified. Server suite 61/61; frontend production build and lint exited 0, with existing chunk-size and lint warnings. No browser or device accessibility check was run.
- Created: `server/src/migrations/20261207100000-add-menu-dietary-allergen-tags.js`.
- Modified: `server/src/models/MenuItem.js`, `server/src/modules/restaurants/menu.controller.js`, `server/src/modules/public/public.controller.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `client/src/portals/restaurant/pages/RestaurantMenu.jsx`, `client/src/portals/customer/pages/RestaurantDetails.jsx`, `client/src/portals/customer/pages/QrMenu.jsx`, `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`.
- Risk/status: legacy items have no tags until staff maintain them; these self-entered labels cannot certify allergy safety. Phase 1 and the overall master prompt are still incomplete.

## Inventory workflow completion increment � verified (2026-11-23)

- Completed missing inventory operations in the existing portal: edit ingredient metadata, show/reactivate inactive ingredients, edit/reactivate/deactivate suppliers, create multi-line purchase orders, inspect purchase line details, cancel drafts, and load/edit/deactivate/restore recipes.
- Backend preserves branch/restaurant ownership checks, adds restaurant-scoped supplier updates and safe recipe deactivation, uses transactions for stock master updates and purchase receiving, and prevents unit changes after historical movement/recipe/purchase data would become ambiguous. Deactivation is blocked for ingredients used by active recipes or open POs. No existing ledger/history rows are rewritten.
- Live disposable API workflow passed metadata editing and unit guard, supplier lifecycle, multi-line PO receive with correct per-item stock, duplicate receipt rejection, inactive item history/reactivation, recipe deactivate/restore and dependency guard, inventory movements/wastage/low-stock, food-cost estimate, recipe deduction, insufficient-stock rollback, tenant/branch checks and role permission denial. Fixture cleanup verified.
- Regression checks: server suite 61 passed / 0 failed / 0 skipped; frontend build and lint exited 0. Existing chunk size warning and lint warnings remain. No migration was needed for these inventory API/UI changes.
- Modified: `server/src/modules/restaurants/inventory.controller.js`, `server/src/modules/restaurants/inventory.routes.js`, `server/src/models/index.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `client/src/portals/restaurant/pages/RestaurantInventory.jsx`, `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`.
- Remaining limitations: unit conversion and batch/expiry tracking are not implemented; purchase receiving is all-at-once (partial receipts are not supported); recipe-based stock deduction occurs at the preparing transition; visual/browser workflow testing remains open. Broader master and uploaded delivery-workflow requirements remain active and incomplete.

## Delivery management acceptance increment � API verified (2026-11-23)

- Fixed `eligibleStaff` to select order status before applying its READY gate; without it, ready orders could not pass eligibility validation.
- Assignment creation is restricted to READY orders. Pending-assignment listing and the automatic assignment worker now select READY delivery orders only. Associate actions lock the order before locking its assignment, matching cancellation lock order and preventing the completion/cancellation race.
- Disposable authenticated HTTP workflow passed: pre-ready assignment returned 409; pending order was excluded from the assignment queue; restaurant transitions pending -> accepted -> preparing -> ready succeeded; eligible branch employee was returned; manual assignment returned 201; accept -> arriving -> picked up -> on the way -> delivered succeeded; customer tracking showed delivered; another customer received 404. The order became completed while COD payment stayed pending. Fixture cleanup passed.
- The opt-in API acceptance runner completed with `result: PASS`; expected negative API cases are logged by Express but match assertions. Server tests: 61 passed, 0 failed, 0 skipped. JavaScript syntax checks passed. No migration was created or applied. Frontend build/lint were not rerun for this server-only increment.
- Modified: `server/src/modules/restaurants/delivery-orders.controller.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`.
- Still untested: automatic assignment selection/timeout, live location sharing and expiry, delivery settings/reports browser flow, assignment contention/reassignment, cross-restaurant and unassigned-branch delivery attempts in this full HTTP workflow, responsive/browser layout, configured ETA routing, and external notification delivery. The complete delivery prompt, Phase 1 and the master specification remain incomplete.
## Existing branch integration fix for Inventory & Purchasing � verified (2026-11-23)

- Root cause: Branch Management returns `{ data: { branches, pagination } }`; Inventory expected `data` to be an array. The request succeeded, but the shape mismatch converted valid branch results to an empty list and incorrectly displayed the no-branch message.
- Inventory now reads the existing paginated branch response and fetches every page (100 branches per request), including inactive branches for access to their retained stock records. It selects an existing authorized branch and loads the existing branch-scoped summary, ingredients, movements, purchase orders and recipes. Suppliers remain restaurant-scoped in the existing schema and are shown as shared supplier records.
- Branch switching clears stale values and ignores late responses from previous branch requests. The true empty state links to the existing `/restaurant/branches` management page; API errors no longer look like an empty branch list.
- Verified against the existing database without creating or changing any branch: it contains a restaurant with 4 branches (and another with 3). A disposable authenticated API run used two of the existing branches, returned all 4 authorized branches, created distinct temporary stock rows (quantity 1 vs 10), and confirmed independent item, summary, movement, low-stock and purchase-order queries while the restaurant supplier list remained accessible. A write targeting a different restaurant's branch returned 404. Temporary user, membership, items, opening movements, supplier and draft purchases were removed; follow-up counts for all temporary record categories were zero. Existing inventory baseline was zero items; no existing inventory record was changed.
- Verification: server suite 61 passed / 0 failed / 0 skipped; client production build passed (existing >500 kB bundle warning); lint exited 0 with repository warnings. No migration or API/model/association change was needed.
- Modified: `client/src/portals/restaurant/pages/RestaurantInventory.jsx`, `server/scripts/inventory-existing-branches-smoke.js`, `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`.
- Browser-based visual branch-switch testing was not available. The actual authenticated API reads were tested against the existing multi-branch restaurant; Phase 1 and the complete master prompt remain incomplete.
## Delivery assignment integration from Orders � verified (2026-11-23)

- Root cause: the Orders API/card had no delivery assignment field or controls, so normal order processing never created `DeliveryAssignment` rows. Delivery Management queried its existing assignment table correctly and displayed zero because no Orders-page integration created records. Its frontend route also required owner status only, preventing an authorized branch manager from opening the page.
- Reused the existing `DeliveryAssignment`, `DeliveryStatusHistory`, assignment/eligible-staff APIs and employee roles. The restaurant Orders endpoint now includes the latest relevant assignment (preferring an active assignment during history ties) for users with delivery viewing or assignment permissions. The Orders cards show employee/status/contact and delivery details; eligible READY delivery orders expose Assign/Reassign. The modal obtains associates from the existing order-derived, branch-filtered API. Inactive and other-branch employees remain rejected by server validation; existing workload limits remain enforced by the assignment API. Takeaway/dine-in/terminal orders do not expose the action; pending COD payment does not block assignment.
- Restaurant Delivery Assignments now supports authorized memberships, branch/status filters, order or employee search, pagination and refresh. The API returns pickup/delivery times from immutable status-history events, preserving timestamps without duplicating assignment columns. Super Admins have a platform-wide authenticated API and a page in the existing Admin portal. Delivery associate rejection now requires a reason and confirmation; rejected records can be assigned again while history remains intact.
- Corrected current assignment selection in restaurant order data and customer tracking to prefer the active assignment (or delivered assignment for completed orders), avoiding stale assignment selection when several records share a timestamp.
- Authenticated disposable HTTP acceptance passed: order assignment visibility in Orders and Delivery Management; branch/status/order search; Super Admin platform-wide listing; other-branch and inactive employee exclusion and backend 400 rejection; reassign preserving history; rejection reason and re-assignment after rejection; other associate action denied (403); accept, arriving, pickup, on-the-way and delivered transitions; customer tracking delivered state and cross-customer denial (404); COD order completion left payment pending. Fixture cleanup passed.
- Verification: server suite 61 passed / 0 failed / 0 skipped; full opt-in authenticated workflow runner returned PASS; frontend build passed with existing >500 kB bundle warning; lint exited 0 with repository warnings. No migration was needed; pickup and delivered times are read from existing delivery status history. No browser/device visual run was performed.
- Created: `server/src/modules/admin/delivery.controller.js`.
- Modified: `server/src/modules/admin/admin.routes.js`, `server/src/modules/orders/order.controller.js`, `server/src/modules/restaurants/delivery-orders.controller.js`, `server/src/modules/restaurants/delivery-orders.routes.js`, `server/src/modules/customer/checkout.controller.js`, `server/scripts/phase1-auth-onboarding-smoke.js`, `client/src/portals/restaurant/pages/RestaurantOrders.jsx`, `client/src/portals/restaurant/pages/RestaurantDeliveryAssignments.jsx`, `client/src/portals/restaurant/pages/RestaurantDeliveryDashboard.jsx`, `client/src/routes/AppRoutes.jsx`, `client/src/portals/admin/layouts/AdminLayout.jsx`, and both status documents.
- Data-model limitation: the user model has no profile-image field, so the assignment modal displays an initials/avatar fallback; it will render a photo URL if one becomes available. Overall Phase 1 and master-prompt acceptance remain incomplete.
## Restaurant owner branch availability correction (2026-11-23)

- Root cause: the Restaurant Owner Dashboard did not call a branch status API. It displayed restaurant approval and listing status from the authenticated user membership, which is not a branch's live operational availability. The existing branch API is `GET /api/v1/restaurant/branches`; it computes `availabilityStatus` at request time using the shared `branchIsOpen` helper and branch timezone. The customer marketplace also uses that helper for `isOpen` and `openNow` filters.
- The dashboard now fetches existing authorized branches through that API on load and refresh, showing Open/Closed separately from Active/Inactive, local hours, and timezone, with a link to Branch Management. Branch edits already refetch the same endpoint after save, so the status recalculates immediately there; reopening the Dashboard also fetches fresh status.
- Shared availability logic honors branch-local IANA timezone, working and closed days, normal and overnight periods, approval/active status, and temporary closure overrides. An expired temporary closure now falls back to the schedule even if the scheduled reopening worker has not yet persisted its cleanup; an unbounded or future temporary closure remains closed. The legacy `operationalStatus: closed` value means "use schedule" in the existing admin UI; manual temporary closure uses `temporarily_closed`.
- Tests added for Asia/Kolkata open/close boundaries, a different IANA timezone, overnight midnight and exact close, closed weekdays, inactive status, and active/expired/unbounded temporary closures.
- Verification: targeted branch availability tests passed (12/12); server test suite passed (64/64); client production build passed; lint exited 0 with existing warnings. No migration was required. Browser visual testing against the named `testinventory` account was unavailable in this run.
- Modified: `client/src/portals/restaurant/pages/RestaurantDashboard.jsx`, `server/src/services/branch-availability.js`, `server/test/branch-availability.test.js`, `AUDIT_REPORT.md`, `IMPLEMENTATION_STATUS.md`.