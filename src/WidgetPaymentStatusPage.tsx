import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckoutHeader, SupportId, formatCheckoutAmount } from './CheckoutUI';
import { confirmedAchRefund } from './achPaymentStatus';
import {
  exchangeWidgetStatus, isWidgetReceiptEndpoint, readWidgetReceipt, readWidgetStatus, WidgetCustomerError,
  type PrivatePaymentReceipt, type PrivatePaymentStatus,
} from './widgetCustomerService';
import './index.css';

const expiredLink = 'This private status link has expired. Please contact the merchant for a new link.';
const pending = ['processing', 'submitting', 'uncertain', 'pending', 'authorized'];
const waits = [15_000, 30_000, 60_000, 120_000];

function describePayment(payment: PrivatePaymentStatus) {
  if (payment.return_status === 'returned') return ['Your bank payment was returned', 'Contact the merchant using your payment reference.'];
  if (payment.review_required) return ['Your payment needs review', 'Contact the merchant using your payment reference.'];
  if (payment.status === 'failed' || payment.status === 'cancelled') return [payment.status === 'failed' ? 'Payment failed' : 'Payment cancelled', 'Contact the merchant for help with the next step.'];
  if (payment.receipt_available === true || (payment.payment_method !== 'ach' && payment.gateway !== 'cpacharge' && payment.status === 'succeeded')) {
    return ['Payment confirmed', 'Keep the reference below for support.'];
  }
  if (payment.status === 'uncertain' || payment.status === 'submitting') return ['We’re checking your payment', 'Please don’t pay again.'];
  if (pending.includes(payment.status)) return [
    payment.gateway === 'cpacharge' ? 'Your bank payment is processing' : 'Your payment is processing',
    payment.gateway === 'cpacharge' ? 'Bank payments can take several business days. Please don’t pay again.' : 'Please don’t pay again.',
  ];
  return ['Payment status', 'Check with the merchant for help with this payment.'];
}

