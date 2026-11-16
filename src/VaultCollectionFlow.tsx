import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { CheckoutHeader, CheckoutProgress, CheckoutUnavailableModal, OrderSummary, formatCheckoutAmount } from './CheckoutUI';
import {
  beginVaultCollection,
  clearVgsSubmissionStarted,
  getVaultCollectionStatus,
  hasVgsSubmissionStarted,
  markVgsSubmissionStarted,
  requestNewVaultCard,
  submitVaultPayment,
  type VaultChargeResult,
  type VaultCollection,
  type VaultProvider,
} from './vaultCheckoutService';
import { getWidgetCheckoutStatus, type WidgetCheckoutIdentity, type WidgetCheckoutSession } from './widgetCheckoutService';
import { VgsHostedFields } from './VgsHostedFields';

type Props = {
  identity: WidgetCheckoutIdentity;
  checkout: WidgetCheckoutSession;
  planFeatures?: string[];
  billingText?: string;
  savingsText?: string;
  supportEmail?: string;
  onSuccess: (reference: string, checkout: WidgetCheckoutSession) => void;
  onCheckoutUpdate: (checkout: WidgetCheckoutSession) => void;
  onBack: () => void;
  onChangePlan: () => void;
};

const providerNames: Partial<Record<VaultProvider, string>> = { vgs: 'VGS Vault' };

function safeStripeRedirect(action: Record<string, any> | null) {
  if (action?.type !== 'redirect' || typeof action.url !== 'string') return null;
  try {
    const url = new URL(action.url);
    return url.protocol === 'https:' && url.hostname === 'hooks.stripe.com' ? url.toString() : null;
  } catch { return null; }
}

