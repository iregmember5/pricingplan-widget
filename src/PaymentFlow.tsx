import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { BillingEmailField, CheckoutHeader, CheckoutProgress, CheckoutUnavailableModal, OrderSummary, SupportId, formatCheckoutAmount } from './CheckoutUI';
import { StripeIntegration } from './StripeIntegration';
import { StripeProvider } from './StripeProvider';
import {
  getOrCreateWidgetCheckout,
  getWidgetCheckoutStatus,
  startNewWidgetCheckout,
  getSavedPayWhatYouWantIntent,
  clearConfirmedPayWhatYouWantIntent,
  clearTerminalPayWhatYouWantIntent,
  WidgetCheckoutRequestError,
  type WidgetCheckoutIdentity,
  type WidgetCheckoutSession,
  type WidgetKind,
} from './widgetCheckoutService';
import { VaultCollectionFlow } from './VaultCollectionFlow';
import { CpachargeAchFlow } from './CpachargeAchFlow';
import { supportsCpachargeAch } from './cpachargeAchService';
import { confirmedAchRefund, hasAchReceipt } from './achPaymentStatus';
import { ServicePaymentPlanFlow } from './ServicePaymentPlanFlow';
import { WidgetCheckoutContact, WidgetEmailOptOut } from './WidgetCheckoutContact';

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
  payWhatYouWant?: {
    businessName?: string; logoUrl?: string; title?: string; description?: string;
    currency?: string; suggestedAmount?: string; supportEmail?: string;
    themeMode?: 'light' | 'dark';
    currencyMinorDigits?: number;
    minimumAmount?: string | null; maximumAmount?: string | null;
    collectReferenceId?: boolean; collectComments?: boolean;
    buttonLabel?: string; buttonColor?: string;
  };
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
  const config = session.collection;
  if (!config) return false;
  const providerReady = config.provider === 'vgs'
    || config.provider === 'basis_theory' && ['sandbox', 'live'].includes(config.environment || '');
  if (!providerReady) return false;
  return config.flow === 'vault_to_moov'
    ? config.gateway === 'moov'
    : config.flow === 'vault_to_stripe' && (config.gateway === undefined || config.gateway === 'stripe');
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
    case 'offer_changed': return 'The merchant updated this payment page after the checkout was created. Review the latest details before continuing.';
    case 'offer_unavailable': return 'This offer cannot accept payment right now. Contact the merchant for help.';
    default: return 'Payment is not confirmed yet. Check the original checkout status before trying again.';
  }
}

function isEmbedMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('embed') === 'true' || params.get('embed') === '1' || window.location.pathname.startsWith('/embed/');
}

function getEmbedOrigin() {
  if (!isEmbedMode()) return '';
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('origin');
  const candidate = requested || document.referrer;
  try {
    const parsed = new URL(candidate || '');
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== candidate && requested) return '';
    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) return '';
    return parsed.origin;
  } catch { return ''; }
}

function matchesCurrencyPrecision(value: string, minorDigits: number) {
  return (minorDigits > 0 ? new RegExp(`^\\d+(?:\\.\\d{1,${minorDigits}})?$`) : /^\d+$/).test(value);
}

