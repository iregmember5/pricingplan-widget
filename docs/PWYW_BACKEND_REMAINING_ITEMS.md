# PWYW backend and deployment items still to confirm

**Source:** Backend frontend integration guide supplied November 25, 2026. The guide says the backend implementation is on branch `hasnain`, has tests written but not run, and has not been deployed. This document records remaining integration dependencies; it does not claim backend deployment or test completion.

## Required before hosted checkout is considered ready

1. **Deploy the backend implementation.** The PWYW endpoints are existing widget/public-widget/widget-checkout endpoints, so no new URL is required. Confirm the deployed API accepts `is_published`, exposes `currency_minor_digits`, validates `amount_minor`, and returns `pricing_mode`, `reference_id`, and `comments` as described in the integration guide.
2. **Run the backend tests and regression suite.** The supplied status says tests are written but have not been run. Confirm both the PWYW cases and fixed-price widget checkout regression before release.
3. **Configure the trusted hosted-checkout origins.** Populate `PAYMENTS_PWYW_HOSTED_CHECKOUT_HOSTS` with the deployed MyPowerly frontend origins that may host PWYW checkout, including production, staging, preview, and any dedicated development host. The known hosted widget origin in this frontend is `https://pricingwidget.mypowerly.com`. The current local dev host (`http://localhost:5173`) is intentionally not sent as `embed_origin`; use a direct checkout link for local testing. Confirm the complete environment host list with the backend operator before rollout.
4. **Set the browser frame policy at the frontend host / edge.** `/pay/<widget_id>` is served by the frontend host, so Django cannot add its response header. The serving layer must set `Content-Security-Policy: frame-ancestors ...` per widget using the public widget's `allowed_domains`, plus the approved MyPowerly parent origins. With no allowed-domain list, follow the backend guide's `frame-ancestors *` policy. Do not assume a React `<meta>` tag can enforce `frame-ancestors`; this must be an HTTP response header. Ensure no conflicting `X-Frame-Options` blocks the route.

## Product/API details to resolve or verify

- **Logo upload path:** backend says to reuse the existing image upload and persist only the resulting URL. The owner editor currently accepts an HTTPS/HTTP logo URL, and no reusable general widget-logo upload endpoint/component was identified in the frontend code. If a supported upload route exists, provide its path, request format, limits, and returned URL contract so it can be wired into the editor. Until then, the URL field remains the available input.
- **Payment routing behavior:** the owner editor preserves current widget `payment_settings` and `stripe_account_id`, uses the merchant's existing connected gateway/priority state for a new widget, and defers to central routing when it is active. Confirm the backend accepts the same top-level `stripe_account_id` and `config_json.payment_settings` shapes used by fixed-price widgets.
- **Error envelope:** checkout errors are mapped from the universal `errors` object. Confirm 400 field errors and 404/409/unavailable responses match the supplied examples in every deployed environment.
- **Direct-link versus embed restrictions:** the guide says direct links remain available while `allowed_domains` restricts embedded checkouts. Confirm the deployed origin/middleware behavior follows this rule and does not reject direct requests with no `embed_origin`.
- **Currencies and limits:** public config reports `currency_minor_digits`; current supported currencies are USD/CAD, both expected to report 2. Confirm this is present on all public PWYW responses and the server-side cap/provider bounds are enforced independently of the browser.

## Frontend-side completion notes

- Owner create/update now sends `is_published` and reads normalized saved settings. It leaves a published widget published when an owner saves edits without choosing to unpublish.
- Public widget rendering checks the PWYW type and publication/active flags; the loader hides its button for unavailable configurations.
- Checkout uses the public `currency_minor_digits` value to produce integer minor units, sends no `plan_id` or client-supplied currency/gateway, and passes an origin only for a non-local embedded checkout.
- Checkout error responses retain field-level messages. Merchant transaction details show Reference ID and Comments for PWYW rows, and transaction search sends the `reference_id` query parameter.
- Dynamic `frame-ancestors` cannot be completed in this static frontend source alone; it requires a host/edge configuration or route-aware server response header.

## Launch checklist

- [ ] Backend branch deployed and deployed contract verified.
- [ ] Backend PWYW and fixed-price regression tests run and pass.
- [ ] Production/staging/preview hostnames confirmed and configured in `PAYMENTS_PWYW_HOSTED_CHECKOUT_HOSTS`.
- [ ] Frontend host or edge emits route-specific `frame-ancestors` based on the public widget's allowed domains.
- [ ] Logo upload contract provided or merchant-facing URL-only behavior accepted.
- [ ] Stripe/payment settings payload shape and direct-link origin behavior confirmed against the deployed API.