export const VaultCollectionFlow: React.FC<Props> = ({
  identity, checkout, planFeatures = [], billingText, savingsText, supportEmail,
  onSuccess, onCheckoutUpdate, onBack, onChangePlan,
}) => {
  const [collection, setCollection] = useState<VaultCollection | null>(null);
  const [charge, setCharge] = useState<VaultChargeResult | null>(null);
  const [chargeRequested, setChargeRequested] = useState(false);
  const [vgsSubmissionStarted, setVgsSubmissionStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const busyRef = useRef(false);
  const provider = checkout.collection?.provider as VaultProvider | undefined;
  const title = provider && providerNames[provider] ? providerNames[provider] : 'secure card provider';

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try { await work(); }
    catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'We could not confirm this step. Check the original checkout status before trying again.';
      setError(message);
      if (err?.status === 503 || err?.status >= 500 || err?.status === 0) setUnavailableOpen(true);
    } finally { busyRef.current = false; setBusy(false); }
  };

  const refreshCheckout = async () => {
    const latest = await getWidgetCheckoutStatus(identity);
    onCheckoutUpdate(latest);
    if (latest.attemptId || ['submitting', 'processing', 'uncertain', 'requires_action', 'succeeded', 'failed', 'cancelled'].includes(latest.status)) {
      setCharge((previous) => previous || ({
        purchase_id: latest.purchaseId, attempt_id: latest.attemptId, transaction_id: null,
        gateway_tx_id: null, gateway: 'stripe', status: latest.status, amount: latest.amount,
        currency: latest.currency, next_action: latest.nextAction,
      }));
    }
    return latest;
  };

  const refreshCollection = () => run(async () => {
    if (chargeRequested || charge?.attempt_id || checkout.attemptId || checkout.status !== 'ready') {
      await refreshCheckout();
      return;
    }
    if (!collection) {
      const current = await beginVaultCollection(checkout);
      setCollection(current);
      if (current.provider === 'vgs') {
        const previousSubmit = hasVgsSubmissionStarted(checkout.purchaseId, current.collection_id);
        if (current.state === 'ready') clearVgsSubmissionStarted(checkout.purchaseId, current.collection_id);
        setVgsSubmissionStarted(previousSubmit && current.state !== 'ready');
      }
      return;
    }
    const current = await getVaultCollectionStatus(collection.collection_id, checkout);
    setCollection(current);
    if (current.state === 'ready') clearVgsSubmissionStarted(checkout.purchaseId, current.collection_id);
  });

  useEffect(() => {
    if (!collection && checkout.status === 'ready') void refreshCollection();
    // Opening the payment route only resumes provider preparation; it never charges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = () => run(async () => {
    if (!collection || collection.state !== 'ready' || !collection.can_pay || checkout.status !== 'ready' || !checkout.canSubmit || !checkout.idempotencyKey) {
      throw new Error('Card preparation is not ready. Check its status before continuing.');
    }
    // A network failure may mean the server admitted the financial operation.
    // Lock payment submission and recover status only from this point onward.
    setChargeRequested(true);
    const result = await submitVaultPayment(checkout, collection);
    setCharge(result);
    if (result.status === 'succeeded') {
      onSuccess(result.transaction_id ? String(result.transaction_id) : result.attempt_id || result.purchase_id, { ...checkout, status: 'succeeded', attemptId: result.attempt_id });
    }
  });

  const changeCard = () => run(async () => {
    if (!collection?.can_enter_new_card || chargeRequested || charge?.attempt_id || checkout.attemptId) throw new Error('A new card cannot be requested after payment submission. Check the original payment status.');
    const replacement = await requestNewVaultCard(collection.collection_id, checkout);
    if (collection.provider === 'vgs') clearVgsSubmissionStarted(checkout.purchaseId, collection.collection_id);
    setCollection(replacement);
    setVgsSubmissionStarted(false);
  });

  const checkPayment = () => run(async () => {
    const latest = await refreshCheckout();
    if (latest.status === 'succeeded') {
      onSuccess(latest.attemptId || latest.purchaseId, latest);
    } else if (latest.status === 'requires_action') {
      setCharge((previous) => previous ? { ...previous, status: latest.status, next_action: latest.nextAction } : null);
    }
  });

  const recoverVgsCollection = () => run(async () => {
    if (!collection) return;
    const current = await getVaultCollectionStatus(collection.collection_id, checkout);
    setCollection(current);
    if (current.state === 'ready') clearVgsSubmissionStarted(checkout.purchaseId, current.collection_id);
  });

  const redirectUrl = safeStripeRedirect(charge?.next_action || checkout.nextAction);
  const hasAttempt = Boolean(chargeRequested || charge?.attempt_id || checkout.attemptId || checkout.status !== 'ready');
  const canShowCardAction = Boolean(collection?.state === 'ready' && collection.can_pay && !hasAttempt);
  const needsSdk = Boolean((provider === 'basis_theory' || provider === 'spreedly') && collection?.state === 'collecting');

  return (
    <div className="payora-checkout payora-checkout--payment">
      <div className="payora-checkout__container">
        <CheckoutHeader />
        <CheckoutProgress active={2} />
        <div className="payora-checkout__grid">
          <section className="payora-checkout__main">
            <button className="payora-checkout__back" type="button" onClick={hasAttempt ? checkPayment : onBack} disabled={busy}>
              <ArrowLeft size={15} /> {hasAttempt ? 'Check payment status' : 'Back to review'}
            </button>
            <div className="payora-checkout__eyebrow">Secure card payment</div>
            <h1 className="payora-checkout__title">Pay {formatCheckoutAmount(checkout.amount, checkout.currency)}</h1>
            <p className="payora-checkout__description">Your payment details are handled by {title}. The payment service confirms the result.</p>
            {checkout.status !== 'ready' && <div className="payora-checkout__alert" role="status">{checkout.status === 'requires_action' ? 'Your bank needs you to approve this payment.' : 'We are checking your original checkout. Please do not pay again.'}</div>}
            {error && !unavailableOpen && <div className="payora-checkout__alert" role="alert">{error}</div>}
            {charge && <div className={`payora-vault__state payora-vault__state--${charge.status}`} role="status">
              {charge.status === 'succeeded' ? <><CheckCircle2 size={18} /> Payment confirmed</> : charge.status === 'requires_action' ? 'Bank verification is required.' : charge.status === 'failed' ? 'This payment did not complete. Keep the reference for support.' : charge.status === 'cancelled' ? 'This payment was cancelled.' : charge.status === 'uncertain' ? 'We are checking your payment. Please do not pay again.' : 'Your payment is processing. Check its status before taking another action.'}
              {(charge.attempt_id || charge.transaction_id) && <small>Reference: {String(charge.transaction_id || charge.attempt_id)}</small>}
            </div>}

            {!hasAttempt && needsSdk && (
              <div className="payora-vault__provider-box">
                <div className="payora-vault__provider-heading"><ShieldCheck size={17} /> {title} card entry</div>
                <p className="payora-vault__error" role="alert">This provider is selected by the payment service, but its approved browser SDK adapter is not installed in this widget build. No card details were collected and no payment was submitted. Contact the payments team to install and validate the provider’s approved SDK version.</p>
              </div>
            )}

            {!hasAttempt && collection?.state === 'collecting' && provider === 'vgs' && (
              <div className="payora-vault__provider-box">
                <div className="payora-vault__provider-heading"><ShieldCheck size={17} /> VGS hosted card fields</div>
                <VgsHostedFields
                  config={collection.collection || {}}
                  disabled={busy || vgsSubmissionStarted}
                  onSubmitStart={() => {
                    try {
                      markVgsSubmissionStarted(checkout.purchaseId, collection.collection_id);
                      setVgsSubmissionStarted(true);
                      return true;
                    } catch { return false; }
                  }}
                  onSubmitFinished={recoverVgsCollection}
                  onValidationFailure={() => {
                    clearVgsSubmissionStarted(checkout.purchaseId, collection.collection_id);
                    setVgsSubmissionStarted(false);
                  }}
                />
              </div>
            )}

            {!hasAttempt && collection?.state === 'collecting' && provider === 'vgs' && vgsSubmissionStarted && (
              <div className="payora-vault__state" role="status">Card preparation was submitted. We are checking its status; do not submit the card again.</div>
            )}

            {!hasAttempt && collection && ['initializing', 'provisioning', 'uncertain'].includes(collection.state) && (
              <div className="payora-vault__state" role="status">{collection.state === 'uncertain' ? 'We are checking the original card preparation. Do not enter card details again.' : 'Preparing secure card entry…'}</div>
            )}

            {!hasAttempt && collection && ['failed', 'expired', 'revoked', 'consumed'].includes(collection.state) && (
              <div className="payora-vault__state" role="status">Secure card preparation is {collection.state}. Check its status or contact the merchant before continuing.</div>
            )}

            {redirectUrl && <a className="payora-checkout__button" href={redirectUrl} target="_blank" rel="noopener noreferrer">Continue to bank verification <ExternalLink size={16} /></a>}
            {charge?.status === 'requires_action' && !redirectUrl && <p className="payora-vault__error" role="alert">The bank verification action is missing or unsupported. Check payment status before proceeding.</p>}

            <div className="payora-vault__actions">
              <button className="payora-checkout__button payora-checkout__button--subtle" type="button" onClick={refreshCollection} disabled={busy}>
                {busy ? <><span className="payora-checkout__spinner" /> Checking…</> : <><RefreshCw size={15} /> Check status</>}
              </button>
              {canShowCardAction && <button className="payora-checkout__button" type="button" onClick={pay} disabled={busy}>{busy ? <><span className="payora-checkout__spinner" /> Processing securely…</> : <>Pay {formatCheckoutAmount(checkout.amount, checkout.currency)} <ArrowRight size={16} /></>}</button>}
              {!hasAttempt && collection?.can_enter_new_card && (collection.state !== 'collecting' || vgsSubmissionStarted) && <button className="payora-checkout__text-button" type="button" onClick={changeCard} disabled={busy}>Enter another card</button>}
            </div>
            <div className="payora-checkout__card-assurance"><ShieldCheck size={15} /> Card data is processed by the selected secure provider. Powered by Stripe.</div>
            <p className="payora-checkout__reference">Checkout reference: {checkout.purchaseId}</p>
          </section>
          <OrderSummary planName={checkout.planName} features={planFeatures} amount={checkout.amount} unitAmount={checkout.unitAmount} quantity={checkout.quantity} currency={checkout.currency} billingText={billingText} savingsText={savingsText} supportEmail={supportEmail} onChangePlan={!hasAttempt ? onChangePlan : undefined} />
        </div>
      </div>
      {unavailableOpen && <CheckoutUnavailableModal message={error} supportEmail={supportEmail} planName={checkout.planName} paymentMayHaveBeenSubmitted={hasAttempt} onClose={() => setUnavailableOpen(false)} onRetry={hasAttempt ? checkPayment : refreshCollection} loading={busy} />}
    </div>
  );
};
