# FoodieHub

FoodieHub is a full-stack restaurant marketplace and restaurant operations platform. It combines a customer-facing food discovery and ordering experience with separate workspaces for restaurant teams and platform administrators.

> **Project status:** This README describes the code found in this repository. Some workflows are implemented but still require complete end-to-end or production acceptance testing. See [`AUDIT_REPORT.md`](AUDIT_REPORT.md) and [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) for the current verification boundary and known gaps.

## Contents

- [Product overview](#product-overview)
- [Applications and roles](#applications-and-roles)
- [Feature overview](#feature-overview)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Environment configuration](#environment-configuration)
- [Database and migrations](#database-and-migrations)
- [Running the application](#running-the-application)
- [Tests and quality checks](#tests-and-quality-checks)
- [Important implementation notes](#important-implementation-notes)
- [Security notes](#security-notes)
- [Project documentation](#project-documentation)

## Product overview

FoodieHub supports a multi-restaurant marketplace and restaurant operations workflow. Customers can discover published restaurants, browse menus, maintain a cart for a single restaurant branch, place orders, and view their own order information. Restaurant users manage their restaurant, branches, menus, orders, tables, team and operational workflows. Super Admin users manage and monitor the wider platform.

The application is organized as two main projects:

- `client/` — React single-page application built with Vite.
- `server/` — Express API, Sequelize data layer, MySQL integration and real-time services.

## Applications and roles

### Customer portal

Customer-facing pages and workflows include:

- Marketplace home page and restaurant discovery.
- Restaurant search, category and food-type filters, branch/service information and pagination.
- Restaurant details and menu browsing.
- Food item options, including variants and add-ons.
- Customer registration, login and account dashboard.
- Persistent cart scoped to one restaurant and branch.
- Checkout with supported service type and configured payment methods.
- Customer order history, order details and confirmation.
- Table reservations and QR menu/order entry points.
- Customer notifications, settings and support.

### Restaurant portal

Restaurant workspace pages cover:

- Restaurant dashboard and business profile.
- Branch creation, editing, activation and primary-branch selection.
- Menu categories, food items, availability, variants and add-ons.
- Order management and order operations.
- Reservations, tables and floor/table workflows.
- Point of Sale (POS), billing and receipt workflows.
- Restaurant payment settings and payment records.
- Team members, roles and invitations.
- Inventory and stock workflows.
- Delivery assignments, delivery operations, live map, staff, settings and reports.
- Restaurant coupons, subscriptions and support.

Access to restaurant data is intended to be scoped to the authenticated restaurant membership and permitted branch.

### Super Admin portal

Platform administration pages include:

- Admin dashboard.
- Restaurant management and branch oversight.
- Food categories, food items and category requests.
- Customer and order management.
- Payment administration and commission records.
- Coupons and subscriptions.
- Support inbox.
- Reports and analytics.
- Platform/system settings and audit-related workflows.

## Feature overview

The following is a high-level inventory of capabilities visible in the source tree. Presence of a page or API does not by itself mean that every scenario has passed acceptance testing.

| Area | Capabilities |
|---|---|
| Authentication | Session-based login, customer registration, restaurant registration/invitations and role-protected portals |
| Marketplace | Public restaurant discovery, listing visibility rules, branch eligibility and menu browsing |
| Menu management | Categories, food items, availability, variants, add-ons and featured status |
| Branch management | Branch details, operating hours/days, timezone, service flags, active and primary state |
| Cart and checkout | Persistent single-branch cart, server-side repricing, address/service validation and order creation |
| Payments | Cash on Delivery and optional Razorpay checkout/POS flows, subject to configuration and verification |
| Orders | Customer order history/details and restaurant order operations |
| Reservations and tables | Reservation management, table workflows and QR-related ordering functionality |
| POS | Dine-in/takeaway order entry, tenders, receipt data and browser printing workflow |
| Inventory | Inventory foundation, stock ledger and order-preparation integration |
| Delivery | Restaurant delivery settings, assignments, order views, staff and live-map pages |
| Customer engagement | In-app notifications, preferences and support tickets |
| Platform operations | Coupons, subscriptions, commissions, settlements, reports and system administration |

### Known verification limitations

The repository's audit records several areas as partially implemented or awaiting broader acceptance testing. Examples include complete payment/refund reconciliation, all reservation and QR edge cases, coupon and subscription entitlement checks, commission/settlement reconciliation, purchasing and inventory reconciliation, external notification channels, full reporting validation, physical printer testing and responsive/accessibility review. A separate delivery-partner login/workspace is not established in the audit.

Do not treat this README's feature inventory as a guarantee that every feature is production-ready. Consult the audit and implementation status documents for detailed evidence and outstanding work.

## Technology stack

### Frontend

- React 19
- Vite 8
- JavaScript (ES modules)
- React Router 7
- Tailwind CSS 4
- Axios
- Socket.IO Client
- Lucide React icons

### Backend

- Node.js
- Express 5
- Sequelize 6
- MySQL (`mysql2`)
- `express-session`
- `connect-session-sequelize` for persistent sessions
- `bcrypt` for password hashing
- Socket.IO
- Razorpay Node SDK
- Helmet and CORS middleware
- QR code generation

## Repository structure

```text
foodiehub/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── portals/
│   │   │   ├── admin/
│   │   │   ├── customer/
│   │   │   └── restaurant/
│   │   ├── context/
│   │   ├── components/
│   │   └── ...
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── migrations/
│   │   ├── models/
│   │   ├── modules/
│   │   ├── routes/
│   │   ├── scripts/
│   │   └── server.js
│   ├── test/
│   └── package.json
├── docs/
├── AUDIT_REPORT.md
├── IMPLEMENTATION_STATUS.md
└── README.md
```

The server API is grouped into modules for authentication, administration, restaurants, customers, orders, public marketplace endpoints, subscriptions and support. Database schema changes are managed through Sequelize migrations.

## Requirements

Install the following before running the project:

- Node.js version compatible with Vite 8 and the installed dependencies.
- npm.
- MySQL server and a database/user for the application.
- Razorpay test credentials only if testing online payments.
- A modern browser.

## Getting started

### 1. Clone the repository

```bash
git clone <your-repository-url>
cd foodiehub
```

### 2. Install backend dependencies

```bash
cd server
npm install
```

### 3. Install frontend dependencies

Open another terminal from the project root:

```bash
cd client
npm install
```

### 4. Configure environment variables

Create your own `server/.env` and `client/.env` files using the configuration below. Do not copy real secrets into source control.

### 5. Create and migrate the database

Create the MySQL database configured in `server/.env`, then run the migrations as described in [Database and migrations](#database-and-migrations).

### 6. Start the API and frontend

Run the backend and frontend in separate terminals as described in [Running the application](#running-the-application).

## Environment configuration

### Backend — `server/.env`

Set the following values for your local environment:

```dotenv
NODE_ENV=development
PORT=5000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=foodiehub
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password

SESSION_SECRET=replace_with_a_long_random_secret
CLIENT_URL=http://localhost:5173

# Optional: Razorpay test mode
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_test_secret
```

Use the exact variable names expected by the server configuration in your checkout. Additional integrations may require further variables.

### Frontend — `client/.env`

```dotenv
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Vite exposes variables prefixed with `VITE_` to browser code. **Never put passwords, session secrets, database credentials or Razorpay secret keys in frontend environment variables.**

## Database and migrations

FoodieHub uses MySQL with Sequelize models and explicit migrations.

From the `server/` directory, apply migrations with:

```bash
npx sequelize-cli db:migrate \
  --config src/config/sequelize-cli-config.js \
  --migrations-path src/migrations
```

Check migration status:

```bash
npx sequelize-cli db:migrate:status \
  --config src/config/sequelize-cli-config.js \
  --migrations-path src/migrations
```

Use the project's migration workflow for schema changes. Avoid manually editing production database tables or relying on automatic schema synchronization.

## Running the application

### Backend development server

From `server/`:

```bash
npm run dev
```

The API is configured to use port `5000` by default in the documented local setup. The health endpoint is:

```text
GET http://localhost:5000/api/v1/health
```

### Frontend development server

From `client/`:

```bash
npm run dev
```

Vite prints the local development URL in the terminal (typically `http://localhost:5173`).

### Production frontend build

From `client/`:

```bash
npm run build
npm run preview
```

The frontend build output is generated in `client/dist/`.

### Backend production start

From `server/`:

```bash
npm start
```

## Tests and quality checks

### Backend tests

From `server/`:

```bash
npm test
```

The test command uses Node's built-in test runner.

### Frontend lint

From `client/`:

```bash
npm run lint
```

### Frontend production build

From `client/`:

```bash
npm run build
```

Refer to `AUDIT_REPORT.md` for the dated test/build results and their limitations. Results in that report are checkpoints from the time they were run, not a guarantee about a different local environment or later code changes.

## Important implementation notes

- Authentication uses the `foodiehub.sid` session cookie; the project documentation does not describe JWT authentication.
- Customer carts are persistent and scoped to one restaurant and branch.
- Checkout recalculates prices on the server using current menu and option records; client-submitted totals are not trusted.
- Customer order creation uses an idempotency key to protect against duplicate retries.
- COD and Razorpay availability depend on branch settings and backend configuration.
- Razorpay payment completion must be verified by the backend; the browser must never be trusted to declare a payment successful.
- Public marketplace visibility depends on restaurant approval, listing publication, marketplace enablement and an eligible active branch.
- Branch operating hours use the branch timezone; the documented default is `Asia/Kolkata`.
- Restaurant and branch authorization should be enforced by server-side membership/permission middleware.

## Security notes

- Keep `.env` files out of Git. Commit a sanitized `.env.example` instead of real credentials.
- Never commit database passwords, session secrets, API secrets, private keys or customer data.
- Keep Razorpay secret credentials on the server only.
- Use HTTPS, secure cookie settings and production-appropriate CORS/session configuration when deploying.
- Use least-privilege database credentials and back up the database.
- Review authorization and tenant/branch isolation whenever adding an API endpoint.
- Do not run destructive database or payment tests against production data.

## Project documentation

More detailed technical documentation is available in the `docs/` directory:

- [`docs/customer-ordering-api.md`](docs/customer-ordering-api.md) — customer cart, checkout, ordering and payment flow.
- [`docs/customer-dashboard-api.md`](docs/customer-dashboard-api.md) — customer dashboard endpoints.
- [`docs/menu-management-api.md`](docs/menu-management-api.md) — restaurant menu management.
- [`docs/branch-management-api.md`](docs/branch-management-api.md) — branch management.
- [`docs/marketplace-api.md`](docs/marketplace-api.md) — public marketplace and listing rules.
- [`docs/database.md`](docs/database.md) — database notes.
- [`docs/maps-and-location.md`](docs/maps-and-location.md) — maps and location functionality.
- [`docs/order-refunds-api.md`](docs/order-refunds-api.md) — order refund API and workflow.
- [`AUDIT_REPORT.md`](AUDIT_REPORT.md) — repository audit, verification evidence and known gaps.
- [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) — implementation history and status checkpoints.

---

## License

No project license was identified in the inspected package manifests. Add a `LICENSE` file before distributing this project under an open-source license.
