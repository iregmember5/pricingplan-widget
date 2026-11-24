import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { BillingEmailField, CheckoutHeader, CheckoutProgress, CheckoutUnavailableModal, OrderSummary, SupportId, formatCheckoutAmount } from './CheckoutUI';
import { StripeIntegration } from './StripeIntegration';
import { StripeProvider } from './StripeProvider';
import {
  getOrCreateWidgetCheckout,
  getWidgetCheckoutStatus,
  startNewWidgetCheckout,
  WidgetCheckoutRequestError,
  type WidgetCheckoutIdentity,
  type WidgetCheckoutSession,
  type WidgetKind,
} from './widgetCheckoutService';
import { VaultCollectionFlow } from './VaultCollectionFlow';
import { CpachargeAchFlow } from './CpachargeAchFlow';
import { supportsCpachargeAch } from './cpachargeAchService';
import { ServicePaymentPlanFlow } from './ServicePaymentPlanFlow';

interface PaymentFlowProps {
  widgetId: string;
  widgetIds?: string[];
  widgetKind?: WidgetKind;
  planId: string;
  planName?: string;
  planFeatures?: string[];
  billingText?: string;
  savingsText?: string;
  supportEmail?: string;
  amount?: string;
  currency?: string;
  paymentType?: string;
  targetGateway?: string;
  trialDays?: number;
  prorationBehavior?: string;
  useNewPaymentApi?: boolean;
  paymentMethod?: 'stripe_direct' | 'vault';
  onBack: () => void;
}

function hasStripeCollection(session: WidgetCheckoutSession) {
  return session.collection?.provider === 'stripe'
    && session.collection.payment_method === 'card'
    && /^pk_(test|live)_[A-Za-z0-9]+$/.test(session.collection.publishable_key || '');
}

function hasVaultCollectionFlow(session: WidgetCheckoutSession) {
  return session.collection?.flow === 'vault_to_stripe'
    && session.collection.provider === 'vgs';
}

function hasCpachargeAchFlow(session: WidgetCheckoutSession) {
  return supportsCpachargeAch(session);
}

function canStartStripePayment(session: WidgetCheckoutSession) {
  return session.status === 'ready'
    && session.canSubmit
    && hasStripeCollection(session)
    && ['USD', 'CAD'].includes(session.currency);
}

function statusMessage(status: string) {
  switch (status) {
    case 'submitting': return 'Your payment is being submitted. You do not need to pay again.';
    case 'processing': return 'Your payment is processing. Check its status before taking another action.';
    case 'uncertain': return 'We are checking the original payment. Please do not submit another payment.';
    case 'requires_action': return 'Your bank needs you to approve this payment.';
    case 'failed': return 'This payment did not complete. Keep this reference for support.';
    case 'cancelled': return 'This payment was cancelled. Keep this reference for support.';
    case 'ready': return 'This checkout is not currently accepting payment. No payment was submitted. Contact the merchant.';
    case 'expired': return 'Your checkout expired. Start a new checkout to continue.';
    case 'offer_changed': return 'The offer changed after this checkout was created. Contact the merchant before starting another checkout.';
    case 'offer_unavailable': return 'This offer cannot accept payment right now. Contact the merchant for help.';
    default: return 'Payment is not confirmed yet. Check the original checkout status before trying again.';
  }
}

