import { useRef, useState, type FormEvent } from 'react';
import { CheckoutHeader, CheckoutProgress } from './CheckoutUI';
import { saveWidgetContact, WidgetCustomerError, type WidgetNotificationPreference } from './widgetCustomerService';
import type { WidgetCheckoutSession } from './widgetCheckoutService';

export function WidgetCheckoutContact({ checkout, onContinue, onRefresh }: {
  checkout: WidgetCheckoutSession;
  onContinue: (preference?: WidgetNotificationPreference) => void;
  onRefresh: () => void;
}) {
  const [email, setEmail] = useState('');
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [saved, setSaved] = useState<WidgetNotificationPreference>();
  const inFlight = useRef(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || retryAt > Date.now() || conflict) return;
    if (!email.trim() && !requested) { onContinue(); return; }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const preference = await saveWidgetContact(checkout, email.trim(), requested);
      if (preference.status_updates_requested && !preference.status_updates_enabled) {
        setSaved(preference);
      } else {
        onContinue(preference);
      }
    } catch (err) {
      if (err instanceof WidgetCustomerError && err.status === 409) {
        setConflict(true);
        setError('This payment has already started. Check the original checkout to see its current status.');
      } else if (err instanceof WidgetCustomerError && err.status === 429) {
        setRetryAt(err.retryAt);
        setError(`Please wait until ${new Date(err.retryAt).toLocaleTimeString()} before saving again.`);
      } else {
        setError('We couldn’t confirm your email preference. Try saving again or continue without changing it.');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return <div className="payora-checkout">
    <div className="payora-checkout__container">
      <CheckoutHeader />
      <CheckoutProgress active={2} />
      <section className="payora-checkout__main" style={{ maxWidth: 620, margin: '0 auto' }}>
        <h1 className="payora-checkout__title">Payment updates</h1>
        <p className="payora-checkout__description">{checkout.customerNotifications?.status_updates_enabled === true
          ? 'Email updates are already enabled for this checkout.' : 'Choose whether to receive updates for this payment.'}</p>
        {error && <p className="payora-checkout__alert" role="alert">{error}</p>}
        {saved ? <>
          <p role="status">Your preference was saved. Email updates are unavailable for this checkout.</p>
          <button type="button" className="payora-checkout__button" onClick={() => onContinue(saved)}>Continue to payment</button>
        </> : conflict ? <button type="button" className="payora-checkout__button" onClick={onRefresh}>Check payment status</button>
          : <form onSubmit={save}>
            <label className="payora-checkout__field">Email address
              <input className="payora-checkout__input" type="email" autoComplete="email" maxLength={254} required={requested}
                value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
            </label>
            <label className="payora-ach__consent"><input type="checkbox" checked={requested} disabled={busy}
              onChange={(event) => setRequested(event.target.checked)} /> Email me payment status updates</label>
            <button type="submit" className="payora-checkout__button" disabled={busy}>{busy ? 'Saving…' : 'Continue to payment'}</button>
            <button type="button" className="payora-checkout__text-button" disabled={busy} onClick={() => onContinue()}>Continue without changes</button>
          </form>}
      </section>
    </div>
  </div>;
}

export function WidgetEmailOptOut({ checkout, onUpdated }: {
  checkout: WidgetCheckoutSession;
  onUpdated: (preference: WidgetNotificationPreference) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const enabled = checkout.payment?.customer_notifications ?? checkout.customerNotifications;
  if (!checkout.purchaseToken || enabled?.status_updates_requested !== true) return message ? <p role="status">{message}</p> : null;
  const optOut = async () => {
    if (busy || retryAt > Date.now()) return;
    setBusy(true);
    try {
      onUpdated(await saveWidgetContact(checkout, '', false));
      setMessage('Email updates are off for this payment.');
    } catch (err) {
      if (err instanceof WidgetCustomerError && err.status === 429) {
        setRetryAt(err.retryAt);
        setMessage(`Please wait until ${new Date(err.retryAt).toLocaleTimeString()} before trying again.`);
      } else {
        setMessage('We couldn’t confirm the change. Contact the merchant if your checkout access has expired.');
      }
    } finally { setBusy(false); }
  };
  return <div>
    {enabled.status_updates_enabled === true && <p>We’ll email you when your payment status changes.</p>}
    <button type="button" className="payora-checkout__text-button" disabled={busy} onClick={() => void optOut()}>Stop email updates</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
