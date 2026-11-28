import { useRef, useState } from 'react';

type HostedRoute = {
  gateway: 'paypal' | 'checkout';
  environment: 'live' | 'sandbox';
};

type ProviderAction = { type?: string; provider?: string; url?: string } | null;
type ProviderResult = { purchase_id?: string; gateway?: string; status?: string; next_action?: ProviderAction };

const storageKey = (id: string) => `mypowerly.hosted-payment.v1.${id}`;

export function hostedProviderRoute(collection: { flow?: string; gateway?: string; environment?: string } | null | undefined, id: string): HostedRoute | null {
  const environment = collection?.environment;
  if (environment === 'sandbox' || environment === 'live') {
    if (collection?.flow === 'paypal_approval' && collection.gateway === 'paypal') return { gateway: 'paypal', environment };
    if (collection?.flow === 'checkout_hosted' && collection.gateway === 'checkout') return { gateway: 'checkout', environment };
  }
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(id)) ?? 'null');
    return (saved?.gateway === 'paypal' || saved?.gateway === 'checkout') && ['live', 'sandbox'].includes(saved?.environment)
      ? saved : null;
  } catch { return null; }
}

function redirectUrl(action: ProviderAction | undefined, route: HostedRoute) {
  if (action?.type !== 'redirect' || route.gateway !== action.provider || !action.url) return null;
  try {
    const url = new URL(action.url);
    const sandbox = route.environment === 'sandbox';
    const hostname = route.gateway === 'paypal'
      ? sandbox ? 'www.sandbox.paypal.com' : 'www.paypal.com'
      : sandbox ? 'pay.sandbox.checkout.com' : 'pay.checkout.com';
    const path = route.gateway === 'paypal' ? url.pathname === '/checkoutnow' : /^\/page\/[^/]+$/.test(url.pathname);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && url.hostname === hostname && path ? url.href : null;
  } catch { return null; }
}

export default function HostedProviderPayment({ apiRoot, purchaseId, purchaseToken, idempotencyKey, route, canStart,
  initialAction, initialStatus, onConfirmed }: {
  apiRoot: string;
  purchaseId: string;
  purchaseToken: string;
  idempotencyKey: string | null | undefined;
  route: HostedRoute;
  canStart: boolean;
  initialAction?: ProviderAction;
  initialStatus?: string;
  onConfirmed: () => void;
}) {
  const [started, setStarted] = useState(() => Boolean(sessionStorage.getItem(storageKey(purchaseId))) || !canStart);
  const [result, setResult] = useState<ProviderResult | null>(null);
  const [country, setCountry] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const action = result ? result.next_action : initialAction;
  const status = result?.status ?? initialStatus;
  const link = redirectUrl(action, route);
  const provider = route.gateway === 'paypal' ? 'PayPal' : 'Checkout.com';

  async function request(operation: 'start' | 'status' | 'capture') {
    if (inFlight.current || !purchaseToken) return;
    if (operation === 'start' && (!canStart || started || !idempotencyKey
      || (route.gateway === 'checkout' && !/^[A-Z]{2}$/.test(country)))) return;
    if (operation === 'capture' && (route.gateway !== 'paypal' || action?.type !== 'paypal_capture')) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { purchase_id: purchaseId, purchase_token: purchaseToken };
      if (operation === 'start') {
        sessionStorage.setItem(storageKey(purchaseId), JSON.stringify(route));
        setStarted(true);
        Object.assign(payload, {
          idempotency_key: idempotencyKey, target_gateway: route.gateway,
          payment_method: route.gateway === 'paypal' ? 'paypal' : 'card',
        }, route.gateway === 'checkout' ? { billing_country: country } : {});
      }
      const path = operation === 'start' ? '' : operation === 'capture' ? 'paypal-capture/' : 'status/';
      const response = await fetch(`${apiRoot}/purchase-payments/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), referrerPolicy: 'no-referrer',
      });
      const body = await response.json();
      const data = body?.data as ProviderResult | undefined;
      if (!response.ok || body.success !== true) throw new Error(body?.message || 'Check the original payment status.');
      if (data?.purchase_id !== purchaseId || (data.gateway && data.gateway !== route.gateway) || !data.status) {
        throw new Error('The payment service could not verify the original payment.');
      }
      setResult(data);
      if (data.status === 'succeeded') onConfirmed();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Check the original payment status.');
      if (operation !== 'status') setResult(previous => ({ ...previous, status: 'uncertain', next_action: null }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="mt-4 space-y-3 text-sm">
    {!started && canStart && <>
      {route.gateway === 'checkout' && <label className="block">Billing country code
        <input className="payora-checkout__input" maxLength={2} placeholder="US"
          value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} aria-label="Billing country code" />
      </label>}
      <button type="button" className="payora-checkout__button" disabled={busy || (route.gateway === 'checkout' && !/^[A-Z]{2}$/.test(country))}
        onClick={() => void request('start')}>Continue with {provider}</button>
    </>}
    {link && <div>
      <a href={link} target="_blank" rel="noopener noreferrer" className="payora-checkout__button">Open {provider}</a>
      <p>After completing the payment steps, return here and check the original payment status.</p>
    </div>}
    {route.gateway === 'paypal' && action?.type === 'paypal_capture' && <button type="button"
      className="payora-checkout__button" disabled={busy} onClick={() => void request('capture')}>Confirm PayPal payment</button>}
    {started && status === 'ready' && !link && <p>No payment attempt is visible. Keep this checkout and check its status.</p>}
    {started && status && status !== 'ready' && <p role="status">Payment status · {status.replaceAll('_', ' ')}</p>}
    {error && <p role="alert">{error}</p>}
    {started && status !== 'succeeded' && <button type="button" className="payora-checkout__text-button" disabled={busy}
      onClick={() => void request('status')}>{busy ? 'Checking…' : 'Check provider status'}</button>}
  </div>;
}
