# FoodieHub

FoodieHub is a JavaScript restaurant marketplace foundation with React/Vite, Express, MySQL, Sequelize, and session-based authentication.

## Local setup

1. Configure `server/.env` with `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `SESSION_SECRET`, and `CLIENT_URL`. For Razorpay test mode, set backend-only `RAZORPAY_KEY_ID=rzp_test_...` and `RAZORPAY_KEY_SECRET=...` from your Razorpay test account. Never put the secret in a `VITE_*` variable or return it to the browser. Restart the API after changing these values.
2. Install dependencies in `server` and `client` with `npm install` if needed.
3. From `server`, apply migrations with `npx sequelize-cli db:migrate --config src/config/sequelize-cli-config.js --migrations-path src/migrations`.
4. Start the API from `server` with `npm run dev`.
5. Start the frontend from `client` with `npm run dev`. Set `VITE_API_BASE_URL` if the API is not at `http://localhost:5000/api/v1`.

The API uses the existing `foodiehub.sid` cookie session. Customer accounts register at `/auth/customer/register` and sign in through `/auth/login`. Customers can build a persistent single-branch cart, pay with COD or Razorpay when configured and enabled for that branch, and view their own order history. Razorpay availability is calculated on the backend; its public Key ID is returned only when available, and the secret stays on the server. Payments remain pending until the backend verifies the Razorpay signature and confirms the captured amount with Razorpay. No JWT, fake payment completion, coupons, or unconfigured fees are used. Restaurant owners enable payment methods per branch. See [Customer cart and ordering API](docs/customer-ordering-api.md), [Customer dashboard API](docs/customer-dashboard-api.md), [Menu management API](docs/menu-management-api.md), [Branch management API](docs/branch-management-api.md), [Marketplace API](docs/marketplace-api.md), and [database notes](docs/database.md).
