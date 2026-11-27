import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, ExternalLink, LockKeyhole, ShieldCheck } from 'lucide-react';
import { CardPreview, CheckoutHeader, CheckoutProgress, CheckoutUnavailableModal, OrderSummary, SupportId, formatCheckoutAmount } from './CheckoutUI';
import {
  beginVaultCollection,
  clearNewVaultCardStarted,
  completeVaultCollection,
  clearVgsSubmissionStarted,
  getPurchasePaymentStatus,
  getVaultCollectionStatus,
  hasVgsSubmissionStarted,
  hasNewVaultCardStarted,
  hasVaultPaymentStarted,
  markVgsSubmissionStarted,
  markVaultPaymentStarted,
  markNewVaultCardStarted,
  requestNewVaultCard,
  submitVaultPayment,
  type VaultChargeResult,
  type VaultCollection,
  type VaultProvider,
} from './vaultCheckoutService';
import { getWidgetCheckoutStatus, type WidgetCheckoutIdentity, type WidgetCheckoutSession } from './widgetCheckoutService';
import { VgsHostedFields } from './VgsHostedFields';
import { BasisTheoryHostedFields } from './BasisTheoryHostedFields';
import { readBasisRecovery, saveBasisRecovery } from './basisTheoryRecovery';

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

function safeStripeRedirect(action: Record<string, any> | null) {
  if (action?.type !== 'redirect' || typeof action.url !== 'string') return null;
  try {
    const url = new URL(action.url);
    return url.protocol === 'https:' && url.hostname === 'hooks.stripe.com' ? url.toString() : null;
  } catch { return null; }
}

function retryDelayMs(error: any, fallback: number) {
  const retryAfter = error?.retryAfter;
  if (typeof retryAfter !== 'string' || !retryAfter.trim()) return fallback;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(retryAfter);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : fallback;
}

