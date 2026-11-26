# PWYW theme mode: backend contract

The owner editor and hosted checkout now use `theme_mode` in
`config_json.pay_what_you_want`:

```json
{
  "pay_what_you_want": {
    "theme_mode": "light"
  }
}
```

The backend currently validates PWYW settings against an explicit field list,
so it must be updated before this owner setting can be saved successfully:

- Accept only `light` or `dark` for `theme_mode`.
- Default an omitted value to `light` for existing widgets.
- Persist the value and return it from the public widget read endpoint.
- Keep it presentation-only; it must not affect limits, currency, payment
  routing, checkout identity, or transaction processing.

Unknown or missing values on the public page render as `light` for
compatibility.
