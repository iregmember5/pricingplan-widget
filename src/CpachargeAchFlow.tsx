import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Building2, CircleHelp, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { CheckoutHeader, CheckoutProgress, CheckoutUnavailableModal, OrderSummary, SupportId, formatCheckoutAmount } from './CheckoutUI';
import {
  beginCpachargeAchCollection,
  clearCpachargeSubmissionStarted,
  hasCpachargeSubmissionStarted,
  markCpachargeSubmissionStarted,
  submitCpachargeAchPayment,
  type CpachargeAchCharge,
  type CpachargeAchCollection,
} from './cpachargeAchService';
import { getWidgetCheckoutStatus, type WidgetCheckoutIdentity, type WidgetCheckoutSession } from './widgetCheckoutService';

const HOSTED_FIELDS_VERSION = '1.5.3';
const HOSTED_FIELDS_SRC = `https://cdn.affinipay.com/hostedfields/${HOSTED_FIELDS_VERSION}/fieldGen_${HOSTED_FIELDS_VERSION}.js`;
const HOSTED_FIELDS_INTEGRITY = 'sha384-OInNoiApwwsc6xI2N+o4KHZ522+EmLGDTJFLwDEmuUum73mVEuytiQgy1/xpoEJO';

type HostedFieldsState = { isReady?: boolean };
type HostedFieldsInstance = {
  getState: () => unknown;
  getPaymentToken: (formData: Record<string, string>) => Promise<{ id?: unknown }>;
};
type HostedFieldsConfig = {
  publicKey: string;
  fields: Array<{ selector: string; input: { type: string; placeholder?: string; css: Record<string, unknown> } }>;
};
type HostedFieldsApi = {
  initializeFields: (config: HostedFieldsConfig, callback: (state: HostedFieldsState) => void) => HostedFieldsInstance;
};

declare global {
  interface Window {
    AffiniPay?: { HostedFields?: HostedFieldsApi };
  }
}

let hostedFieldsLoader: Promise<void> | null = null;