function PaymentStatusPage({ initialToken }: { initialToken: string | null }) {
  const grant = useRef(initialToken);
  const session = useRef<Awaited<ReturnType<typeof exchangeWidgetStatus>> | null>(null);
  const inFlight = useRef(false);
  const pollCount = useRef(0);
  const [payment, setPayment] = useState<PrivatePaymentStatus | null>(null);
  const [receipt, setReceipt] = useState<PrivatePaymentReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(!initialToken);
  const [retryAt, setRetryAt] = useState(0);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(!document.hidden);

  const expire = useCallback(() => {
    grant.current = null;
    session.current = null;
    setExpired(true);
    setPayment(null);
    setReceipt(null);
  }, []);

  const run = useCallback(async (operation: 'status' | 'receipt' = 'status') => {
    if (inFlight.current || retryAt > Date.now()) return;
    if (session.current && session.current.expiresAt <= Date.now()) { expire(); return; }
    if (!session.current && !grant.current) { expire(); return; }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (!session.current && grant.current) {
        session.current = await exchangeWidgetStatus(grant.current);
        grant.current = null;
      }
      const activeSession = session.current;
      if (!activeSession) return;
      if (operation === 'receipt') {
        const result = await readWidgetReceipt(activeSession.token);
        if (session.current === activeSession && activeSession.expiresAt > Date.now()) setReceipt(result);
      } else {
        const result = await readWidgetStatus(activeSession.token);
        if (session.current !== activeSession || activeSession.expiresAt <= Date.now()) return;
        setReceipt(null);
        setPayment(result);
      }
    } catch (err) {
      if (err instanceof WidgetCustomerError && err.status === 404) {
        expire();
      } else if (err instanceof WidgetCustomerError && err.status === 429) {
        setRetryAt(err.retryAt);
        setError('Too many checks. Try again after the wait shown below.');
      } else if (err instanceof WidgetCustomerError && err.status === 409 && operation === 'receipt') {
        setReceipt(null);
        setPayment((value) => value ? { ...value, receipt_available: false, receipt_url: null } : value);
        setError('The receipt is no longer available. Check the latest payment status.');
      } else {
        setError(operation === 'receipt' ? 'We couldn’t load the receipt.' : 'We couldn’t check your payment status. Try again.');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [expire, retryAt]);

  useEffect(() => { if (initialToken) void run(); }, [initialToken]); // Initial exchange only.
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    let timer: number;
    const checkDeadline = () => {
      if (retryAt <= Date.now()) setRetryAt(0);
      else timer = window.setTimeout(checkDeadline, Math.min(retryAt - Date.now() + 25, 2_147_483_647));
    };
    checkDeadline();
    return () => clearTimeout(timer);
  }, [retryAt]);
  useEffect(() => {
    if (!session.current) return;
    const timer = window.setTimeout(expire, Math.max(0, session.current.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [busy, expire]);
  useEffect(() => {
    if (!visible || busy || expired || retryAt || receipt || !payment || payment.review_required
      || payment.return_status === 'returned' || payment.receipt_available || !pending.includes(payment.status)
      || pollCount.current >= waits.length) return;
    const timer = window.setTimeout(() => {
      if (document.hidden) return;
      pollCount.current += 1;
      void run();
    }, waits[pollCount.current]);
    return () => clearTimeout(timer);
  }, [visible, busy, expired, retryAt, payment, receipt, run]);

  const [title, description] = payment ? describePayment(payment) : ['Private payment status', ''];
  const showReceipt = payment?.receipt_available === true && !payment.review_required && payment.return_status !== 'returned'
    && !['failed', 'cancelled'].includes(payment.status) && isWidgetReceiptEndpoint(payment.receipt_url);
  const waiting = retryAt > Date.now();
  const reference = payment?.support_reference || payment?.transaction_id || payment?.attempt_id || payment?.purchase_id;
  const refund = confirmedAchRefund(payment);
  return <div className="payora-checkout">
    <div className="payora-checkout__container">
      <CheckoutHeader />
      <main className="payora-checkout__main" style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1 className="payora-checkout__title">{title}</h1>
        <div role="status" aria-live="polite">
          <p className="payora-checkout__description">{expired ? expiredLink : description || (busy ? 'Checking your payment…' : '')}</p>
          {payment && <dl className="payora-checkout__success-details">
            <div><dt>Merchant</dt><dd>{payment.merchant_display_name || 'Merchant'}</dd></div>
            <div><dt>Payment amount</dt><dd>{formatCheckoutAmount(payment.amount, payment.currency)} {payment.currency}</dd></div>
            {refund && <div><dt>Confirmed refund</dt><dd>{formatCheckoutAmount(refund, payment.currency)}</dd></div>}
          </dl>}
        </div>
        {reference != null && <SupportId value={String(reference)} />}
        {error && <p role="alert" className="payora-checkout__alert">{error}</p>}
        {waiting && <p>Try again after {new Date(retryAt).toLocaleTimeString()}.</p>}
        {!expired && <button className="payora-checkout__button payora-checkout__button--subtle" type="button" disabled={busy || waiting} onClick={() => void run()}>
          {busy ? 'Checking…' : 'Check payment status'}
        </button>}
        {showReceipt && !receipt && <button className="payora-checkout__text-button" type="button" disabled={busy || waiting} onClick={() => void run('receipt')}>View receipt</button>}
        {receipt && <section className="payora-checkout__success-details" aria-label="Payment receipt">
          <h2>Payment receipt</h2>
          <div><dt>Merchant</dt><dd>{receipt.merchant_display_name || payment?.merchant_display_name || 'Merchant'}</dd></div>
          <div><dt>Amount confirmed</dt><dd>{formatCheckoutAmount(receipt.amount, receipt.currency)} {receipt.currency}</dd></div>
          <div><dt>Reference</dt><dd>{receipt.support_reference || receipt.provider_reference || reference}</dd></div>
          {receipt.settlement_status && <div><dt>Settlement</dt><dd>{receipt.settlement_status.replace(/_/g, ' ')}</dd></div>}
          <p>{receipt.receipt_explanation || 'This receipt confirms the payment. Merchant bank deposit is tracked separately.'}</p>
          <button type="button" className="payora-checkout__text-button" onClick={() => window.print()}>Print receipt</button>
        </section>}
      </main>
    </div>
  </div>;
}

export function mountPaymentStatus(token: string | null) {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  createRoot(container).render(<PaymentStatusPage initialToken={token} />);
}
