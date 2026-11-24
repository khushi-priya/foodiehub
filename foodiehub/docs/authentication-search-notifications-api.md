# Authentication and Restaurant Workspace APIs

All routes use the existing `/api/v1` API prefix. Authentication and restaurant authorization continue to use the existing server-side session cookie (`foodiehub.sid`).

## Customer email verification

### `POST /auth/customer/register`

Request:

```json
{
  "firstName": "Asha",
  "lastName": "Shah",
  "email": "asha@example.com",
  "phone": "9876543210",
  "password": "Example@123",
  "confirmPassword": "Example@123"
}
```

Success (`201`):

```json
{
  "success": true,
  "message": "If your details are eligible, a verification code has been sent to your email.",
  "data": { "email": "asha@example.com", "requiresEmailVerification": true }
}
```

### `POST /auth/customer/verify-email`

Request: `{ "email": "asha@example.com", "otp": "123456" }`

Success: `{ "success": true, "message": "Email verified. You can now sign in." }`

Invalid and expired codes return HTTP `400`; attempt and resend limits return HTTP `429`. OTPs expire after five minutes by default, allow five verification attempts, and may be resent after 45 seconds (up to five requests per hour). Only an HMAC digest is stored. A new code replaces the prior code.

### `POST /auth/customer/resend-email-otp`

Request: `{ "email": "asha@example.com" }`

Success uses a generic response so the endpoint does not disclose whether an address has a pending customer account. SMTP setup errors return `503` without exposing credentials.

## Restaurant search

### `GET /restaurant/tools/search?restaurantId=<authorized-id>&q=<term>`

The session determines the restaurant membership, permissions and branch scope. `restaurantId` is only used to select among memberships and does not grant access. Search terms shorter than two characters return an empty result set. Results are capped per category and overall.

Response:

```json
{
  "success": true,
  "data": {
    "results": [
      { "type": "Order", "name": "FH-ORDER-123", "secondary": "Asha Shah · preparing", "href": "/restaurant/orders?search=FH-ORDER-123", "entityId": "order-uuid" }
    ]
  }
}
```

Search includes only categories the authenticated membership may view: orders and customer references, menu items, reservations, tables and branches. Orders, reservations, tables and branches are restricted to authorized branches.

## Restaurant notifications

### `GET /restaurant/tools/notifications?restaurantId=<authorized-id>&limit=20&page=1`

Returns persisted notifications for the current restaurant membership and authorized branches, newest first.

```json
{
  "success": true,
  "data": {
    "notifications": [],
    "unreadCount": 0,
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
  }
}
```

### `PATCH /restaurant/tools/notifications/:notificationId/read?restaurantId=<authorized-id>`

Marks one notification belonging to the authenticated restaurant membership as read.

### `POST /restaurant/tools/notifications/read-all?restaurantId=<authorized-id>`

Marks all accessible unread notifications for the current membership as read. Both mutations return `{ "success": true, "data": ... }`.

Restaurant notifications are persisted with deduplication keys and delivered through the authenticated Socket.IO membership room as `restaurant:notification`. Relevant event sources currently include customer orders, payment verification, kitchen status changes, reservation creation/status changes, and delivery assignment/status changes.

## SMTP setup

Merge the values from `server/.env.example` into `server/.env`, then set SMTP credentials there. For Gmail, enable two-step verification and create a Google App Password; use that value for `SMTP_PASSWORD` (the legacy `SMTP_PASS` name is also accepted). Spaces in the app password are removed automatically. Do not use a normal Gmail account password. Restart the server after updating environment variables. Run pending Sequelize migrations only after confirming they are needed for the target database; the OTP service checks and reuses existing columns and does not require `sequelize.sync({ alter: true })`.

From the `server` directory, apply pending migrations with:

```sh
npx sequelize-cli db:migrate --config src/config/sequelize-cli-config.js --migrations-path src/migrations --env development
```

Install backend dependencies with `npm install` from `server` (Nodemailer is included in `package.json`). Run `npm test` in `server` and `npm run build` in `client` to validate the application. A real SMTP delivery check requires a configured SMTP account and a test inbox; automated tests use a mocked SMTP transport and do not send mail to a real address.