export const PaymentFlow: React.FC<PaymentFlowProps> = ({
  widgetId,
  widgetKind = 'legacy',
  planId,
  planName = '',
  planFeatures = [],
  billingText,
  savingsText,
  supportEmail,
  amount,
  currency = 'USD',
  paymentType = 'one_time',
  onBack,
}) => {
  const [step, setStep] = useState<'methods' | 'stripe' | 'vault' | 'ach' | 'status' | 'success' | 'plan'>('methods');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState<WidgetCheckoutIdentity | null>(null);
  const [checkout, setCheckout] = useState<WidgetCheckoutSession | null>(null);
  const [blockedReason, setBlockedReason] = useState('');
  const [priceTimedOut, setPriceTimedOut] = useState(false);
  const [retryCreationRequired, setRetryCreationRequired] = useState(false);
  const [restartIdentity, setRestartIdentity] = useState<WidgetCheckoutIdentity | null>(null);
  const [restartRejected, setRestartRejected] = useState(false);
  const [unavailableModalOpen, setUnavailableModalOpen] = useState(false);
  const [confirmedReference, setConfirmedReference] = useState('');
  const starting = useRef(false);
  const displayPlanName = checkout?.planName || planName || 'Selected plan';
  const displayPlanPrice = amount ? formatCheckoutAmount(amount, currency) : '';
  const continuePriceLabel = displayPlanPrice ? `${displayPlanPrice}${billingText ? ` · ${billingText}` : ''}` : '';
  const serviceUnavailable = /temporarily unavailable|HTTP 503/i.test(error);
  const paymentMayHaveBeenSubmitted = Boolean(checkout && (
    checkout.attemptId || checkout.payment || ['submitting', 'processing', 'uncertain', 'requires_action', 'succeeded'].includes(checkout.status)
  ));

  useEffect(() => {
    if (!loading || checkout?.amount || amount) return undefined;
    const timeout = window.setTimeout(() => {
      setPriceTimedOut(true);
      setError('The payment service is taking longer than expected to confirm this price. Retry to check the same checkout.');
      setLoading(false);
      starting.current = false;
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [loading, checkout?.amount, amount]);

  const openSession = (nextIdentity: WidgetCheckoutIdentity, session: WidgetCheckoutSession) => {
    setIdentity(nextIdentity);
    setCheckout(session);
    setError('');
    setPriceTimedOut(false);
    setUnavailableModalOpen(false);

    if (session.status === 'expired') {
      setBlockedReason(session.attemptId || session.payment
        ? 'This checkout expired after a payment attempt. Check the original payment status before starting another checkout.'
        : statusMessage('expired'));
      setStep('status');
      return;
    }

    if (session.servicePaymentPlan?.status === 'plan_required') {
      setBlockedReason('');
      setStep('plan');
      return;
    }

    if (session.status === 'succeeded' && (!hasCpachargeAchFlow(session) || session.payment?.receipt_available === true)) {
      setConfirmedReference(session.attemptId || session.purchaseId);
      setStep('success');
      return;
    }

    if (session.status !== 'ready') {
      setBlockedReason('');
      setStep(hasCpachargeAchFlow(session) ? 'ach' : hasVaultCollectionFlow(session) ? 'vault' : hasStripeCollection(session) ? 'stripe' : 'status');
      return;
    }

    if (hasCpachargeAchFlow(session)) {
      if (!session.canSubmit || !session.purchaseToken || !session.idempotencyKey) {
        setBlockedReason('This checkout is not authorized for bank payment. No debit was submitted. Contact the merchant.');
        setStep('status');
        return;
      }
      setBlockedReason('');
      setStep('ach');
      return;
    }

    if (hasVaultCollectionFlow(session)) {
      if (!session.canSubmit || !session.purchaseToken || !session.idempotencyKey) {
        setBlockedReason('This checkout is not authorized to prepare a card. No payment was submitted. Contact the merchant.');
        setStep('status');
        return;
      }
      setBlockedReason('');
      setStep('vault');
      return;
    }

    if (!canStartStripePayment(session)) {
      setBlockedReason(session.canSubmit
        ? 'A supported payment method is not configured for this checkout. No payment was submitted. Contact the merchant.'
        : statusMessage(session.status));
      setStep('status');
      return;
    }

    setBlockedReason('');
    setStep('stripe');
  };

  const beginCheckout = async () => {
    if (starting.current || loading) return;
    if (!['one_time', 'payment', 'ach'].includes(paymentType.trim().toLowerCase())) {
      setError('This checkout currently supports one-time payments only.');
      return;
    }
    if (!widgetId?.trim() || !planId?.trim()) {
      setError('The published widget or plan ID is missing.');
      return;
    }
    if (widgetId.trim() === 'mock-new-pricing') {
      setError('This sample preview cannot start a real checkout. Open a published widget to test payments.');
      return;
    }

    starting.current = true;
    setPriceTimedOut(false);
    setLoading(true);
    setError('');
    try {
      const result = await getOrCreateWidgetCheckout({
        widgetKind,
        widgetId: widgetId.trim(),
        planId: planId.trim(),
        quantity: 1,
      });
      setRetryCreationRequired(false);
      openSession(result.identity, result.session);
    } catch (err: any) {
      const message = err?.message || 'Checkout could not be created or recovered. Keep this page open and do not start another checkout.';
      setError(message);
      if (err instanceof WidgetCheckoutRequestError && err.phase === 'create') setRetryCreationRequired(true);
      if (err instanceof WidgetCheckoutRequestError && err.phase === 'status') setRetryCreationRequired(false);
      if (/temporarily unavailable|HTTP 503/i.test(message)) setUnavailableModalOpen(true);
    } finally {
      starting.current = false;
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!identity || loading) return;
    setLoading(true);
    setError('');
    try {
      const updated = await getWidgetCheckoutStatus(identity);
      setUnavailableModalOpen(false);
      setCheckout(updated);
      if (updated.status === 'expired') {
        setBlockedReason(updated.attemptId || updated.payment
          ? 'This checkout expired after a payment attempt. Check the original payment status before starting another checkout.'
          : statusMessage('expired'));
        setStep('status');
      } else if (updated.servicePaymentPlan?.status === 'plan_required') {
        setBlockedReason('');
        setStep('plan');
      } else if (updated.status === 'succeeded' && (!hasCpachargeAchFlow(updated) || updated.payment?.receipt_available === true)) {
        setConfirmedReference(updated.attemptId || updated.purchaseId);
        setStep('success');
      } else if (hasCpachargeAchFlow(updated)) {
        setBlockedReason('');
        setStep('ach');
      } else if (hasVaultCollectionFlow(updated)) {
        setBlockedReason('');
        setStep('vault');
      } else if (updated.status !== 'ready' && hasStripeCollection(updated)) {
        setBlockedReason('');
        setStep('stripe');
      } else if (canStartStripePayment(updated)) {
        setBlockedReason('');
        setStep('stripe');
      } else if (hasVaultCollectionFlow(updated) && updated.status === 'ready' && updated.canSubmit) {
        setBlockedReason('');
        setStep('vault');
      } else {
        setBlockedReason(updated.status === 'ready' && !updated.canSubmit
          ? statusMessage(updated.status)
          : 'A supported payment method is not configured for this checkout. No payment was submitted. Contact the merchant.');
      }
    } catch (err: any) {
      const message = err?.message || 'We could not confirm the original checkout status. Do not create another checkout.';
      setError(message);
      if (/temporarily unavailable|HTTP 503/i.test(message)) setUnavailableModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const startAgain = async () => {
    if (starting.current || loading || !identity || !checkout) return;
    if (checkout.status !== 'expired' || checkout.attemptId || checkout.payment
      || ['submitting', 'processing', 'uncertain', 'requires_action', 'succeeded'].includes(checkout.status)) {
      setError('We’re still checking the previous payment. Refresh its status before starting another checkout.');
      return;
    }
    starting.current = true;
    setLoading(true);
    setError('');
    setUnavailableModalOpen(false);
    try {
      const result = await startNewWidgetCheckout({
        widgetKind: identity.widgetKind,
        widgetId: identity.widgetId,
        planId: identity.planId,
        quantity: identity.quantity,
        expiredIdentity: identity,
        expiredSession: checkout,
        pendingIdentity: restartIdentity,
      });
      setRestartIdentity(null);
      setRestartRejected(false);
      setRetryCreationRequired(false);
      openSession(result.identity, result.session);
    } catch (err: any) {
      if (err instanceof WidgetCheckoutRequestError) {
        if (err.httpStatus === 400 || err.httpStatus === 422) {
          setRestartIdentity(null);
          setRestartRejected(true);
        } else {
          setRestartIdentity(err.identity);
        }
      }
      const message = err?.message || 'We could not start your new checkout. Retry to safely recover the same request.';
      setError(message);
      if (/temporarily unavailable|HTTP 503/i.test(message)) setUnavailableModalOpen(true);
    } finally {
      starting.current = false;
      setLoading(false);
    }
  };

  if (checkout && identity && step === 'plan') {
    return <ServicePaymentPlanFlow identity={identity} checkout={checkout} buyerEmail={email} onBack={() => setStep('methods')} />;
  }

  if (step === 'success') {
    return (
      <div className="payora-checkout">
        <div className="payora-checkout__container">
          <CheckoutHeader />
          <CheckoutProgress active={3} />
          <div className="payora-checkout__grid payora-checkout__success-grid">
            <section className="payora-checkout__main payora-checkout__success-card">
              <div className="payora-checkout__success-mark"><CheckCircle2 size={29} /></div>
              <div className="payora-checkout__eyebrow">Payment complete</div>
              <h1 className="payora-checkout__title">Payment confirmed</h1>
              <p className="payora-checkout__description">Your payment for {displayPlanName} was confirmed securely. Keep the reference below for support.</p>
              <dl className="payora-checkout__success-details">
                <div><dt>Plan</dt><dd>{displayPlanName}</dd></div>
                <div><dt>Amount confirmed</dt><dd>{formatCheckoutAmount(checkout?.amount || amount || '0.00', checkout?.currency || currency)}</dd></div>
                {billingText && <div><dt>Billing</dt><dd>{billingText}</dd></div>}
              </dl>
              {(checkout?.purchaseId || confirmedReference) && <SupportId value={checkout?.purchaseId || confirmedReference} />}
              <button className="payora-checkout__button payora-checkout__button--subtle payora-checkout__success-return" type="button" onClick={onBack}>
                Return to plans <ArrowRight size={16} />
              </button>
            </section>
            <OrderSummary planName={displayPlanName} features={planFeatures} amount={checkout?.amount} planAmount={amount} currency={checkout?.currency || currency} unitAmount={checkout?.unitAmount} quantity={checkout?.quantity} billingText={billingText} savingsText={savingsText} supportEmail={supportEmail} />
          </div>
          <div className="payora-checkout__footer">Your confirmation is based on the payment service’s verified status.</div>
        </div>
      </div>
    );
  }

  if (checkout && identity && step === 'vault') {
    return (
      <VaultCollectionFlow
        identity={identity}
        checkout={checkout}
        planFeatures={planFeatures}
        billingText={billingText}
        savingsText={savingsText}
        supportEmail={supportEmail}
        onSuccess={(reference, updatedCheckout) => {
          setCheckout(updatedCheckout);
          setConfirmedReference(reference);
          setStep('success');
        }}
        onCheckoutUpdate={setCheckout}
        onBack={() => setStep('methods')}
        onChangePlan={onBack}
      />
    );
  }

  if (checkout && identity && step === 'ach') {
    return (
      <CpachargeAchFlow
        identity={identity}
        checkout={checkout}
        planFeatures={planFeatures}
        billingText={billingText}
        savingsText={savingsText}
        supportEmail={supportEmail}
        onCheckoutUpdate={setCheckout}
        onSuccess={(reference, updatedCheckout) => {
          setCheckout(updatedCheckout);
          setConfirmedReference(reference);
          setStep('success');
        }}
        onBack={() => setStep('methods')}
        onChangePlan={onBack}
      />
    );
  }

  if (checkout && identity && step === 'stripe' && checkout.collection) {
    return (
      <StripeProvider publishableKey={checkout.collection.publishable_key} stripeAccount={checkout.collection.stripe_account}>
        <StripeIntegration
          identity={identity}
          checkout={checkout}
          planFeatures={planFeatures}
          billingText={billingText}
          savingsText={savingsText}
          supportEmail={supportEmail}
          customerEmail={email}
          onSuccess={(reference) => {
            setConfirmedReference(reference);
            setStep('success');
          }}
          onBack={() => setStep('methods')}
          onChangePlan={onBack}
        />
      </StripeProvider>
    );
  }

  if (checkout && identity && step === 'status') {
    return (
      <div className="payora-checkout">
        <div className="payora-checkout__container">
          <CheckoutHeader />
          <CheckoutProgress active={2} />
          <div className="payora-checkout__grid">
            <section className="payora-checkout__main">
              <button className="payora-checkout__back" onClick={onBack}><ArrowLeft size={15} /> Back to plans</button>
              <div className="payora-checkout__eyebrow">Checkout update</div>
              <h1 className="payora-checkout__title">{checkout.status === 'expired' ? 'Checkout expired' : 'We’re checking your payment'}</h1>
              <p className="payora-checkout__description">{blockedReason || statusMessage(checkout.status)}</p>
              {error && (!serviceUnavailable || paymentMayHaveBeenSubmitted) && <div className="payora-checkout__alert" role="alert">{error}</div>}
              <SupportId value={checkout.purchaseId} />
              {checkout.status === 'expired' && !checkout.attemptId && !checkout.payment ? (
                restartRejected ? (
                  <button className="payora-checkout__button" type="button" onClick={onBack}>
                    Review your plan <ArrowRight size={17} />
                  </button>
                ) : (
                  <button className="payora-checkout__button" type="button" onClick={startAgain} disabled={loading}>
                    {loading ? <><span className="payora-checkout__spinner" /> Starting a new checkout…</> : <>{restartIdentity ? 'Retry starting checkout' : 'Start again'} <ArrowRight size={17} /></>}
                  </button>
                )
              ) : (
                <button className="payora-checkout__text-button payora-checkout__refresh-link" onClick={checkStatus} disabled={loading}>
                  {loading ? 'Refreshing payment status…' : 'Having trouble? Refresh payment status'}
                </button>
              )}
              <p className="payora-checkout__footer">{checkout.status === 'expired' && !checkout.attemptId && !checkout.payment
                ? 'Your previous checkout remains saved for reference. Starting again creates a new secure checkout at the current price and payment settings.'
                : 'Keep this page open while we verify the original payment. Do not start another payment until its status is confirmed.'}</p>
            </section>
            <OrderSummary planName={displayPlanName} features={planFeatures} amount={checkout.amount} currency={checkout.currency} unitAmount={checkout.unitAmount} quantity={checkout.quantity} billingText={billingText} savingsText={savingsText} supportEmail={supportEmail} onChangePlan={onBack} />
          </div>
        </div>
        {(serviceUnavailable || unavailableModalOpen) && <CheckoutUnavailableModal message={error} supportEmail={supportEmail} planName={displayPlanName} paymentMayHaveBeenSubmitted={paymentMayHaveBeenSubmitted} onClose={() => { setUnavailableModalOpen(false); setError(''); }} onRetry={checkout.status === 'expired' && !checkout.attemptId && !checkout.payment ? startAgain : checkStatus} loading={loading} />}
      </div>
    );
  }

  return (
    <div className="payora-checkout">
      <div className="payora-checkout__container">
        <CheckoutHeader />
        <CheckoutProgress active={1} />
        <div className="payora-checkout__grid">
          <section className="payora-checkout__main">
            <button className="payora-checkout__back" onClick={onBack}><ArrowLeft size={15} /> Back to plans</button>
            <div className="payora-checkout__eyebrow">Your payment, protected</div>
            <h1 className="payora-checkout__title">Complete your purchase</h1>
            <p className="payora-checkout__description">Review your plan and total, and add a billing email if you’d like a payment update.</p>
            <BillingEmailField value={email} onChange={setEmail} />
            {error && !serviceUnavailable && <div className="payora-checkout__alert" role="alert">{error}</div>}
            <button className="payora-checkout__button" type="button" onClick={() => beginCheckout()} disabled={loading || priceTimedOut || unavailableModalOpen}>
              {loading ? <><span className="payora-checkout__spinner" /> Preparing your secure checkout…</> : <>{retryCreationRequired ? 'Retry secure checkout' : 'Continue'}{continuePriceLabel ? ` · ${continuePriceLabel}` : ' to payment'} <ArrowRight size={17} /></>}
            </button>
            {priceTimedOut && <button className="payora-checkout__button payora-checkout__button--subtle" type="button" onClick={() => beginCheckout()} disabled={loading} style={{ marginTop: 10 }}>Retry secure checkout</button>}
            <div className="payora-checkout__trust">
              <span className="payora-checkout__trust-item"><LockKeyhole size={14} /> Secure card entry</span>
              <span className="payora-checkout__trust-item"><ShieldCheck size={14} /> No payment on this step</span>
            </div>
          </section>
          <OrderSummary planName={displayPlanName} features={planFeatures} planAmount={amount} currency={currency} billingText={billingText} savingsText={savingsText} supportEmail={supportEmail} priceError={priceTimedOut ? 'Price confirmation timed out.' : undefined} onRetryPrice={priceTimedOut ? () => beginCheckout() : undefined} onChangePlan={onBack} />
        </div>
        <div className="payora-checkout__footer">Your exact total is confirmed from the published plan before you submit payment.</div>
      </div>
      {(serviceUnavailable || unavailableModalOpen) && <CheckoutUnavailableModal message={error} supportEmail={supportEmail} planName={displayPlanName} onClose={() => { setUnavailableModalOpen(false); setError(''); }} onRetry={() => beginCheckout()} loading={loading} />}
    </div>
  );
};
