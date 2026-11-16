# Public widget checkout: frontend integration

This documents the pricing widget's integration with the W1 public checkout API. The backend owns plan pricing and payment state. The initial supported flow is one-time native Stripe card payment in USD or CAD; VGS tokenization and recurring payments are not part of this flow.

## Create or recover a checkout

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

The frontend creates the UUIDv4 and 32-byte cryptographic recovery secret, stores both in `sessionStorage` before the first request, and reuses them for the same widget and plan. Initialization does not send amount, currency, email, gateway, billing interval, or proration data. The backend resolves the published offer and returns the authoritative terms.

For each initial create and recovery retry, replay the creation request with the original plan selection, `creation_reference`, and `recovery_secret`. The backend should return `200` or `201` with the same checkout. Immediately follow it with status using the exact same reference and secret:

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

The same identity is retained after a timeout. A creation error is not followed by status; retry the same creation request. If creation succeeds but status returns 404, keep the identity and investigate. The frontend never generates a replacement reference/secret or submits a charge automatically. Never log or share the recovery secret, purchase token, or idempotency key.

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

## Release and test boundary

Do not perform a production checkout until backend operations confirm the deployed W1 revision, widget policy, Stripe account/configuration, limits, lifetimes, and an authorized sandbox path. A successful OPTIONS/CORS check does not establish that POST configuration or payment execution is enabled. No checkout creation or charge POST was used during frontend validation.