export const VaultCollectionFlow: React.FC<Props> = ({
  identity, checkout, planFeatures = [], billingText, savingsText, supportEmail,
  onSuccess, onCheckoutUpdate, onBack, onChangePlan,
}) => {
  const [collection, setCollection] = useState<VaultCollection | null>(null);
  const [cardPreview, setCardPreview] = useState({ brand: '', last4: '' });
  const [charge, setCharge] = useState<VaultChargeResult | null>(null);
  const [chargeRequested, setChargeRequested] = useState(() => hasVaultPaymentStarted(checkout.purchaseId));
  const [vgsSubmissionStarted, setVgsSubmissionStarted] = useState(false);
  const [basisSubmissionStarted, setBasisSubmissionStarted] = useState(false);
  const [payerFirstName, setPayerFirstName] = useState('');
  const [payerLastName, setPayerLastName] = useState('');
  const [payerNameError, setPayerNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const busyRef = useRef(false);
  const collectionStatusRequest = useRef<Promise<VaultCollection> | null>(null);
  const pollState = useRef({ collectionId: '', count: 0 });
  const provider = checkout.collection?.provider as VaultProvider | undefined;
  const checkoutGateway = checkout.collection?.gateway || '';
  const collectionGateway = collection?.gateway || checkoutGateway;
  const payerNamesRequired = collectionGateway === 'moov';
  const payerNamesValid = Boolean(payerFirstName.trim() && payerLastName.trim()
    && payerFirstName.trim().length <= 64 && payerLastName.trim().length <= 64);
  const title = 'secure payment provider';

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

  const readCollectionStatus = (collectionId: string, session: WidgetCheckoutSession) => {
    if (collectionStatusRequest.current) return collectionStatusRequest.current;
    const request = getVaultCollectionStatus(collectionId, session).finally(() => {
      if (collectionStatusRequest.current === request) collectionStatusRequest.current = null;
    });
    collectionStatusRequest.current = request;
    return request;
  };

  const refreshCheckout = async () => {
    const latest = await getWidgetCheckoutStatus(identity);
    onCheckoutUpdate(latest);
    if (latest.attemptId || latest.payment || hasVaultPaymentStarted(latest.purchaseId) || latest.status !== 'ready') {
      setChargeRequested(true);
      const payment = await getPurchasePaymentStatus(latest);
      setCharge(payment);
      return { checkout: latest, payment };
    }
    return { checkout: latest, payment: null };
  };

  const recoverPayment = async () => {
    const { checkout: latest, payment } = await refreshCheckout();
    if (payment?.status === 'succeeded') {
      onSuccess(payment.transaction_id ? String(payment.transaction_id) : payment.attempt_id || payment.purchase_id, {
        ...latest, amount: payment.amount || latest.amount, currency: payment.currency || latest.currency,
        status: 'succeeded', attemptId: payment.attempt_id,
      });
    }
  };
  const checkPayment = () => run(recoverPayment);

  const refreshCollection = () => run(async () => {
    if (chargeRequested || hasVaultPaymentStarted(checkout.purchaseId) || charge?.attempt_id || checkout.attemptId || checkout.payment || checkout.status !== 'ready') {
      await refreshCheckout();
      return;
    }
    if (!collection) {
      let current: VaultCollection;
      if (provider === 'basis_theory') {
        if (!navigator.locks?.request) throw new Error('Secure checkout recovery is not available in this browser.');
        current = await navigator.locks.request(`payora-basis-begin:${checkout.purchaseId}`, async () => {
          const saved = readBasisRecovery(localStorage, checkout.purchaseId);
          if (saved && saved.collectionId !== 'pending') {
            setBasisSubmissionStarted(saved.tokenizationStarted);
            return readCollectionStatus(saved.collectionId, checkout);
          }
          saveBasisRecovery(localStorage, checkout.purchaseId, { collectionId: 'pending', tokenizationStarted: true });
          const started = await beginVaultCollection(checkout);
          saveBasisRecovery(localStorage, checkout.purchaseId, { collectionId: started.collection_id, tokenizationStarted: false });
          return started;
        });
      } else {
        current = await beginVaultCollection(checkout);
      }
      setCollection(current);
      if (current.provider === 'vgs') {
        const previousSubmit = hasVgsSubmissionStarted(checkout.purchaseId, current.collection_id);
        if (current.state === 'ready') clearVgsSubmissionStarted(checkout.purchaseId, current.collection_id);
        setVgsSubmissionStarted(previousSubmit && current.state !== 'ready');
      }
      if (current.state === 'consumed') {
        markVaultPaymentStarted(checkout.purchaseId);
        setChargeRequested(true);
        await recoverPayment();
      }
      return;
    }
    const current = await readCollectionStatus(collection.collection_id, checkout);
    setCollection(current);
    if (current.state === 'ready' && current.provider === 'vgs') clearVgsSubmissionStarted(checkout.purchaseId, current.collection_id);
    if (current.state === 'consumed') {
      markVaultPaymentStarted(checkout.purchaseId);
      setChargeRequested(true);
      await recoverPayment();
    }
  });

  const pay = () => run(async () => {
    if (!collection || collection.state !== 'ready' || !collection.can_pay || checkout.status !== 'ready' || !checkout.canSubmit || !checkout.idempotencyKey) {
      throw new Error('Card preparation is not ready. Check its status before continuing.');
    }
    // A network failure may mean the server admitted the financial operation.
    // Lock payment submission and recover status only from this point onward.
    if (payerNamesRequired && !payerNamesValid) {
      setPayerNameError('Enter a first and last name, each no longer than 64 characters.');
      throw new Error('Enter a first and last name, each no longer than 64 characters.');
    }
    markVaultPaymentStarted(checkout.purchaseId);
    setChargeRequested(true);
    const result = await submitVaultPayment(checkout, collection);
    setCharge(result);
    if (result.status === 'succeeded') {
      onSuccess(result.transaction_id ? String(result.transaction_id) : result.attempt_id || result.purchase_id, {
        ...checkout, amount: result.amount || checkout.amount, currency: result.currency || checkout.currency,
        status: 'succeeded', attemptId: result.attempt_id,
      });
    }
  });

  const changeCard = () => run(async () => {
    if (!collection?.can_enter_new_card || collection.state === 'consumed' || chargeRequested || hasVaultPaymentStarted(checkout.purchaseId) || charge?.attempt_id || checkout.attemptId || checkout.payment) throw new Error('A new card cannot be requested after payment submission. Check the original payment status.');
    if (hasNewVaultCardStarted(checkout.purchaseId, collection.collection_id)) throw new Error('Card replacement was already requested. Check its status before taking another action.');
    if (!navigator.locks?.request) throw new Error('Secure checkout recovery is not available in this browser.');
    const replacement = await navigator.locks.request(`payora-vault-new-card:${checkout.purchaseId}`, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('Card replacement is already being requested. Check its status.');
      if (hasNewVaultCardStarted(checkout.purchaseId, collection.collection_id)) throw new Error('Card replacement was already requested. Check its status before taking another action.');
      if (collection.provider === 'basis_theory') {
        const saved = readBasisRecovery(localStorage, checkout.purchaseId);
        if (!saved || saved.collectionId !== collection.collection_id) throw new Error('Card preparation has changed. Recover the original checkout.');
      }
      markNewVaultCardStarted(checkout.purchaseId, collection.collection_id);
      const next = await requestNewVaultCard(collection.collection_id, checkout);
      if (collection.provider === 'basis_theory') {
        saveBasisRecovery(localStorage, checkout.purchaseId, { collectionId: next.collection_id, tokenizationStarted: false });
      }
      return next;
    });
    if (collection.provider === 'basis_theory') setBasisSubmissionStarted(false);
    if (collection.provider === 'vgs') clearVgsSubmissionStarted(checkout.purchaseId, collection.collection_id);
    clearNewVaultCardStarted(checkout.purchaseId, collection.collection_id);
    setCardPreview({ brand: '', last4: '' });
    setCollection(replacement);
    setVgsSubmissionStarted(false);
  });

  useEffect(() => {
    if (chargeRequested || hasVaultPaymentStarted(checkout.purchaseId) || checkout.attemptId || checkout.payment || checkout.status !== 'ready') void checkPayment();
    else if (!collection && checkout.status === 'ready') void refreshCollection();
    // Opening the payment route only resumes an existing operation or prepares
    // the backend-selected collection; it never charges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAttempt = Boolean(chargeRequested || hasVaultPaymentStarted(checkout.purchaseId) || charge?.attempt_id || checkout.attemptId || checkout.payment || checkout.status !== 'ready');
  useEffect(() => {
    if (!collection || hasAttempt) return undefined;
    const needsStatusRecovery = ['initializing', 'provisioning', 'uncertain'].includes(collection.state)
      || collection.state === 'collecting' && (vgsSubmissionStarted || basisSubmissionStarted);
    if (!needsStatusRecovery) return undefined;
    if (pollState.current.collectionId !== collection.collection_id) {
      pollState.current = { collectionId: collection.collection_id, count: 0 };
    }
    let active = true;
    let timer = 0;
    const delays = [1500, 3000, 6000, 12000, 20000];
    const schedule = (delay: number) => {
      if (!active || pollState.current.count >= delays.length) return;
      timer = window.setTimeout(async () => {
        if (!active) return;
        if (busyRef.current) { schedule(delay); return; }
        pollState.current.count += 1;
        try {
          const current = await readCollectionStatus(collection.collection_id, checkout);
          if (!active) return;
          setCollection(current);
          if (current.state === 'ready' && current.provider === 'vgs') clearVgsSubmissionStarted(checkout.purchaseId, current.collection_id);
          if (current.state === 'consumed') {
            markVaultPaymentStarted(checkout.purchaseId);
            setChargeRequested(true);
            void checkPayment();
            return;
          }
          const stillUncertain = ['initializing', 'provisioning', 'uncertain'].includes(current.state)
            || current.state === 'collecting' && (vgsSubmissionStarted || basisSubmissionStarted);
          if (stillUncertain) schedule(delays[Math.min(pollState.current.count, delays.length - 1)]);
        } catch (reason: any) {
          if (!active) return;
          setError(reason?.message || 'Card preparation could not be confirmed. Check its status before continuing.');
          const fallback = delays[Math.min(pollState.current.count, delays.length - 1)];
          if (reason?.status === 429 || reason?.status === 0 || reason?.status >= 500) {
            schedule(retryDelayMs(reason, fallback));
          }
        }
      }, delay);
    };
    schedule(delays[Math.min(pollState.current.count, delays.length - 1)]);
    return () => { active = false; window.clearTimeout(timer); };
  }, [collection?.collection_id, collection?.state, checkout.purchaseId, hasAttempt, vgsSubmissionStarted, basisSubmissionStarted]);

  const recoverVgsCollection = () => run(async () => {
    if (!collection) return;
    const current = await readCollectionStatus(collection.collection_id, checkout);
    setCollection(current);
    if (current.state === 'ready') clearVgsSubmissionStarted(checkout.purchaseId, current.collection_id);
  });

  const redirectUrl = safeStripeRedirect(charge?.next_action || checkout.nextAction);
  const canShowCardAction = Boolean(collection?.state === 'ready' && collection.can_pay && checkout.canSubmit && !hasAttempt && (!payerNamesRequired || payerNamesValid));
  const needsSdk = Boolean(provider === 'spreedly' && collection?.state === 'collecting');

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
            <p className="payora-checkout__description">Enter your billing details and card information. We’ll confirm the result securely.</p>
            {payerNamesRequired && (
              <div className="payora-vault__payer-fields">
                <div className="payora-checkout__field">
                  <label htmlFor="payora-payer-first-name">First name <span>Required</span></label>
                  <input id="payora-payer-first-name" className="payora-checkout__input" autoComplete="given-name" maxLength={64} value={payerFirstName} onChange={event => { setPayerFirstName(event.target.value); setPayerNameError(''); }} />
                </div>
                <div className="payora-checkout__field">
                  <label htmlFor="payora-payer-last-name">Last name <span>Required</span></label>
                  <input id="payora-payer-last-name" className="payora-checkout__input" autoComplete="family-name" maxLength={64} value={payerLastName} onChange={event => { setPayerLastName(event.target.value); setPayerNameError(''); }} />
                </div>
                <p className="payora-checkout__field-note">Enter each name in 64 characters or fewer.</p>
                {payerNameError && <p className="payora-vault__error" role="alert">{payerNameError}</p>}
              </div>
            )}
            {checkout.status !== 'ready' && <div className="payora-checkout__alert" role="status">{checkout.status === 'requires_action' ? 'Your bank needs you to approve this payment.' : 'We are checking your original checkout. Please do not pay again.'}</div>}
            {error && !unavailableOpen && <div className="payora-checkout__alert" role="alert">{error}</div>}
            {charge && <div className={`payora-vault__state payora-vault__state--${charge.status}`} role="status" aria-live="polite">
              {charge.status === 'succeeded' ? <><CheckCircle2 size={18} /> Payment confirmed</> : charge.status === 'requires_action' ? 'Bank verification is required.' : charge.status === 'failed' ? 'This payment did not complete. Keep the reference for support.' : charge.status === 'cancelled' ? 'This payment was cancelled.' : charge.status === 'uncertain' ? 'We are checking your payment. Please do not pay again.' : charge.status === 'ready' ? 'No payment attempt was found, but this checkout remains locked for safety. Contact support before taking another action.' : 'Your payment is processing. Check its status before taking another action.'}
            </div>}

            {!hasAttempt && needsSdk && (
              <div className="payora-vault__provider-box">
                <div className="payora-vault__provider-heading"><ShieldCheck size={17} /> Secure card entry</div>
                <p className="payora-vault__error" role="alert">This provider is selected by the payment service, but its approved browser SDK adapter is not installed in this widget build. No card details were collected and no payment was submitted. Contact the payments team to install and validate the provider’s approved SDK version.</p>
              </div>
            )}

            {!hasAttempt && collection?.state === 'collecting' && provider === 'vgs' && (
              <div className="payora-vault__provider-box">
                <div className="payora-vault__provider-heading"><ShieldCheck size={17} /> Secure card entry</div>
                <CardPreview brand={cardPreview.brand} last4={cardPreview.last4} />
                <VgsHostedFields
                  config={collection.collection || {}}
                  disabled={busy || vgsSubmissionStarted}
                  payerNamesRequired={payerNamesRequired}
                  payerFirstName={payerFirstName}
                  payerLastName={payerLastName}
                  onCardMetadataChange={setCardPreview}
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

            {!hasAttempt && collection?.state === 'collecting' && provider === 'basis_theory' && !basisSubmissionStarted && (
              <div className="payora-vault__provider-box">
                <div className="payora-vault__provider-heading"><ShieldCheck size={17} /> Secure card entry</div>
                <BasisTheoryHostedFields
                  collection={collection}
                  disabled={busy}
                  payerNamesRequired={payerNamesRequired}
                  payerFirstName={payerFirstName}
                  payerLastName={payerLastName}
                  onTokenizationStart={() => {
                    try {
                      const saved = readBasisRecovery(localStorage, checkout.purchaseId);
                      if (!saved || saved.collectionId !== collection.collection_id || saved.tokenizationStarted) return false;
                      saveBasisRecovery(localStorage, checkout.purchaseId, { collectionId: collection.collection_id, tokenizationStarted: true });
                      setBasisSubmissionStarted(true);
                      return true;
                    } catch { return false; }
                  }}
                  onTokenCreated={async tokenId => {
                    if (busyRef.current) throw new Error('Card preparation is still being checked. Try again after status refresh.');
                    busyRef.current = true;
                    setBusy(true);
                    try {
                      const current = await completeVaultCollection(collection.collection_id, checkout, tokenId, { firstName: payerFirstName, lastName: payerLastName });
                      setBasisSubmissionStarted(true);
                      setCollection(current);
                    } finally {
                      busyRef.current = false;
                      setBusy(false);
                    }
                  }}
                  onUncertain={() => { setBasisSubmissionStarted(true); void refreshCollection(); }}
                />
              </div>
            )}
            {!hasAttempt && collection?.state === 'collecting' && provider === 'basis_theory' && basisSubmissionStarted && (
              <div className="payora-vault__state" role="status">Card preparation was started. Check its status before entering another card.</div>
            )}

            {!hasAttempt && collection?.state === 'ready' && provider === 'vgs' && (
              <CardPreview brand={cardPreview.brand} last4={cardPreview.last4} />
            )}

            {!hasAttempt && collection?.state === 'collecting' && provider === 'vgs' && vgsSubmissionStarted && (
              <div className="payora-vault__state" role="status">Card preparation was submitted. We are checking its status; do not submit the card again.</div>
            )}

            {!hasAttempt && collection && ['initializing', 'provisioning', 'uncertain'].includes(collection.state) && (
              <div className="payora-vault__state" role="status">{collection.state === 'uncertain' ? 'We are checking the original card preparation. Do not enter card details again.' : 'Preparing secure card entry…'}</div>
            )}

            {!hasAttempt && collection && ['failed', 'expired', 'revoked', 'consumed', 'unavailable'].includes(collection.state) && (
              <div className="payora-vault__state" role="status">Secure card preparation is {collection.state}. Check its status or contact the merchant before continuing.</div>
            )}
            {!hasAttempt && collection && hasNewVaultCardStarted(checkout.purchaseId, collection.collection_id) && (
              <div className="payora-vault__state" role="status">A replacement card was requested. Check its status before requesting another card.</div>
            )}

            {redirectUrl && <a className="payora-checkout__button" href={redirectUrl} target="_blank" rel="noopener noreferrer">Continue to bank verification <ExternalLink size={16} /></a>}
            {charge?.status === 'requires_action' && !redirectUrl && <p className="payora-vault__error" role="alert">The bank verification action is missing or unsupported. Check payment status before proceeding.</p>}

            {canShowCardAction && <div className="payora-checkout__ready-card" role="status">
              <span className="payora-checkout__ready-card-icon"><CreditCard size={18} /></span>
              <span><strong>Card ready to pay</strong><small>Secure card details are prepared for this checkout.</small></span>
              {collection?.can_enter_new_card && <button type="button" onClick={changeCard} disabled={busy}>Change</button>}
            </div>}

            <div className="payora-vault__actions">
              {canShowCardAction && <button className="payora-checkout__button" type="button" onClick={pay} disabled={busy}>{busy ? <><span className="payora-checkout__spinner" /> Processing…</> : <><LockKeyhole size={16} /> Pay {formatCheckoutAmount(checkout.amount, checkout.currency)}</>}</button>}
              {!hasAttempt && !canShowCardAction && collection?.can_enter_new_card && !hasNewVaultCardStarted(checkout.purchaseId, collection.collection_id) && (collection.state !== 'collecting' || vgsSubmissionStarted || basisSubmissionStarted) && <button className="payora-checkout__text-button" type="button" onClick={changeCard} disabled={busy}>Enter another card</button>}
              {(hasAttempt || collection?.state === 'uncertain' || vgsSubmissionStarted || basisSubmissionStarted || Boolean(error)) && <button className="payora-checkout__text-button payora-checkout__refresh-link" type="button" onClick={refreshCollection} disabled={busy}>{busy ? 'Refreshing payment status…' : 'Having trouble? Refresh payment status'}</button>}
            </div>
            <div className="payora-checkout__card-assurance"><ShieldCheck size={15} /> Card details are encrypted in secure fields and never reach our payment servers.</div>
            <SupportId value={checkout.purchaseId} />
          </section>
          <OrderSummary planName={checkout.planName} features={planFeatures} amount={checkout.amount} unitAmount={checkout.unitAmount} quantity={checkout.quantity} currency={checkout.currency} billingText={billingText} savingsText={savingsText} supportEmail={supportEmail} onChangePlan={!hasAttempt ? onChangePlan : undefined} />
        </div>
      </div>
      {unavailableOpen && <CheckoutUnavailableModal message={error} supportEmail={supportEmail} planName={checkout.planName} paymentMayHaveBeenSubmitted={hasAttempt} onClose={() => setUnavailableOpen(false)} onRetry={hasAttempt ? checkPayment : refreshCollection} retryLabel={hasAttempt ? "Check payment status" : "Refresh secure card setup"} loading={busy} />}
    </div>
  );
};