function postEmbedMessage(type: 'payment_processing' | 'payment_ready' | 'payment_succeeded') {
  if (window.parent === window || !isEmbedMode() || !document.referrer) return;
  try {
    window.parent.postMessage({ type }, new URL(document.referrer).origin);
  } catch {
    // Ignore malformed referrers; the embed loader validates origin and source.
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
  payWhatYouWant,
  onBack,
}) => {
  const savedPwywIntent = payWhatYouWant ? getSavedPayWhatYouWantIntent(widgetId) : null;
  const [step, setStep] = useState<'methods' | 'contact' | 'stripe' | 'vault' | 'ach' | 'status' | 'success' | 'plan'>('methods');
  const [email, setEmail] = useState('');
  const [customerAmount, setCustomerAmount] = useState(savedPwywIntent?.amount || amount || '');
  const [referenceId, setReferenceId] = useState(savedPwywIntent?.referenceId || '');
  const [comments, setComments] = useState(savedPwywIntent?.comments || '');
  const [pwywIntentLocked, setPwywIntentLocked] = useState(Boolean(savedPwywIntent?.locked));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pwywFieldErrors, setPwywFieldErrors] = useState<Record<string, string>>({});
  const [identity, setIdentity] = useState<WidgetCheckoutIdentity | null>(null);
  const [checkout, setCheckout] = useState<WidgetCheckoutSession | null>(null);
  const [blockedReason, setBlockedReason] = useState('');
  const [priceTimedOut, setPriceTimedOut] = useState(false);
  const [retryCreationRequired, setRetryCreationRequired] = useState(false);
  const [restartIdentity, setRestartIdentity] = useState<WidgetCheckoutIdentity | null>(null);
  const [restartRejected, setRestartRejected] = useState(false);

  useEffect(() => {
    if (step !== 'success' || !payWhatYouWant) return;
    postEmbedMessage('payment_succeeded');
    if (identity) clearConfirmedPayWhatYouWantIntent(identity);
  }, [step, payWhatYouWant, identity]);
  const [unavailableModalOpen, setUnavailableModalOpen] = useState(false);
  const [confirmedReference, setConfirmedReference] = useState('');
  const starting = useRef(false);
  const contactPassed = useRef<string | null>(null);
  const autoPwywRecoveryStarted = useRef(false);
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

    if (session.status === 'offer_changed' || session.status === 'offer_unavailable') {
      setBlockedReason(statusMessage(session.status));
      setStep('status');
      return;
    }

    const isPlan = session.servicePaymentPlan?.status === 'plan_required';
    const readyForPayment = session.status === 'ready' && session.canSubmit
      && (hasCpachargeAchFlow(session) || hasVaultCollectionFlow(session) || canStartStripePayment(session));
    if ((isPlan || readyForPayment) && session.purchaseToken && !session.attemptId && !session.payment
      && !session.customerNotifications?.contact_saved && contactPassed.current !== session.purchaseId) {
      setBlockedReason('');
      setStep('contact');
      return;
    }

    if (isPlan) {
      setBlockedReason('');
      setStep('plan');
      return;
    }

    if (session.status === 'succeeded' && session.collection?.flow === 'vault_to_moov') {
      setBlockedReason('');
      setStep('vault');
      return;
    }

    const ach = hasCpachargeAchFlow(session);
    const confirmed = ach ? hasAchReceipt(session.payment) && !confirmedAchRefund(session.payment) : session.status === 'succeeded';
    if (confirmed) {
      setConfirmedReference(String((ach ? session.payment?.transaction_id : null) || session.attemptId || session.purchaseId));
      setStep('success');
      return;
    }

    if (session.status !== 'ready') {
      setBlockedReason('');
      setStep(hasCpachargeAchFlow(session) ? 'ach' : hasVaultCollectionFlow(session) ? 'vault' : hasStripeCollection(session) ? 'stripe' : 'status');
      return;
    }

    if (hasCpachargeAchFlow(session)) {
      if (!session.attemptId && !session.payment && (!session.canSubmit || !session.purchaseToken || !session.idempotencyKey)) {
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
    if (!widgetId?.trim() || (!payWhatYouWant && !planId?.trim())) {
      setError('The published widget or plan ID is missing.');
      return;
    }
    let amountMinor: number | undefined;
    if (payWhatYouWant) {
      const value = customerAmount.trim();
      const minorDigits = Math.max(0, Math.min(4, Number(payWhatYouWant.currencyMinorDigits ?? 2)));
      if (!matchesCurrencyPrecision(value, minorDigits) || !Number.isFinite(Number(value)) || Number(value) <= 0) {
        setError(`Enter a valid amount greater than zero, with no more than ${minorDigits} decimal places.`);
        return;
      }
      amountMinor = Math.round(Number(value) * (10 ** minorDigits));
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        setError('Enter an amount the payment service can process.');
        return;
      }
      const minimum = payWhatYouWant.minimumAmount ? Number(payWhatYouWant.minimumAmount) : null;
      const maximum = payWhatYouWant.maximumAmount ? Number(payWhatYouWant.maximumAmount) : null;
      if (!savedPwywIntent && minimum !== null && Number.isFinite(minimum) && Number(value) < minimum) {
        setError(`The minimum payment is ${formatCheckoutAmount(payWhatYouWant.minimumAmount!, currency)}.`);
        return;
      }
      if (!savedPwywIntent && maximum !== null && Number.isFinite(maximum) && Number(value) > maximum) {
        setError(`The maximum payment is ${formatCheckoutAmount(payWhatYouWant.maximumAmount!, currency)}.`);
        return;
      }
      if (referenceId.length > 100 || comments.length > 500) {
        setError('Reference IDs must be 100 characters or fewer and comments 500 characters or fewer.');
        return;
      }
      if (/[\u0000-\u001f\u007f]/.test(referenceId) || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(comments)) {
        setError('Remove unsupported control characters from the Reference ID or comment.');
        return;
      }
    }
    if (widgetId.trim() === 'mock-new-pricing') {
      setError('This sample preview cannot start a real checkout. Open a published widget to test payments.');
      return;
    }

    starting.current = true;
    if (payWhatYouWant) setPwywIntentLocked(true);
    setPriceTimedOut(false);
    setLoading(true);
    setError('');
    setPwywFieldErrors({});
    try {
      const result = await getOrCreateWidgetCheckout({
        widgetKind,
        widgetId: widgetId.trim(),
        planId: payWhatYouWant ? '' : planId.trim(),
        quantity: 1,
        ...(amountMinor !== undefined ? { amountMinor } : {}),
        ...(payWhatYouWant ? { currencyMinorDigits: payWhatYouWant.currencyMinorDigits ?? 2 } : {}),
        ...(payWhatYouWant && referenceId ? { referenceId } : {}),
        ...(payWhatYouWant && comments ? { comments } : {}),
        ...(payWhatYouWant && (savedPwywIntent?.embedOrigin || getEmbedOrigin())
          ? { embedOrigin: savedPwywIntent?.embedOrigin || getEmbedOrigin() } : {}),
      });
      setRetryCreationRequired(false);
      openSession(result.identity, result.session);
    } catch (err: any) {
      const message = err?.message || 'Checkout could not be created or recovered. Keep this page open and do not start another checkout.';
      setError(message);
      if (err instanceof WidgetCheckoutRequestError && err.phase === 'create') {
        const rejected = err.httpStatus === 400 || err.httpStatus === 422;
        setRetryCreationRequired(!rejected);
        if (payWhatYouWant && rejected) setPwywIntentLocked(false);
        if (payWhatYouWant) {
          const entries = Object.entries(err.fieldErrors || {}).map(([key, messages]) => [key, messages[0]] as const);
          setPwywFieldErrors(Object.fromEntries(entries));
          if (err.httpStatus === 404) setError('This payment page is not available.');
          else if (err.httpStatus === 409) setError('This payment request conflicts with an earlier checkout. Retry the same request or check its status before starting another payment.');
          else if (err.httpStatus && err.httpStatus >= 500 && !/unavailable/i.test(message)) setError('Payments are temporarily unavailable. Please try again later.');
        }
      }
      if (err instanceof WidgetCheckoutRequestError && err.phase === 'status') setRetryCreationRequired(false);
      if (/temporarily unavailable|HTTP 503/i.test(message)) setUnavailableModalOpen(true);
    } finally {
      starting.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!payWhatYouWant || !savedPwywIntent || autoPwywRecoveryStarted.current) return;
    autoPwywRecoveryStarted.current = true;
    void beginCheckout();
  }, [widgetId, payWhatYouWant, savedPwywIntent]);

  const checkStatus = async () => {
    if (!identity || loading) return;
    setLoading(true);
    setError('');
    try {
      const updated = await getWidgetCheckoutStatus(identity);
      openSession(identity, updated);
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
    if (checkout.status !== 'expired' || checkout.attemptId || checkout.payment) {
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

  if (checkout && identity && step === 'contact') {
    return <WidgetCheckoutContact key={checkout.purchaseId} checkout={checkout}
      onContinue={(preference) => {
        contactPassed.current = checkout.purchaseId;
        openSession(identity, preference ? { ...checkout, customerNotifications: preference } : checkout);
      }}
      onRefresh={() => {
        contactPassed.current = checkout.purchaseId;
        void checkStatus();
      }} />;
  }

  if (checkout && identity && step === 'plan') {
    return <ServicePaymentPlanFlow identity={identity} checkout={checkout} buyerEmail={email} onBack={() => setStep('methods')} />;
  }

  if (step === 'success') {
    const ach = checkout && hasCpachargeAchFlow(checkout);
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
                {confirmedReference && <div><dt>Payment reference</dt><dd>{confirmedReference}</dd></div>}
              </dl>
              {(checkout?.purchaseId || confirmedReference) && <SupportId value={checkout?.purchaseId || confirmedReference} />}
              {checkout && <WidgetEmailOptOut checkout={checkout} onUpdated={(preference) => setCheckout((current) => current ? {
                ...current, customerNotifications: preference,
                payment: current.payment ? { ...current.payment, customer_notifications: preference } : null,
              } : current)} />}
              <button className="payora-checkout__button payora-checkout__button--subtle payora-checkout__success-return" type="button" onClick={onBack}>
                Return to plans <ArrowRight size={16} />
              </button>
            </section>
            <OrderSummary planName={displayPlanName} features={planFeatures} amount={checkout?.amount} planAmount={amount} currency={checkout?.currency || currency} unitAmount={checkout?.unitAmount} quantity={checkout?.quantity} billingText={billingText} savingsText={savingsText} supportEmail={supportEmail} paymentSummaryLabel={ach ? 'Amount confirmed' : undefined} processorLabel={ach ? 'CPACharge' : undefined} />
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
        merchantName={payWhatYouWant?.businessName}
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
          onPaymentGuardChange={(processing) => postEmbedMessage(processing ? 'payment_processing' : 'payment_ready')}
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
    const offerNeedsRestart = payWhatYouWant && ['offer_changed', 'offer_unavailable'].includes(checkout.status)
      && !checkout.attemptId && !checkout.payment;
    const restartFromUpdatedOffer = () => {
      if (!identity || !checkout || !clearTerminalPayWhatYouWantIntent(identity, checkout)) return;
      window.location.reload();
    };
    return (
      <div className="payora-checkout">
        <div className="payora-checkout__container">
          <CheckoutHeader />
          <CheckoutProgress active={2} />
          <div className="payora-checkout__grid">
            <section className="payora-checkout__main">
              {!payWhatYouWant && <button className="payora-checkout__back" onClick={onBack}><ArrowLeft size={15} /> Back to plans</button>}
              <div className="payora-checkout__eyebrow">Checkout update</div>
              <h1 className="payora-checkout__title">{checkout.status === 'expired' ? 'Checkout expired' : offerNeedsRestart ? 'Payment page updated' : paymentMayHaveBeenSubmitted ? 'We’re checking your payment' : 'Checkout unavailable'}</h1>
              <p className="payora-checkout__description">{blockedReason || statusMessage(checkout.status)}</p>
              {error && (!serviceUnavailable || paymentMayHaveBeenSubmitted) && <div className="payora-checkout__alert" role="alert">{error}</div>}
              <SupportId value={checkout.purchaseId} />
              {checkout.status === 'expired' && !checkout.attemptId && !checkout.payment ? (
                restartRejected ? (
                  <button className="payora-checkout__button" type="button" onClick={onBack}>Review your plan <ArrowRight size={17} /></button>
                ) : (
                  <button className="payora-checkout__button" type="button" onClick={startAgain} disabled={loading}>
                    {loading ? <><span className="payora-checkout__spinner" /> Starting a new checkout…</> : <>{restartIdentity ? 'Retry starting checkout' : 'Start again'} <ArrowRight size={17} /></>}
                  </button>
                )
              ) : offerNeedsRestart ? (
                <button className="payora-checkout__button" type="button" onClick={restartFromUpdatedOffer} disabled={loading}>Review updated payment page <ArrowRight size={17} /></button>
              ) : (
                <button className="payora-checkout__text-button payora-checkout__refresh-link" onClick={checkStatus} disabled={loading}>
                  {loading ? 'Refreshing payment status…' : 'Having trouble? Refresh payment status'}
                </button>
              )}
              <p className="payora-checkout__footer">{offerNeedsRestart
                ? 'The previous checkout will not be charged. Reloading clears its unused request and fetches the latest published payment page.'
                : checkout.status === 'expired' && !checkout.attemptId && !checkout.payment
                ? 'Your previous checkout remains saved for reference. Starting again creates a new secure checkout at the current price and payment settings.'
                : paymentMayHaveBeenSubmitted ? 'Keep this page open while we verify the original payment. Do not start another payment until its status is confirmed.'
                : 'Refresh to check whether this checkout is available, or contact the merchant for help.'}</p>
            </section>
            <OrderSummary planName={displayPlanName} features={planFeatures} amount={checkout.amount} currency={checkout.currency} unitAmount={checkout.unitAmount} quantity={checkout.quantity} billingText={billingText} savingsText={savingsText} supportEmail={supportEmail} onChangePlan={onBack} />
          </div>
        </div>
        {(serviceUnavailable || unavailableModalOpen) && <CheckoutUnavailableModal message={error} supportEmail={supportEmail} planName={displayPlanName} paymentMayHaveBeenSubmitted={paymentMayHaveBeenSubmitted} onClose={() => { setUnavailableModalOpen(false); setError(''); }} onRetry={checkout.status === 'expired' && !checkout.attemptId && !checkout.payment ? startAgain : checkStatus} loading={loading} />}
      </div>
    );
  }

  if (payWhatYouWant) {
    const minorDigits = Math.max(0, Math.min(4, Number(payWhatYouWant.currencyMinorDigits ?? 2)));
    const amountValid = matchesCurrencyPrecision(customerAmount.trim(), minorDigits) && Number(customerAmount) > 0;
    const buttonColor = /^#[0-9a-f]{6}$/i.test(payWhatYouWant.buttonColor || '') ? payWhatYouWant.buttonColor : '#2456a6';
    const themeMode = payWhatYouWant.themeMode === 'dark' ? 'dark' : 'light';
    const minimum = Number(payWhatYouWant.minimumAmount || 0);
    const maximum = payWhatYouWant.maximumAmount == null || payWhatYouWant.maximumAmount === '' ? Number.POSITIVE_INFINITY : Number(payWhatYouWant.maximumAmount);
    const suggestedAmount = Number(payWhatYouWant.suggestedAmount || 0);
    const quickAmounts = suggestedAmount > 0
      ? Array.from(new Set([25, 50, 100, suggestedAmount]))
        .filter((value) => Number.isFinite(value) && value > 0 && value >= minimum && value <= maximum)
        .slice(0, 4)
      : [];
    const initials = (payWhatYouWant.businessName || 'Business').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    return <div className={`payora-checkout payora-checkout--pwyw theme-${themeMode}${isEmbedMode() ? ' is-embedded' : ''}`}>
      <div className="payora-checkout__pwyw-shell">
        <section className="payora-checkout__pwyw-card">
          <header className="payora-checkout__pwyw-header">
            <div className="payora-checkout__pwyw-avatar">
              {payWhatYouWant.logoUrl && <img src={payWhatYouWant.logoUrl} alt={`${payWhatYouWant.businessName || 'Business'} logo`} onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
              <span aria-hidden="true">{initials}</span>
            </div>
            <div className="payora-checkout__pwyw-business">{payWhatYouWant.businessName || 'Secure payment'}</div>
            <h1 className="payora-checkout__title">{payWhatYouWant.title || 'Pay What You Want'}</h1>
            <p className="payora-checkout__description">{payWhatYouWant.description || 'Choose an amount and pay securely in a few taps.'}</p>
          </header>
          <label className="payora-checkout__field payora-checkout__pwyw-amount-field"><span className="sr-only">Amount <strong aria-hidden="true">*</strong></span>
            <span className="payora-checkout__pwyw-amount"><span className="payora-checkout__pwyw-symbol">{currency === 'CAD' ? 'CA$' : '$'}</span><input aria-label={`Amount in ${currency}`} inputMode="decimal" autoComplete="off" value={customerAmount} onChange={(event) => { setCustomerAmount(event.target.value); setError(''); setPwywFieldErrors((current) => ({ ...current, amount_minor: '' })); }} disabled={pwywIntentLocked || loading} placeholder="0" /><span className="payora-checkout__pwyw-currency">{currency}</span></span>
          </label>
          {quickAmounts.length > 0 && <div className="payora-checkout__pwyw-quick-amounts" aria-label="Suggested amounts">{quickAmounts.map((value) => <button key={value} type="button" disabled={pwywIntentLocked || loading} aria-pressed={Number(customerAmount) === value} onClick={() => { setCustomerAmount(String(value)); setError(''); setPwywFieldErrors((current) => ({ ...current, amount_minor: '' })); }}>{new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)}</button>)}</div>}
          <p className="payora-checkout__pwyw-entry-hint">Enter any amount</p>
          {pwywFieldErrors.amount_minor && <p className="payora-checkout__field-error" role="alert">{pwywFieldErrors.amount_minor}</p>}
          {(payWhatYouWant.minimumAmount || payWhatYouWant.maximumAmount) && <p className="payora-checkout__pwyw-hint">{payWhatYouWant.minimumAmount ? `Minimum ${formatCheckoutAmount(payWhatYouWant.minimumAmount, currency)}` : ''}{payWhatYouWant.minimumAmount && payWhatYouWant.maximumAmount ? ' · ' : ''}{payWhatYouWant.maximumAmount ? `Maximum ${formatCheckoutAmount(payWhatYouWant.maximumAmount, currency)}` : ''}</p>}
          <div className="payora-checkout__pwyw-extra-fields">
            {payWhatYouWant.collectReferenceId && <label className="payora-checkout__field"><span>Reference ID <em>(optional)</em></span><input className="payora-checkout__input" maxLength={100} value={referenceId} onChange={(event) => { setReferenceId(event.target.value); setPwywFieldErrors((current) => ({ ...current, reference_id: '' })); }} disabled={pwywIntentLocked || loading} placeholder="e.g. Invoice #1042 or Client ID" /><small>Helps {payWhatYouWant.businessName || 'the business'} match your payment.</small>{pwywFieldErrors.reference_id && <small className="payora-checkout__field-error" role="alert">{pwywFieldErrors.reference_id}</small>}</label>}
            {payWhatYouWant.collectComments && <label className="payora-checkout__field"><span>Note <em>(optional)</em></span><textarea className="payora-checkout__input payora-checkout__pwyw-comments" maxLength={500} value={comments} onChange={(event) => { setComments(event.target.value); setPwywFieldErrors((current) => ({ ...current, comments: '' })); }} disabled={pwywIntentLocked || loading} placeholder="Add a note for the business" /><small className="payora-checkout__pwyw-count">{comments.length} / 500</small>{pwywFieldErrors.comments && <small className="payora-checkout__field-error" role="alert">{pwywFieldErrors.comments}</small>}</label>}
          </div>
          {error && !serviceUnavailable && <div className="payora-checkout__alert" role="alert">{error}</div>}
          <button className="payora-checkout__button payora-checkout__pwyw-pay" type="button" style={{ backgroundColor: buttonColor }} onClick={() => void beginCheckout()} disabled={!amountValid || loading || unavailableModalOpen}>{loading ? <><span className="payora-checkout__spinner" /> Preparing secure checkout…</> : <>{payWhatYouWant.buttonLabel || 'Pay Now'}{amountValid ? ` · ${formatCheckoutAmount(customerAmount, currency)}` : ''}</>}</button>
          <div className="payora-checkout__trust payora-checkout__pwyw-trust"><span><LockKeyhole size={14} /> Secure one-time payment</span><span>Enter your payment details on the next step</span></div>
          {pwywIntentLocked && error && <p className="payora-checkout__pwyw-hint">This checkout request is saved. Retry without changing the amount or details, or contact the business if the request was rejected.</p>}
          {payWhatYouWant.supportEmail && <footer className="payora-checkout__pwyw-help">Need help? <a href={`mailto:${payWhatYouWant.supportEmail}`}>{payWhatYouWant.supportEmail}</a></footer>}
        </section>
        <div className="payora-checkout__pwyw-powered">Secure checkout by <strong>MyPowerly</strong></div>
      </div>
      {(serviceUnavailable || unavailableModalOpen) && <CheckoutUnavailableModal message={error} supportEmail={supportEmail} planName={displayPlanName} onClose={() => { setUnavailableModalOpen(false); setError(''); }} onRetry={() => void beginCheckout()} loading={loading} />}
    </div>;
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
