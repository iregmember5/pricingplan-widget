# Pay What You Want widget: backend handoff

**Status:** Frontend is integrated against the backend contract supplied November 25, 2026. Backend implementation is reported as present on `hasnain`, but not yet deployed; its tests are written and have not been run. See [remaining backend and deployment items](./PWYW_BACKEND_REMAINING_ITEMS.md). The November 25 integration guide supersedes earlier assumptions here.

## Product behavior

Pay What You Want (PWYW) is a separate one-time checkout mode on the existing `NewUserPricingWidget`. The owner publishes business and payment-page details without creating services, fixed-price plans, or installment terms. A customer enters an amount, optionally a Reference ID and comment, and pays through the existing widget checkout and payment collector. Fixed-price widgets must keep their current behavior.

The payment page is hosted by MyPowerly at `/pay/<widget_id>`. The embeddable loader, `pwyw.js`, places a branded button on the merchant's site and opens that same hosted page in a MyPowerly iframe. A direct link opens the same page without an iframe.

## Owner configuration

Continue using the existing authenticated new pricing widget create/update APIs and `NewUserPricingWidget.config_json`; do not create a separate widget table solely for PWYW. Identify this mode using `config_json.widget_type = "PAY_WHAT_YOU_WANT"` and store its settings under `config_json.pay_what_you_want`:

```json
{
  "widget_type": "PAY_WHAT_YOU_WANT",
  "pay_what_you_want": {
    "business_name": "Hope Community Kitchen",
    "logo_url": "https://cdn.example.org/hope-logo.png",
    "support_email": "support@example.org",
    "title": "Support Our Food Drive",
    "description": "Help provide meals to local families.",
    "currency": "USD",
    "minimum_amount": "1.00",
    "maximum_amount": null,
    "suggested_amount": "25.00",
    "collect_reference_id": true,
    "collect_comments": true,
    "button": { "label": "Pay What You Want", "color": "#2B59C3" },
    "allowed_domains": ["hopekitchen.org"]
  },
  "plans": [],
  "cards": [],
  "tables": []
}
```

The owner create/update request also sends `is_published: true|false`; `status: "published"` is ignored by the current backend. Keep the existing payment fields used by fixed-price widgets (`config_json.payment_settings` and/or top-level `stripe_account_id`) and do not invent credentials. Publication state is read from `is_published`.

Use the existing media upload flow if available; store the resulting public logo URL. The example does not define a new upload endpoint.

Validate on the server, regardless of client validation:

- Require business name and payment title; permit an empty description and support email.
- Allow only the supported PWYW currencies (USD and CAD for the current frontend contract).
- Minimum, maximum and suggested amounts are optional decimal strings with at most two fractional digits. When present they must be positive; minimum must not exceed maximum; suggested amount must lie inside configured bounds.
- Validate the button color as a six-digit hex value and require a non-empty label of at most 40 characters.
- Validate domains as hostnames only (no scheme, port, path, credentials, wildcard or query). Normalize case and any trailing dot consistently.
- Keep this mode one-time only; no fixed plans, automatic debits, installments or recurring billing.

The owner UI saves through the existing create/update API and derives the direct link and embed snippet from the returned widget ID; no storage table is needed for those strings. The frontend reads normalized settings back from the response.

## Public configuration read

Reuse the public new-pricing-widget endpoint already used by the frontend:

```http
GET /v1/api/widgets/new-pricing-widget/public/{widget_id}/
```

Unauthenticated reads should return only fields needed to render the button and checkout: widget ID, `is_active`, `is_published`, widget type, business name, logo URL, title, description, currency, `currency_minor_digits`, minimum/maximum/suggested amount, customer-field flags, button settings and allowed-domain information needed for validation. Do not expose merchant profile data, credentials, API keys, receiving-account IDs or private configuration.

The public widget endpoint returns its existing direct widget envelope (not the universal `{success,data}` wrapper). An unpublished, inactive, deleted, or otherwise unavailable widget returns 404. The frontend must not treat a successful JSON response alone as proof that checkout is allowed.

## Checkout changes

Reuse `WidgetCheckoutService` and the existing endpoint:

```http
POST /v1/api/payments/widget-checkouts/
Content-Type: application/json
```

PWYW request example:

```json
{
  "widget_kind": "new",
  "widget_id": "<widget UUID>",
  "quantity": 1,
  "amount_minor": 2500,
  "reference_id": "Invoice 1042",
  "comments": "Thank you for the work",
  "embed_origin": "https://hopekitchen.org",
  "creation_reference": "<UUIDv4>",
  "recovery_secret": "<base64url recovery secret>"
}
```

For PWYW, `plan_id` is omitted. The frontend must not submit a currency, gateway, payment method, receiving account, amount in major units, or prior purchase token. The backend reads the saved widget configuration and determines currency and routing. Existing fixed-price requests and behavior remain unchanged.

In the server pricing resolver, branch only when the saved widget type is PWYW. Validate that `amount_minor` is a positive integer, is within the platform safety cap, follows the configured currency's minor-unit precision, and satisfies the saved merchant minimum and maximum if present. Also enforce provider/account limits and gateway eligibility already in force; do not guess or bypass them. Reject malformed amounts, inactive/unpublished widgets, unsupported currency, invalid optional fields, and origin/domain violations. Never trust the browser's bounds or currency.

