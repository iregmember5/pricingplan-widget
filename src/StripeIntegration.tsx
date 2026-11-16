import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { CheckoutHeader, CheckoutProgress, CheckoutUnavailableModal, OrderSummary, formatCheckoutAmount } from './CheckoutUI';
import { getWidgetCheckoutStatus, type WidgetCheckoutIdentity, type WidgetCheckoutSession } from './widgetCheckoutService';
import { submitWidgetPayment } from './routerService';

interface StripeIntegrationProps {
  identity: WidgetCheckoutIdentity;
  checkout: WidgetCheckoutSession;
  planFeatures?: string[];
  billingText?: string;
  savingsText?: string;
  supportEmail?: string;
  customerEmail?: string;
  onSuccess: (reference: string) => void;
  onBack: () => void;
  onChangePlan: () => void;
}

function statusMessage(status: string) {
  switch (status) {
    case 'submitting': return 'Your payment is already being submitted. You do not need to pay again.';
    case 'processing': return 'Your payment is processing. Check its status before taking another action.';
    case 'uncertain': return 'We are checking the original payment. Please do not submit another payment.';
    case 'requires_action': return 'Your bank needs you to approve this payment.';
    case 'ready': return 'This checkout is not currently accepting payment. No payment was submitted. Contact the merchant.';
    case 'failed': return 'This payment did not complete. Keep this reference for support.';
    case 'cancelled': return 'This payment was cancelled. Keep this reference for support.';
    case 'expired': return 'This checkout has expired. Contact the merchant for help.';
    case 'offer_changed': return 'The offer changed after this checkout was created. Contact the merchant before starting another checkout.';
    default: return 'Payment is not confirmed yet. Check the original checkout status before trying again.';
  }
}

