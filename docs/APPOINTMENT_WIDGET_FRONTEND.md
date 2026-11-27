# Public appointment widget

This repository now owns the visitor-facing appointment UI alongside its existing pricing and form renderers. The admin designer, schedules, services, calendar settings, widget publication, and staff tracker remain in `ESignature-FrontendBugFix-by-Ssemugabi`.

## Routing and loader

- `/appointments/<widget-id>/`: hosted booking page.
- `/appointments/<widget-id>/?embed=1`: iframe booking page.
- `/appointments/manage/#token=…`: private booking lookup, rescheduling and cancellation.
- `/?slug=<widget-id>&type=appointment`: optional query-based entry.

`src/bootstrap.ts` recognizes only the appointment routes/type and dynamically imports `src/appointments/mount.tsx`. The existing payment-status branch and fallback to `src/main.tsx` remain in place. The pricing/form renderers, payment logic, and API configuration are unchanged.

Direct iframe installation uses the backend-returned `embed_url`. Script installation is also supported:

```html
<div id="widget-WIDGET_UUID" data-type="appointment"></div>
<script src="https://pricingwidget.mypowerly.com/widget-loader.js?slug=WIDGET_UUID&type=appointment" async></script>
```

Either `data-type="appointment"` or the script query `type=appointment` selects the appointment iframe. Existing pricing and form iframe URLs retain their previous format. Appointment resize messages accept only the matching iframe window and widget origin; the public page sends geometry only.

## Backend contract

Appointment-only fetch functions live in `src/appointments/api.ts`. They use the existing `API_BASE_URL`, omit credentials, do not attach staff/workspace state, preserve snake_case, and unwrap successful payloads from `data`.

- `GET /widgets/public/appointment-widgets/{id}/`
- `GET /widgets/public/appointment-widgets/{id}/availability/`
- `POST /widgets/public/appointment-widgets/{id}/book/`
- `POST /appointments/public/customer-bookings/{lookup|availability|reschedule|cancel}/`

Slot dates cover at most 31 days. Available times are selectable; booked/unavailable times are disabled. Slot timestamps render in the selected display timezone. Booking attempts retain their idempotency key for unchanged retries after a network/calendar failure; conflicts keep contact details and refresh availability. Validation errors appear beside the affected fields. Successful bookings show the reference, confirmed times, location when present, management link, cutoff and ICS download.

Customer tokens are captured synchronously in the bootstrap and removed from the fragment before dynamically importing the management UI. They stay in memory, are submitted only in JSON, and are never sent to the embed parent or stored locally. If the URL cannot be scrubbed, management fails closed.

## Deployment

Set backend `APPOINTMENT_PUBLIC_WEB_URL` to `https://pricingwidget.mypowerly.com/appointments` (or the deployment's corresponding public-widget origin). Do not point it to the admin app. The admin uses `hosted_url` and `embed_url` returned by the backend rather than rewriting them.

The existing SPA fallback serves the appointment paths. Configure backend CORS for this origin and an appropriate frontend framing policy for permitted embed hosts. For local testing, run this repo with `npm run dev` (port 5174) and use `http://localhost:5174/appointments/<widget-id>/`; test IDs must be published in the backend. SMTP, Celery and Google/Outlook writeback remain backend operations.

Rich design JSON, real staff assignment and pricing/payments are not added to the supplied appointment contract. All existing admin preview controls are preserved. Their backend requirements and browser-local design preservation are documented in the admin repo's `docs/appointment-widget-backend-handoff.md`.

## Checks

```sh
npm run build
node --test tests/*.mjs
```

`tests/appointments.test.mjs` covers the public API contract, token transport, errors, route separation, unchanged pricing/form loader URLs, and appointment iframe resize validation. The same command runs the existing payment tests.

For a production-build browser test, run from the adjacent admin repo:

```sh
node scripts/test-public-appointment-widget-browser.cjs
```

That test serves this repo's `dist`, mocks API calls, and verifies appointment booking/recovery, customer changes, actual iframe loading, and existing pricing rendering and form submission. Override `PUBLIC_WIDGET_DIR` if the public repo is elsewhere and `CHROME_PATH` if Chrome is elsewhere. It never sends live bookings, form submissions, or payments.