Resolve the amount and route once, then persist the exact amount, currency, widget, reference ID and comments with the checkout/purchase before returning it. Treat those values as immutable for that purchase. Replays with the same creation identity and exact request intent must return the same checkout; a replay using that identity with altered amount/reference/comments must be rejected. Concurrent duplicate requests must not create multiple purchases.

Return the existing universal checkout response, including authoritative amount/currency, purchase credentials, status, `can_submit`, expiry, and collection descriptor. The customer page must initialize only the collector named by the server response. If the checkout is expired, not payable, or has an unresolved attempt, do not create another purchase or submit a charge.

The public config supplies `currency_minor_digits`; the frontend checks decimal precision and computes `amount_minor` using that value. USD/CAD currently report two digits. The amount stays locked after checkout creation. A successful response uses `plan_id: "pay_what_you_want"` and includes `pricing_mode`, `reference_id`, and `comments`.

## Recovery and idempotency

The frontend saves a new UUIDv4 `creation_reference` and 32-byte cryptographically random base64url `recovery_secret` in tab-local session storage before the first create request. A timeout retries the same body and identity. The secret must never appear in a URL, logs, analytics or public widget configuration.

Keep the existing resume/status recovery endpoints authoritative. When a prior request may have reached the server, recover the original checkout before allowing a new identity. An unresolved, processing, uncertain or successful attempt must never cause a second purchase. A verified terminal failed/cancelled payment can be replaced only through the established checkout policy.

## Embedded origin and browser policy

Reuse `PricingWidgetCORSMiddleware` for normalized owner domain enforcement, and validate the server-observed request origin/referrer at checkout creation when `allowed_domains` is configured. `embed_origin` is an assertion from the browser and must not be the sole security check. The direct link remains supported even when embed domains are configured; the frontend omits `embed_origin` for direct links and omits it for localhost embeds.

The hosted checkout must be frameable only by allowed merchant domains when configured. Since `/pay/<id>` is served by the frontend host, route-aware `Content-Security-Policy: frame-ancestors ...` must be implemented at the frontend host/edge, not Django. Do not rely on a React meta tag or send a conflicting `X-Frame-Options: DENY`. With no allowed-domain list, the supplied backend guide specifies `frame-ancestors *`. CORS controls API reads; it does not itself control iframe embedding. The embed loader sends `embed_origin` from the parent origin for embedded non-local checkout.

The embed loader uses a Shadow DOM button and an iframe at `https://pricingwidget.mypowerly.com/pay/{id}?embed=1`. It accepts `postMessage` only when both event origin and source window match the MyPowerly origin and that iframe. The checkout posts `payment_processing`, `payment_ready` and `payment_succeeded`; the loader prevents closing while processing and closes after confirmed success.

## Transactions, search and audit

Persist Reference ID and Comments with the purchase/payment record and carry them through the existing successful/failed transaction lifecycle. Show both in merchant transaction detail where appropriate; make Reference ID searchable. Do not expose comments in the public widget read or in payment URLs. Preserve the existing webhook idempotency and transaction status handling; the webhook-confirmed amount must match the locked checkout amount.

Add the widget type to existing admin filters and make it clear in admin views that PWYW checkouts use a customer-entered amount. No new model is needed if existing checkout metadata can safely store the two optional fields; if the current schema cannot persist them reliably, choose the smallest migration consistent with existing transaction metadata and document it before deployment.

## Backend acceptance checklist

- Create/update/publish a PWYW widget without services or plans; existing fixed-price widget creation remains unchanged.
- Reject invalid configuration, unsupported currency, invalid domains, amount bounds, invalid label/color, and inconsistent suggested amount.
- Public read returns only public fields and never exposes private merchant or payment credentials.
- Checkout rejects zero, negative, decimal-minor-unit, malformed, over-cap, below-minimum and above-maximum values; it uses saved currency and server routing.
- A published quantity-one PWYW checkout uses the exact validated customer amount, creates a one-time purchase, and stores reference/comment immutably.
- Retry/replay of the same creation identity returns the same checkout; conflicting intent is rejected; duplicate concurrent creates do not duplicate purchases.
- An unresolved payment cannot be replaced. Webhooks update the existing transaction once and confirm the locked amount.
- Configured `allowed_domains` are enforced for embedded checkout and frame policy; direct checkout remains available under the agreed policy.
- Add regression coverage for existing fixed-price widgets, widget checkout, payment status, webhook idempotency, and transaction search/detail.

## Files in this frontend handoff

- Owner configuration/editor: `ESignature-FrontendBugFix-by-Ssemugabi/src/views/eSignature/Widget/NewPricingWidget/PayWhatYouWantEditor.tsx` and `NewPricingWidget.tsx`.
- Hosted widget loader: `pricingplan-widget/public/pwyw.js`.
- Public `/pay/<id>` route and mode detection: `pricingplan-widget/src/main.tsx`.
- Public widget read routing and PWYW rendering: `pricingplan-widget/src/Widget.tsx` and `src/previews/NewPricingTemplatePreview.tsx`.
- Amount entry, checkout request and customer fields: `pricingplan-widget/src/PaymentFlow.tsx` and `src/widgetCheckoutService.ts`.

No backend implementation or migration is included in these frontend files. Backend deployment and test execution remain unconfirmed as of the supplied backend status.