export const StripeIntegration: React.FC<StripeIntegrationProps> = ({
  identity,
  checkout,
  planFeatures = [],
  billingText,
  savingsText,
  supportEmail,
  customerEmail,
  onSuccess,
  onBack,
  onChangePlan,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [checkoutState, setCheckoutState] = useState(checkout);
  const [processing, setProcessing] = useState(false);
  const [attemptStarted, setAttemptStarted] = useState(checkout.status !== 'ready');
  const [cardComplete, setCardComplete] = useState({ number: false, expiry: false, cvc: false });
  const [cardErrors, setCardErrors] = useState({ number: '', expiry: '', cvc: '' });
  const [error, setError] = useState('');
  const [unavailableModalOpen, setUnavailableModalOpen] = useState(false);

  const completeCard = cardComplete.number && cardComplete.expiry && cardComplete.cvc;
  const amountLabel = formatCheckoutAmount(checkoutState.amount, checkoutState.currency);
  const paymentAction = checkoutState.nextAction;
  const hasStripeAction = paymentAction?.type === 'stripe_authentication'
    && typeof paymentAction?.client_secret === 'string'
    && paymentAction.client_secret.length > 0;
  const canShowCardForm = checkoutState.status === 'ready'
    && checkoutState.canSubmit
    && !!checkoutState.purchaseToken
    && !!checkoutState.idempotencyKey
    && checkoutState.currency in { USD: true, CAD: true };

  const applyAuthoritativeStatus = (updated: WidgetCheckoutSession) => {
    setCheckoutState(updated);
    setUnavailableModalOpen(false);
    if (updated.status === 'succeeded') {
      onSuccess(updated.attemptId || updated.purchaseId);
    }
  };

  const refreshStatus = async () => {
    setProcessing(true);
    setError('');
    try {
      const updated = await getWidgetCheckoutStatus(identity);
      applyAuthoritativeStatus(updated);
    } catch (err: any) {
      const message = err?.message || 'We could not confirm the payment status. Keep this checkout reference and try checking again.';
      setError(message);
      if (/temporarily unavailable|HTTP 503/i.test(message)) setUnavailableModalOpen(true);
    } finally {
      setProcessing(false);
    }
  };

  const continueAuthentication = async () => {
    if (!stripe || !hasStripeAction || processing) return;
    setProcessing(true);
    setError('');
    try {
      const result = await stripe.confirmCardPayment(paymentAction.client_secret);
      if (result.error) setError(result.error.message || 'Bank authentication was not completed. Checking payment status…');
      // Stripe's browser result is not authoritative for our receipt. Ask the
      // backend to reconcile the original attempt before showing confirmation.
      const updated = await getWidgetCheckoutStatus(identity);
      applyAuthoritativeStatus(updated);
    } catch (err: any) {
      const message = err?.message || 'Authentication could not be confirmed. Check the original payment status.';
      setError(message);
      if (/temporarily unavailable|HTTP 503/i.test(message)) setUnavailableModalOpen(true);
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || !completeCard || processing || !canShowCardForm || attemptStarted) return;
    setProcessing(true);
    setError('');
    let chargeRequestStarted = false;

    try {
      const card = elements.getElement(CardNumberElement);
      if (!card) throw new Error('Secure card fields are not ready.');
      const paymentMethod = await stripe.createPaymentMethod({
        type: 'card',
        card,
        ...(customerEmail ? { billing_details: { email: customerEmail } } : {}),
      });
      if (paymentMethod.error || !paymentMethod.paymentMethod?.id) {
        throw new Error(paymentMethod.error?.message || 'Card details could not be prepared.');
      }

      // Lock this checkout before the first charge request. A network timeout
      // never triggers another charge submission.
      setAttemptStarted(true);
      chargeRequestStarted = true;
      const result = await submitWidgetPayment(checkoutState, paymentMethod.paymentMethod.id);
      const nextAction = result.next_action || null;
      setCheckoutState((current) => ({ ...current, status: result.status || 'uncertain', nextAction }));

      if (result.status === 'succeeded') {
        onSuccess(result.attempt_id || result.transaction_id?.toString() || checkoutState.purchaseId);
        return;
      }
      if (result.status === 'failed' || result.status === 'cancelled') return;
      if (result.status === 'requires_action' && nextAction?.type === 'stripe_authentication') return;

      // Nonterminal and unexpected outcomes are checked through the original
      // scoped session. This is status reconciliation, never a new charge.
      await refreshStatus();
    } catch (err: any) {
      const message = err?.message || 'Payment could not be confirmed. Check the original checkout status before trying again.';
      setError(message);
      if (/temporarily unavailable|HTTP 503/i.test(message)) setUnavailableModalOpen(true);
      if (chargeRequestStarted) {
        // The request may have reached the server even if its response was lost.
        // Keep this checkout locked and query status only.
        try {
          const updated = await getWidgetCheckoutStatus(identity);
          setError('');
          applyAuthoritativeStatus(updated);
        } catch {
          // Preserve the original error and let the buyer manually check later.
        }
      }
    } finally {
      setProcessing(false);
    }
  };

  const showStatus = attemptStarted || !canShowCardForm;
  const serviceUnavailable = /temporarily unavailable|HTTP 503/i.test(error);

  return (
    <div className="payora-checkout payora-checkout--payment">
      <div className="payora-checkout__container">
        <CheckoutHeader />
        <div className="payora-checkout__grid">
          <section className="payora-checkout__main">
            <button className="payora-checkout__back" type="button" onClick={onBack}><ArrowLeft size={15} /> Back to billing details</button>
            <CheckoutProgress active={2} />
            <div className="payora-checkout__eyebrow">Encrypted card entry</div>
            <h1 className="payora-checkout__title">{showStatus ? 'Payment status' : 'Payment details'}</h1>
            <p className="payora-checkout__description">{showStatus ? statusMessage(checkoutState.status) : 'Enter your card details to complete this secure payment.'}</p>
            {!showStatus && <div className="payora-checkout__accepted-cards" aria-label="Credit and debit cards accepted">
              <span className="payora-checkout__accepted-label">Cards accepted</span>
              <span className="payora-checkout__card-brand payora-checkout__card-brand--visa">VISA</span>
              <span className="payora-checkout__card-brand payora-checkout__card-brand--mastercard"><i /> <i /> Mastercard</span>
              <span className="payora-checkout__card-brand payora-checkout__card-brand--amex">AMEX</span>
              <span className="payora-checkout__accepted-caption">Credit and debit</span>
            </div>}
            {checkoutState.purchaseId && <div className="payora-checkout__reference">Checkout reference: {checkoutState.purchaseId}</div>}
            {canShowCardForm && !attemptStarted ? (
              <form className="payora-checkout__card-form" onSubmit={handleSubmit}>
                <div className="payora-checkout__field">
                  <label htmlFor="payora-card-number">Card number</label>
                  <div className={`payora-checkout__stripe-field${cardErrors.number ? ' has-error' : ''}`} id="payora-card-number">
                    <CardNumberElement onChange={(event) => {
                      setCardComplete((current) => ({ ...current, number: event.complete }));
                      setCardErrors((current) => ({ ...current, number: event.error?.message || '' }));
                    }} options={{ style: { base: { fontSize: '16px', color: '#17243a', '::placeholder': { color: '#78869a' } }, invalid: { color: '#9e2146' } } }} />
                  </div>
                  {cardErrors.number && <div className="payora-checkout__field-error">{cardErrors.number}</div>}
                </div>
                <div className="payora-checkout__stripe-row">
                  <div className="payora-checkout__field">
                    <label htmlFor="payora-card-expiry">Expiry date</label>
                    <div className={`payora-checkout__stripe-field${cardErrors.expiry ? ' has-error' : ''}`} id="payora-card-expiry">
                      <CardExpiryElement onChange={(event) => {
                        setCardComplete((current) => ({ ...current, expiry: event.complete }));
                        setCardErrors((current) => ({ ...current, expiry: event.error?.message || '' }));
                      }} options={{ style: { base: { fontSize: '16px', color: '#17243a', '::placeholder': { color: '#78869a' } }, invalid: { color: '#9e2146' } } }} />
                    </div>
                    {cardErrors.expiry && <div className="payora-checkout__field-error">{cardErrors.expiry}</div>}
                  </div>
                  <div className="payora-checkout__field">
                    <label htmlFor="payora-card-cvc">Security code</label>
                    <div className={`payora-checkout__stripe-field${cardErrors.cvc ? ' has-error' : ''}`} id="payora-card-cvc">
                      <CardCvcElement onChange={(event) => {
                        setCardComplete((current) => ({ ...current, cvc: event.complete }));
                        setCardErrors((current) => ({ ...current, cvc: event.error?.message || '' }));
                      }} options={{ style: { base: { fontSize: '16px', color: '#17243a', '::placeholder': { color: '#78869a' } }, invalid: { color: '#9e2146' } } }} />
                    </div>
                    {cardErrors.cvc && <div className="payora-checkout__field-error">{cardErrors.cvc}</div>}
                  </div>
                </div>
                {error && (!serviceUnavailable || attemptStarted) && <div role="alert" className="payora-checkout__alert">{error}</div>}
                <button className="payora-checkout__button" type="submit" disabled={!stripe || !completeCard || processing || unavailableModalOpen}>
                  {processing ? <><span className="payora-checkout__spinner" /> Processing securely…</> : <>Pay {amountLabel} <ArrowRight size={17} /></>}
                </button>
              </form>
            ) : (
              <div className="payora-checkout__status-content">
                {error && !serviceUnavailable && <div role="alert" className="payora-checkout__alert">{error}</div>}
                {checkoutState.status === 'requires_action' && hasStripeAction ? (
                  <button className="payora-checkout__button" type="button" onClick={continueAuthentication} disabled={!stripe || processing}>
                    {processing ? 'Waiting for your bank…' : <>Continue bank authentication <ArrowRight size={17} /></>}
                  </button>
                ) : (
                  <button className="payora-checkout__button payora-checkout__button--subtle" type="button" onClick={refreshStatus} disabled={processing}>
                    {processing ? 'Checking status…' : <>Check payment status <ArrowRight size={17} /></>}
                  </button>
                )}
                <p className="payora-checkout__card-assurance">Use this checkout reference while we verify the payment. Don’t submit another payment.</p>
              </div>
            )}
          </section>
          <OrderSummary
            planName={checkoutState.planName || 'Your selection'}
            amount={checkoutState.amount}
            unitAmount={checkoutState.unitAmount}
            currency={checkoutState.currency}
            quantity={checkoutState.quantity}
            features={planFeatures}
            billingText={billingText || 'One-time payment'}
            savingsText={savingsText}
            supportEmail={supportEmail}
            onChangePlan={onChangePlan}
          />
        </div>
      </div>
      {(serviceUnavailable || unavailableModalOpen) && <CheckoutUnavailableModal message={error} supportEmail={supportEmail} planName={checkoutState.planName} paymentMayHaveBeenSubmitted={attemptStarted} onClose={() => { setUnavailableModalOpen(false); setError(''); }} onRetry={refreshStatus} loading={processing} />}
    </div>
  );
};
