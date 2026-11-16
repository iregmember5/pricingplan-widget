import React, { useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, CreditCard, LockKeyhole, RefreshCw, ShieldCheck, X } from 'lucide-react';

export function formatCheckoutAmount(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
  catch { return `${amount} ${currency}`; }
}

export function CheckoutHeader() {
  return (
    <header className="payora-checkout__header">
      <div className="payora-checkout__brand">
        <div className="payora-checkout__brand-mark"><LockKeyhole size={19} strokeWidth={2.1} /></div>
        <div>
          <div className="payora-checkout__brand-title">Secure checkout</div>
          <div className="payora-checkout__brand-caption">A protected payment experience</div>
        </div>
      </div>
      <div className="payora-checkout__secure-label"><ShieldCheck size={15} /> Secure connection</div>
    </header>
  );
}

export function CheckoutProgress({ active }: { active: 1 | 2 | 3 }) {
  const steps = ['Review', 'Payment', 'Confirmation'] as const;
  return (
    <div className="payora-checkout__progress" aria-label={`Checkout step ${active} of 3`}>
      {steps.map((label, index) => {
        const number = index + 1;
        const current = number === active;
        const complete = number < active;
        return (
          <React.Fragment key={label}>
            {index > 0 && <div className="payora-checkout__progress-line" />}
            <div className={`payora-checkout__progress-step${current ? ' is-active' : ''}`} aria-current={current ? 'step' : undefined}>
              <span className="payora-checkout__progress-dot">{complete ? <Check size={12} /> : number}</span>
              <span>{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function CheckoutUnavailableModal({
  message,
  supportEmail,
  planName,
  paymentMayHaveBeenSubmitted = false,
  onClose,
  onRetry,
  loading = false,
}: {
  message: string;
  supportEmail?: string;
  planName?: string;
  paymentMayHaveBeenSubmitted?: boolean;
  onClose: () => void;
  onRetry: () => void;
  loading?: boolean;
}) {
  const [failedRetries, setFailedRetries] = useState(0);
  const wasLoading = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const errorCode = message.match(/\b(5\d\d|4\d\d)\b/)?.[1] || '503';
  const safePlanName = planName?.trim() || 'Selected plan';
  const mailSubject = `Checkout support: ${safePlanName} (Error ${errorCode})`;
  const mailBody = `Please help me with checkout for ${safePlanName}. Error code: ${errorCode}. I have not included any card details.`;
  const supportHref = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`
    : `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;

  React.useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    retryRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  React.useEffect(() => {
    if (loading) {
      wasLoading.current = true;
    } else if (wasLoading.current) {
      wasLoading.current = false;
      // The modal remains mounted only when the retry did not resolve checkout.
      setFailedRetries((count) => count + 1);
    }
  }, [loading]);

  return (
    <div className="payora-checkout-modal__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="payora-checkout-modal" role="alertdialog" aria-modal="true" aria-labelledby="checkout-unavailable-title" aria-describedby="checkout-unavailable-message">
        <button className="payora-checkout-modal__close" type="button" onClick={onClose} aria-label="Close message"><X size={19} /></button>
        <div className="payora-checkout-modal__icon"><AlertCircle size={24} /></div>
        <h2 id="checkout-unavailable-title">We couldn’t start checkout</h2>
        <p id="checkout-unavailable-message">
          {paymentMayHaveBeenSubmitted
            ? 'We couldn’t confirm your payment. Check its status before trying again.'
            : failedRetries >= 2
              ? <><strong>You haven’t been charged.</strong><br />Please contact support to continue.</>
              : <><strong>You haven’t been charged.</strong><br />Please try again, or contact support if this keeps happening.</>}
        </p>
        <div className="payora-checkout-modal__actions">
          <a className="payora-checkout-modal__secondary" href={supportHref}>Contact support</a>
          <button ref={retryRef} type="button" className="payora-checkout-modal__retry" onClick={onRetry} disabled={loading}>
            {loading ? <><span className="payora-checkout__spinner" /> Retrying…</> : <><RefreshCw size={15} /> Try again</>}
          </button>
        </div>
        <div className="payora-checkout-modal__code">Error code: {errorCode}</div>
      </section>
    </div>
  );
}

type OrderSummaryProps = {
  planName: string;
  amount?: string;
  planAmount?: string;
  unitAmount?: string;
  currency?: string;
  quantity?: number;
  features?: string[];
  billingText?: string;
  savingsText?: string;
  supportEmail?: string;
  onChangePlan?: () => void;
  priceError?: string;
  onRetryPrice?: () => void;
  taxAmount?: string;
  discountAmount?: string;
  onApplyPromo?: (code: string) => void;
};

export function OrderSummary({
  planName, amount, planAmount, unitAmount, currency = 'USD', quantity = 1, features = [], billingText, savingsText, supportEmail,
  onChangePlan, priceError, onRetryPrice, taxAmount, discountAmount, onApplyPromo,
}: OrderSummaryProps) {
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const shownAmount = amount || planAmount;
  const hasPrice = Boolean(shownAmount && currency);
  const priceConfirmed = Boolean(amount);
  const fallbackFeatures = features.length ? features.slice(0, 3) : [
    'Secure card payment',
    'Payment status tracking',
    'Access after payment confirmation',
  ];
  const planLine = unitAmount
    ? formatCheckoutAmount((Number(unitAmount) * quantity).toFixed(2), currency)
    : planAmount ? formatCheckoutAmount(planAmount, currency) : amount && quantity === 1 ? formatCheckoutAmount(amount, currency) : null;

  return (
    <aside className="payora-checkout__summary">
      <div className="payora-checkout__summary-label">Order summary</div>
      <div className="payora-checkout__summary-plan">
        <div className="payora-checkout__summary-plan-heading">
          <div>
            <div className="payora-checkout__summary-plan-name">{planName || 'Selected plan'}</div>
            <div className="payora-checkout__summary-plan-meta">{billingText || `One-time payment · Quantity ${quantity}`}</div>
            {savingsText && <div className="payora-checkout__summary-savings">{savingsText}</div>}
          </div>
          {onChangePlan && <button type="button" className="payora-checkout__change-plan" onClick={onChangePlan}>Change plan</button>}
        </div>
        <ul className="payora-checkout__plan-features">
          {fallbackFeatures.map((feature, index) => <li key={`${feature}-${index}`}>{feature}</li>)}
        </ul>
      </div>
      <div className="payora-checkout__summary-total" aria-live="polite">
        <div className="payora-checkout__summary-total-label">Total due</div>
        {hasPrice
          ? <div className="payora-checkout__summary-total-value">{formatCheckoutAmount(shownAmount!, currency)}</div>
          : priceError
            ? <div className="payora-checkout__price-error" role="alert">{priceError}{onRetryPrice && <button type="button" onClick={onRetryPrice}>Retry price</button>}</div>
            : <div className="payora-checkout__price-skeleton" role="status" aria-label="Loading total" />}
        <p className="payora-checkout__summary-note">{priceConfirmed ? 'Final amount confirmed by the payment service.' : hasPrice ? 'Published plan price; final total confirmed before payment.' : 'Confirming the published offer price…'}</p>
      </div>
      <div className="payora-checkout__line-items" aria-label="Price breakdown">
        <div><span>Plan price{quantity > 1 ? ` × ${quantity}` : ''}</span><strong>{planLine || (hasPrice ? formatCheckoutAmount(shownAmount!, currency) : 'Calculated at next step')}</strong></div>
        <div><span>Tax</span><strong>{taxAmount ? formatCheckoutAmount(taxAmount, currency) : priceConfirmed ? 'Included in total' : 'Calculated at next step'}</strong></div>
        <div><span>Discount</span><strong>{discountAmount ? `−${formatCheckoutAmount(discountAmount, currency)}` : priceConfirmed ? '$0.00' : 'Calculated at next step'}</strong></div>
        <div className="payora-checkout__line-total"><span>Total</span><strong>{hasPrice ? formatCheckoutAmount(shownAmount!, currency) : 'Calculated at next step'}</strong></div>
      </div>
      <div className="payora-checkout__refund-support">
        <div>30-day refund requests</div>
        <div>{supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : 'Contact the merchant for support'}</div>
      </div>
      <div className="payora-checkout__promo">
        <button type="button" className="payora-checkout__promo-toggle" aria-expanded={promoOpen} onClick={() => setPromoOpen((open) => !open)}>
          Have a promo code? <ChevronDown size={15} className={promoOpen ? 'is-open' : ''} />
        </button>
        {promoOpen && <form className="payora-checkout__promo-form" onSubmit={(event) => { event.preventDefault(); if (promoCode.trim()) onApplyPromo?.(promoCode.trim()); }}>
          <label className="payora-checkout__sr-only" htmlFor="payora-promo-code">Promo code</label>
          <input id="payora-promo-code" value={promoCode} onChange={(event) => setPromoCode(event.target.value)} placeholder="Enter code" disabled={!onApplyPromo} />
          <button type="submit" disabled={!onApplyPromo || !promoCode.trim()}>Apply</button>
          {!onApplyPromo && <span>Promo codes are not available for this offer.</span>}
        </form>}
      </div>
      <div className="payora-checkout__summary-powered"><CreditCard size={16} /> Powered by Stripe</div>
      <div className="payora-checkout__summary-trust"><ShieldCheck size={15} /> Card details are securely processed by Stripe.</div>
    </aside>
  );
}
