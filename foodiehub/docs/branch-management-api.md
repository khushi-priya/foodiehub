# Restaurant branch management API

Owner routes use the existing session cookie and `/api/v1/restaurant/branches` prefix. Every owner operation derives restaurant scope from the active session membership. The create/update body does not select a restaurant ID. Super Admin routes use the existing `/api/v1/admin` authorization middleware and return only branch location and status fields.

## Restaurant Owner

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/summary` | Counts and primary branch |
| GET | `/` | Search and paginated branch list; supports `search`, `status=all\|active\|inactive`, `page`, and `limit` |
| POST | `/` | Create branch; first active branch is primary unless otherwise designated |
| GET | `/:branchId` | Branch details, scoped to the owner’s restaurant |
| PUT | `/:branchId` | Update the branch’s complete form data |
| PATCH | `/:branchId/status` | Set `{ isActive }` |
| PATCH | `/:branchId/primary` | Set an active branch as primary |

Create/update accepts `name`, `branchCode`, `phone`, optional `email`, `addressLine`, optional `addressLine2` and `landmark`, `city`, `state`, `postalCode`, `country`, optional `latitude` and `longitude`, `openingTime` and `closingTime` in `HH:MM`, `timeZone` (IANA; defaults to `Asia/Kolkata`), `workingDays` and matching `closedDays`, `overnight`, `dineInEnabled`, `takeawayEnabled`, `deliveryEnabled`, `cashOnDeliveryEnabled`, `razorpayEnabled`, `isPrimary`, and `isActive`. Razorpay availability also requires the backend credentials; the branch opt-in defaults to disabled.

Branch codes are unique within a restaurant (existing database index). A transaction locks the restaurant row while changing primary designation, so only one primary is designated through these APIs. Only active branches can be primary. Deactivating a primary branch while other active branches exist returns `409`; set another active branch as primary first. Deactivation retains all branch and employee assignment records.

## Super Admin

`GET /api/v1/admin/restaurants/:id/branches` returns the restaurant’s branch location, contact, primary, approval, operational, and active status fields. It uses the existing Super Admin router guard and does not return employees, orders, or other operational records.

## Migration

`20261116120000-extend-branches.js` adds the branch fields and indexes to the existing `branches` table, preserves current rows, and selects the oldest active legacy branch as primary for each restaurant that has one. `20261116200000-add-razorpay-checkout.js` adds the Razorpay branch opt-in with a default of disabled.
