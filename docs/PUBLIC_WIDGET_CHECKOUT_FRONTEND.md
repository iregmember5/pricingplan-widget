# Public widget checkout: frontend integration

This documents the pricing widget's integration with the W1 public checkout API. The backend owns plan pricing and payment state. The initial supported flow is one-time native Stripe card payment in USD or CAD; VGS tokenization and recurring payments are not part of this flow.

## Create, recover, and restart a checkout

API root: `https://mypowerly.com/v1/api`

Create:

```http
POST /payments/widget-checkouts/
Content-Type: application/json
```

```json
{
  "widget_kind": "new",
  "widget_id": "PUBLISHED_WIDGET_UUID",
  "plan_id": "growth",
  "quantity": 1,
  "creation_reference": "CLIENT_GENERATED_UUID_V4",
  "recovery_secret": "43_CHARACTER_UNPADDED_BASE64URL_SECRET"
}
```

The frontend creates the UUIDv4 and 32-byte cryptographic recovery secret once and stores them with the widget, plan, and quantity before the first request. A network timeout retries the exact same create request with that identity; never generate a new identity just because a response was lost. Initialization does not send amount, currency, email, gateway, billing interval, or proration data. The backend resolves the published offer and returns the authoritative terms. Immediately follow a successful create with status using the same reference and secret:

```http
POST /payments/widget-checkouts/status/
Content-Type: application/json
```

```json
{
  "creation_reference": "ORIGINAL_UUID_V4",
  "recovery_secret": "ORIGINAL_SECRET"
}
```

For a previously acknowledged checkout, recover it with:

```http
POST /payments/widget-checkouts/resume/
Content-Type: application/json
```

Use the same `creation_reference` and `recovery_secret`. If the returned checkout is `expired`, has `can_submit: false`, and has no payment attempt, stop status polling and do not initialize its collector even if a collection descriptor is present. Show “Your checkout expired. Start a new checkout to continue.” and a **Start again** action. On that explicit action, archive the old checkout reference, generate one new UUIDv4 and one new 32-byte base64url recovery secret, and save them with the same widget, selected plan, and quantity before posting a fresh create request. The backend calculates current price, currency, receiving account, and collection route; do not send those values or the old purchase token.

If the expired checkout has an attempt or payment record, recover its payment status first and do not create another purchase while its result is unresolved. For a failed create response caused by a changed/unavailable offer or merchant setup, show the backend message and return the customer to review the offer before another create attempt. If a new create request times out or its response is lost, retry or resume using that same new identity. A refresh recovers the active identity; it must not create another identity automatically.

The frontend never submits a charge automatically. Never log or share the recovery secret, purchase token, or idempotency key.

## Checkout response

Read the standard API response's `data` object. Relevant fields include `purchase_id`, `widget_kind`, `widget_id`, `plan_id`, `plan_name`, `quantity`, `unit_amount`, `amount`, `currency`, `status`, `can_submit`, `purchase_token`, `idempotency_key`, `attempt_id`, `next_action`, and `collection`.

Display the returned amount and currency. Show Stripe card fields only when `can_submit` is true, status is `ready`, currency is USD or CAD, and `collection` provides Stripe card configuration with a publishable key. The collection config supplies `provider`, `payment_method`, `publishable_key`, and optional `stripe_account`.

## Submit and verify payment

Stripe.js creates a PaymentMethod from Stripe-hosted card fields. The payment request contains only the scoped purchase data:

```http
POST /payments/router/charge/
Content-Type: application/json
```

```json
{
  "purchase_id": "RETURNED_PURCHASE_ID",
  "purchase_token": "RETURNED_PURCHASE_TOKEN",
  "idempotency_key": "RETURNED_PAYMENT_KEY",
  "target_gateway": "stripe",
  "payment_method": "card",
  "stripe_payment_method": "pm_PROVIDER_METHOD"
}
```

The frontend submits at most once from a checkout attempt. A lost response is recovered by calling the original checkout's status endpoint; it never triggers another charge. For `requires_action`, Stripe authentication uses the returned `next_action.client_secret`, then the frontend checks backend status. Only a backend status of `succeeded` displays “Payment confirmed.”

`processing`, `submitting`, `uncertain`, `requires_action`, `failed`, and `cancelled` remain distinct statuses. A browser redirect, HTTP success, or top-level API `success` flag alone does not confirm payment.

## Widget ACH status and notifications

Use the same customer-facing payment fields in the `POST /v1/api/payments/purchase-payments/` response's `data` and the `POST /v1/api/payments/widget-checkouts/status/` response's `data.payment`. Preserve the original purchase and attempt IDs after refresh. The initial response drives the screen immediately, even before a status refresh.

| Verified result | Response fields | Customer display |
| --- | --- | --- |
| Submitted or authorized | `status: "processing"`, `amount`, `currency`, `receipt_available: false` | Show “Your bank payment is processing,” the amount submitted, a support reference, and Check payment status. |
| Submission outcome unknown | `status: "uncertain"` or an ambiguous request error | Check the original payment. Keep payment submission locked. |
| Payment confirmed | `status: "succeeded"`, `receipt_available: true`, and optionally `receipt_url` | Confirm payment. Show View receipt only if a scoped HTTPS receipt URL on the MyPowerly API origin is issued. |
| Failed, returned, or needs review | `status: "failed"` or `"cancelled"`, `return_status: "returned"`, or `review_required: true` | Show the applicable outcome and offer status or merchant support. |
| Refund confirmed | Positive decimal string in `confirmed_refund_amount` | Show the confirmed refund amount separately from the original payment. |

Include `merchant_display_name` when available. The widget uses “several business days” while processing. A shorter estimate needs an account-specific, verified backend contract.

For errors, return a stable machine-readable code, customer-safe message, and a support reference. If a future response offers retry or replacement, specify the exact action and the original purchase it applies to. A network error, generic 503, or missing attempt in one status lookup is insufficient to unlock a payment.

**Backend work for email updates:** Save a widget customer's email and enabled preference on the checkout. Queue initial processing, confirmed payment/receipt, failure or return, and confirmed refund notifications from verified lifecycle events. Deliver through the existing notification worker and deduplicate per checkout, recipient, and event. Include amount, merchant, reference, and a MyPowerly-issued secure status link. Reconcile after the browser closes. Set `customer_notifications.status_updates_enabled: true` in both responses only when the recipient is saved and this notification flow is active. Keep merchant deposit and funds availability separate from the customer receipt.

## Release and test boundary

Do not perform a production checkout until backend operations confirm the deployed W1 revision, widget policy, Stripe account/configuration, limits, lifetimes, and an authorized sandbox path. A successful OPTIONS/CORS check does not establish that POST configuration or payment execution is enabled. No checkout creation or charge POST was used during frontend validation.
