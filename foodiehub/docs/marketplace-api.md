# Customer marketplace API

All routes use `/api/v1/public`; no customer session is required. The server only lists restaurants with `approval_status = approved`, `listing_status = published`, and `marketplace_enabled = true`, and with at least one active branch not rejected or suspended. The current Restaurant model has no separate account `status`; marketplace enabled is the existing platform listing switch. Pending/rejected/suspended restaurants and draft/unlisted listings are never returned.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/restaurants` | Paginated restaurant discovery |
| GET | `/restaurants/:slug` | Public restaurant profile |
| GET | `/restaurants/:slug/branches` | Eligible public branches |
| GET | `/restaurants/:slug/menu` | Active categories and available menu items; optional `branchId` |
| GET | `/menu-items/:id` | Public available item details and options; optional `branchId` |
| PATCH | `/api/v1/admin/restaurants/:id/listing` | Super Admin only; explicitly publish (`{"listingStatus":"published"}`) or unpublish (`{"listingStatus":"unlisted"}`) an approved restaurant |

Publishing also sets `marketplace_enabled` to true and requires an active branch that is not inactive, temporarily closed, rejected, or suspended. Unpublishing sets `listing_status=unlisted` and disables the marketplace flag. Approval remains a separate action; publishing never approves a restaurant or creates/changes branches. A draft restaurant remains hidden until an authorized Super Admin publishes it.

`GET /restaurants` supports `search` (restaurant, branch city, menu item or active menu category), `city`, `category` (category ID or name), `foodType=veg|non_veg|egg`, `delivery`, `takeaway`, `dineIn`, `openNow`, `sort=relevance|preparationTime`, `page`, and `limit` (maximum 48). Unsupported sort values such as `rating` return 400 because no rating data exists.

Restaurant and branch responses include only public business details, branch addresses/contact/hours/services, real average item preparation time where available, and current open state. Owner emails, accounts, membership data, approval internals, and employee information are omitted. Restaurant menus are currently restaurant-level, so selecting a branch validates the selection and displays the shared restaurant menu. Branch-specific item availability is not modeled yet.

Cuisine, ratings, minimum order amount, and a cover image are not present in the current schema. The API returns empty/null values where applicable, and the UI displays a fallback instead of fabricating data. City search is supported through actual branch cities; there is no customer delivery address or distance eligibility yet.