function loadHostedFields() {
  if (window.AffiniPay?.HostedFields?.initializeFields) return Promise.resolve();
  if (hostedFieldsLoader) return hostedFieldsLoader;
  hostedFieldsLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${HOSTED_FIELDS_SRC}"]`);
    if (existing) {
      if (existing.integrity !== HOSTED_FIELDS_INTEGRITY || existing.crossOrigin !== 'anonymous') {
        reject(new Error('Secure bank fields could not be verified. No bank details were collected.'));
        return;
      }
      existing.addEventListener('load', () => window.AffiniPay?.HostedFields ? resolve() : reject(new Error('Secure bank fields did not initialize.')), { once: true });
      existing.addEventListener('error', () => reject(new Error('Secure bank fields could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = HOSTED_FIELDS_SRC;
    script.integrity = HOSTED_FIELDS_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.addEventListener('load', () => window.AffiniPay?.HostedFields ? resolve() : reject(new Error('Secure bank fields did not initialize.')), { once: true });
    script.addEventListener('error', () => reject(new Error('Secure bank fields could not be loaded.')), { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    hostedFieldsLoader = null;
    throw error;
  });
  return hostedFieldsLoader;
}

type Props = {
  identity: WidgetCheckoutIdentity;
  checkout: WidgetCheckoutSession;
  planFeatures?: string[];
  billingText?: string;
  savingsText?: string;
  supportEmail?: string;
  onCheckoutUpdate: (checkout: WidgetCheckoutSession) => void;
  onSuccess: (reference: string, checkout: WidgetCheckoutSession) => void;
  onBack: () => void;
  onChangePlan: () => void;
};

function safeApiMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return message || 'We could not confirm this step. Keep this checkout and check its status before trying again.';
}

export const CpachargeAchFlow: React.FC<Props> = ({
  identity, checkout, planFeatures = [], billingText, savingsText, supportEmail,
  onCheckoutUpdate, onSuccess, onBack, onChangePlan,
}) => {
  const fieldId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const accountSelector = `#payora-ach-account-${fieldId}`;
  const routingSelector = `#payora-ach-routing-${fieldId}`;
  const hostedFieldsRef = useRef<HostedFieldsInstance | null>(null);
  const inFlightRef = useRef(false);
  const [collection, setCollection] = useState<CpachargeAchCollection | null>(null);
  const [collectionExpired, setCollectionExpired] = useState(false);
  const [latestCheckout, setLatestCheckout] = useState(checkout);
  const [charge, setCharge] = useState<CpachargeAchCharge | null>(null);
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [hostedFieldsReady, setHostedFieldsReady] = useState(false);
  const [hostedFieldsError, setHostedFieldsError] = useState(false);
  const [hostedFieldsRetry, setHostedFieldsRetry] = useState(0);
  const [error, setError] = useState('');
  const [holderType, setHolderType] = useState<'individual' | 'business'>('individual');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [givenName, setGivenName] = useState('');
  const [surname, setSurname] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [consent, setConsent] = useState(false);
  const [submissionLocked, setSubmissionLocked] = useState(() => hasCpachargeSubmissionStarted(checkout.purchaseId));
  const [recoveryOnly, setRecoveryOnly] = useState(() => hasCpachargeSubmissionStarted(checkout.purchaseId));
  const [unavailableOpen, setUnavailableOpen] = useState(false);

  const currentPaymentStatus = charge?.status || latestCheckout.payment?.status || latestCheckout.status;
  const attemptExists = Boolean(submissionLocked || latestCheckout.attemptId || checkout.attemptId || latestCheckout.payment
    || ['submitting', 'processing', 'uncertain', 'requires_action', 'succeeded', 'failed', 'cancelled'].includes(latestCheckout.status));
  const recoveryRequired = Boolean(attemptExists || recoveryOnly || latestCheckout.status !== 'ready' || checkout.status !== 'ready');
  const identityFormValid = holderType === 'business' ? Boolean(businessName.trim()) : Boolean(givenName.trim() && surname.trim());
  const canSubmit = Boolean(collection && hostedFieldsReady && consent && identityFormValid
    && latestCheckout.status === 'ready' && latestCheckout.canSubmit && latestCheckout.purchaseToken
    && !collection.submitted && !collectionExpired && !attemptExists && !busy && !submissionLocked);

  const refreshOriginalStatus = async () => {
    const updated = await getWidgetCheckoutStatus(identity);
    setLatestCheckout(updated);
    onCheckoutUpdate(updated);
    const attemptRecorded = Boolean(updated.attemptId || updated.payment
      || ['submitting', 'processing', 'uncertain', 'requires_action', 'succeeded', 'failed', 'cancelled'].includes(updated.status));
    if (attemptRecorded) {
      setSubmissionLocked(true);
      try { markCpachargeSubmissionStarted(checkout.purchaseId); } catch { /* Recovery remains in-memory for this page. */ }
    }
    if (updated.status !== 'ready') setRecoveryOnly(true);
    const receiptConfirmed = updated.payment?.status === 'succeeded' && updated.payment.receipt_available === true;
    if (receiptConfirmed) {
      clearCpachargeSubmissionStarted(checkout.purchaseId);
      onSuccess(String(updated.payment?.transaction_id || updated.attemptId || updated.purchaseId), updated);
    }
    return updated;
  };

  const recover = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await refreshOriginalStatus();
      if (updated.status === 'ready' && !updated.attemptId && !updated.payment && submissionLocked) {
        setError('The payment service has not recorded an attempt yet. For safety, this checkout is locked after submission began. Contact support with your Support ID before proceeding.');
      }
    } catch (err) {
      setError(safeApiMessage(err));
    } finally { setBusy(false); }
  };

  const prepareCollection = async () => {
    setInitializing(true);
    setError('');
    try {
      const next = await beginCpachargeAchCollection(latestCheckout);
      setCollection(next);
      if (next.submitted) {
        setSubmissionLocked(true);
        setRecoveryOnly(true);
        try { markCpachargeSubmissionStarted(checkout.purchaseId); } catch { /* Existing server submission still stays locked. */ }
        await refreshOriginalStatus();
      }
    } catch (err) {
      setError(safeApiMessage(err));
    } finally { setInitializing(false); }
  };

  useEffect(() => {
    if (recoveryOnly || submissionLocked || checkout.attemptId || checkout.payment || checkout.status !== 'ready') {
      setInitializing(false);
      setRecoveryOnly(true);
      void recover();
    } else {
      void prepareCollection();
    }
    // This first render resumes an existing operation or prepares the same scoped collection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const termsFingerprint = collection
    ? `${collection.authorization_version}|${collection.authorization_text}|${collection.amount}|${collection.currency}`
    : '';
  useEffect(() => { setConsent(false); }, [termsFingerprint]);

  useEffect(() => {
    if (!collection) { setCollectionExpired(false); return undefined; }
    const expiresAt = Date.parse(collection.expires_at);
    const delay = expiresAt - Date.now();
    if (!Number.isFinite(expiresAt) || delay <= 0) {
      setCollectionExpired(true);
      return undefined;
    }
    setCollectionExpired(false);
    const timeout = window.setTimeout(() => setCollectionExpired(true), delay);
    return () => window.clearTimeout(timeout);
  }, [collection]);

  useEffect(() => {
    if (!collection || recoveryOnly || submissionLocked) return undefined;
    let active = true;
    setHostedFieldsReady(false);
    const css = {
      color: '#17243a', 'font-family': 'Arial, sans-serif', 'font-size': '16px',
      'font-weight': '400', height: '48px', padding: '12px 13px', width: '100%',
      'box-sizing': 'border-box', border: '0', outline: '0', 'background-color': '#ffffff',
      '::placeholder': { color: '#7b8798' },
    };
    void loadHostedFields().then(() => {
      if (!active || !window.AffiniPay?.HostedFields) return;
      hostedFieldsRef.current = window.AffiniPay.HostedFields.initializeFields({
        publicKey: collection.public_key,
        fields: [
          { selector: accountSelector, input: { type: 'bank_account_number', placeholder: 'Bank account number', css } },
          { selector: routingSelector, input: { type: 'routing_number', placeholder: 'Routing number', css } },
        ],
      }, (state) => {
        if (active) setHostedFieldsReady(state?.isReady === true);
      });
    }).catch((err) => {
      if (active) {
        setHostedFieldsError(true);
        setError(safeApiMessage(err));
      }
    });
    return () => { active = false; hostedFieldsRef.current = null; };
  }, [accountSelector, collection, hostedFieldsRetry, recoveryOnly, routingSelector, submissionLocked]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlightRef.current || !canSubmit || !hostedFieldsRef.current || !collection) return;
    if (Date.parse(collection.expires_at) <= Date.now()) {
      setCollectionExpired(true);
      setError('This secure bank form has expired. No debit was submitted. Contact the merchant for help.');
      return;
    }
    inFlightRef.current = true;
    setBusy(true);
    setError('');
    try {
      const providerFormData: Record<string, string> = { ...collection.form_data };
      const addIfMissing = (key: string, value: string) => {
        if (!Object.prototype.hasOwnProperty.call(providerFormData, key)) providerFormData[key] = value;
      };
      addIfMissing('account_holder_type', holderType);
      addIfMissing('account_type', accountType);
      if (holderType === 'business') addIfMissing('name', businessName.trim());
      else {
        addIfMissing('given_name', givenName.trim());
        addIfMissing('surname', surname.trim());
      }

      let tokenResult: { id?: unknown };
      try {
        tokenResult = await hostedFieldsRef.current.getPaymentToken(providerFormData);
      } catch {
        throw new Error('Secure bank details could not be prepared. Check the fields and try again. No debit was submitted.');
      }
      const providerToken = typeof tokenResult?.id === 'string' ? tokenResult.id : '';
      if (!providerToken) throw new Error('The bank provider did not return a payment token. No debit was submitted.');
      if (Date.parse(collection.expires_at) <= Date.now()) {
        setCollectionExpired(true);
        throw new Error('This secure bank form expired before payment could be submitted.');
      }

      // A boolean session marker fences refresh/double-click recovery. It is set
      // immediately before the one financial POST; the provider token is never stored.
      try { markCpachargeSubmissionStarted(checkout.purchaseId); }
      catch { throw new Error('This browser cannot safely protect the payment attempt. No debit was submitted. Use a regular browser tab or contact support.'); }
      setSubmissionLocked(true);
      setRecoveryOnly(true);
      let result: CpachargeAchCharge;
      try {
        result = await submitCpachargeAchPayment(latestCheckout, collection, providerToken);
      } catch (err) {
        await refreshOriginalStatus().catch(() => undefined);
        throw err;
      }
      setCharge(result);
      if (result.attempt_id || result.status !== 'ready') {
        setLatestCheckout((previous) => ({ ...previous, status: result.status, attemptId: result.attempt_id || previous.attemptId }));
      }
      if (result.status === 'succeeded' && result.receipt_available === true) {
        onSuccess(String(result.transaction_id || result.attempt_id || result.purchase_id), latestCheckout);
      }
    } catch (err) {
      setError(safeApiMessage(err));
      if ((err as any)?.status >= 500 || (err as any)?.status === 0) setUnavailableOpen(true);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  const pendingCopy = currentPaymentStatus === 'uncertain'
    ? 'We’re checking the original bank payment. Please don’t submit another payment.'
    : currentPaymentStatus === 'failed' || currentPaymentStatus === 'cancelled'
      ? 'This bank payment did not complete. This purchase cannot be submitted again; contact the merchant for help.'
      : currentPaymentStatus === 'succeeded' && latestCheckout.payment?.receipt_available !== true
        ? 'Your bank payment is still awaiting confirmed settlement. No paid receipt is available.'
        : ['submitting', 'processing', 'succeeded'].includes(currentPaymentStatus)
          ? 'Your bank debit was submitted for processing. Settlement is not confirmed, so no paid receipt is available.'
          : 'This checkout cannot accept a bank payment right now. Check its status or contact the merchant.';

  return (
    <div className="payora-checkout payora-checkout--payment payora-checkout--ach">
      <div className="payora-checkout__container">
        <CheckoutHeader />
        <CheckoutProgress active={2} />
        <div className="payora-checkout__grid">
          <section className="payora-checkout__main">
            <button className="payora-checkout__back" type="button" onClick={recoveryRequired ? recover : onBack} disabled={busy}>
              {recoveryRequired ? <RefreshCw size={15} /> : <ArrowLeft size={15} />} {recoveryRequired ? 'Check payment status' : 'Back to review'}
            </button>
            <div className="payora-checkout__eyebrow">One-time bank payment{checkout.collection?.environment === 'sandbox' ? ' · Sandbox' : ''}</div>
            <h1 className="payora-checkout__title">Pay {formatCheckoutAmount(latestCheckout.amount, latestCheckout.currency)}</h1>
            <p className="payora-checkout__description">Use your bank account for this one-time payment. Your bank details stay in secure hosted fields.</p>
            {error && !unavailableOpen && <div className="payora-checkout__alert" role="alert">{error}</div>}

            {recoveryRequired ? (
              <div className="payora-ach__status" role="status" aria-live="polite">
                <span className="payora-ach__status-icon"><CircleHelp size={20} /></span>
                <div><strong>{attemptExists ? (currentPaymentStatus === 'failed' || currentPaymentStatus === 'cancelled' ? 'Payment not completed' : 'Bank payment status') : 'Checkout unavailable'}</strong><p>{pendingCopy}</p></div>
              </div>
            ) : (
              <>
                {initializing && <div className="payora-ach__loading" role="status"><span className="payora-checkout__spinner" /> Preparing secure bank fields…</div>}
                {collection && !recoveryOnly && <form className="payora-ach__form" onSubmit={submit}>
                  {collectionExpired && <div className="payora-checkout__alert" role="alert">This secure bank form has expired. No debit was submitted. Contact the merchant before starting another checkout.</div>}
                  <div className="payora-ach__group">
                    <h2>Bank account</h2>
                    <div className="payora-ach__field"><label htmlFor={accountSelector.slice(1)}>Account number</label><div id={accountSelector.slice(1)} className="payora-ach__hosted-field" /></div>
                    <div className="payora-ach__field"><label htmlFor={routingSelector.slice(1)}>Routing number</label><div id={routingSelector.slice(1)} className="payora-ach__hosted-field" /></div>
                    <div className="payora-ach__row">
                      <fieldset><legend>Account holder</legend>
                        <label className="payora-ach__choice"><input type="radio" name={`holder-${fieldId}`} value="individual" checked={holderType === 'individual'} onChange={() => setHolderType('individual')} /> Individual</label>
                        <label className="payora-ach__choice"><input type="radio" name={`holder-${fieldId}`} value="business" checked={holderType === 'business'} onChange={() => setHolderType('business')} /> Business</label>
                      </fieldset>
                      <fieldset><legend>Account type</legend>
                        <label className="payora-ach__choice"><input type="radio" name={`account-${fieldId}`} value="checking" checked={accountType === 'checking'} onChange={() => setAccountType('checking')} /> Checking</label>
                        <label className="payora-ach__choice"><input type="radio" name={`account-${fieldId}`} value="savings" checked={accountType === 'savings'} onChange={() => setAccountType('savings')} /> Savings</label>
                      </fieldset>
                    </div>
                    {holderType === 'individual' ? <div className="payora-ach__row">
                      <div className="payora-ach__field"><label htmlFor={`payora-ach-given-${fieldId}`}>First name</label><input id={`payora-ach-given-${fieldId}`} autoComplete="given-name" value={givenName} onChange={(event) => setGivenName(event.target.value)} required /></div>
                      <div className="payora-ach__field"><label htmlFor={`payora-ach-surname-${fieldId}`}>Last name</label><input id={`payora-ach-surname-${fieldId}`} autoComplete="family-name" value={surname} onChange={(event) => setSurname(event.target.value)} required /></div>
                    </div> : <div className="payora-ach__field"><label htmlFor={`payora-ach-business-${fieldId}`}>Business name</label><input id={`payora-ach-business-${fieldId}`} autoComplete="organization" value={businessName} onChange={(event) => setBusinessName(event.target.value)} required /></div>}
                    <p className="payora-ach__secure-note"><ShieldCheck size={15} /> Account and routing numbers are entered in secure provider-hosted fields.</p>
                  </div>

                  <div className="payora-ach__authorization">
                    <div className="payora-ach__authorization-heading"><Building2 size={17} /> Authorization</div>
                    <p>{collection.authorization_text}</p>
                    <div className="payora-ach__authorization-total"><span>One-time debit amount</span><strong>{formatCheckoutAmount(collection.amount, collection.currency)}</strong></div>
                  </div>
                  <label className="payora-ach__consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> <span>I have read and agree to the authorization above.</span></label>
                  {!canSubmit && !collectionExpired && <p className="payora-checkout__button-hint">Complete the bank fields and required account details, then accept the authorization to continue.</p>}
                  <button className="payora-checkout__button" type="submit" disabled={!canSubmit || busy || recoveryOnly}>
                    {busy ? <><span className="payora-checkout__spinner" /> Submitting securely…</> : <><LockKeyhole size={16} /> Submit Payment · {formatCheckoutAmount(collection.amount, collection.currency)}</>}
                  </button>
                  <p className="payora-ach__disclaimer">Submitting authorizes a single bank debit. Bank processing and settlement can take additional time.</p>
                </form>}
                {!collection && !initializing && <button className="payora-checkout__text-button" type="button" onClick={prepareCollection} disabled={busy}>Retry secure bank setup</button>}
              </>
            )}

            {collection && hostedFieldsError && !recoveryRequired && <button className="payora-checkout__text-button" type="button" onClick={() => { setHostedFieldsError(false); setError(''); setHostedFieldsRetry((value) => value + 1); }} disabled={busy}>Retry secure bank fields</button>}
            <div className="payora-checkout__card-assurance"><ShieldCheck size={15} /> No saved bank details. No recurring debit.</div>
            <SupportId value={checkout.purchaseId} />
          </section>
          <OrderSummary planName={checkout.planName} features={planFeatures} amount={checkout.amount} unitAmount={checkout.unitAmount} quantity={checkout.quantity} currency={checkout.currency} billingText={billingText || 'One-time bank payment'} savingsText={savingsText} supportEmail={supportEmail} onChangePlan={!recoveryRequired ? onChangePlan : undefined} processorLabel="CPACharge" />
        </div>
      </div>
      {unavailableOpen && <CheckoutUnavailableModal message={error} supportEmail={supportEmail} planName={checkout.planName} paymentMayHaveBeenSubmitted={attemptExists} onClose={() => setUnavailableOpen(false)} onRetry={recoveryRequired ? recover : prepareCollection} loading={busy} />}
    </div>
  );
};
