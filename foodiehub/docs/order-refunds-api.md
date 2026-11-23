# Order refund API

Restaurant users need the `payments.refund` permission. The system restaurant-owner role receives it; authorized custom roles can receive it through role management. Every request is scoped to the authenticated restaurant and assigned branch.

## Submit a full Razorpay refund

`POST /api/v1/restaurant/orders/:orderId/refund`

```json
{ "reason": "Order cancelled by the restaurant" }
```

Only a captured, paid Razorpay order in `cancelled` or `rejected` state is eligible. The server obtains the amount from the saved order, checks the captured payment with Razorpay, writes one refund record per order, and submits the full amount. COD and partial refunds are not supported by this endpoint.

Possible refund states are `requested`, `pending`, `processed`, `failed`, and `unknown`. The order payment status changes to `refunded`, and commission adjustments are created, only after Razorpay reports `processed`.

## Reconcile provider state

`GET /api/v1/restaurant/orders/:orderId/refund`

For pending or uncertain results, this fetches the refund from Razorpay (or searches the payment's refund list by the internal refund ID in provider notes) and synchronizes the saved state. A network error is recorded as `unknown`; the create endpoint will not automatically issue a second refund. Reconciliation is safe to repeat.

Every refund request creates an immutable audit-log event. The customer order detail page displays saved refund state; restaurant staff can submit/reconcile from order details; Super Admin order details and refund reports show the saved reference and amount.

## Operational limit

Razorpay currently has no captured test payment available in this workspace to exercise a real refund. Automated service tests use a mocked Razorpay response; do not treat those as a live gateway refund test.
