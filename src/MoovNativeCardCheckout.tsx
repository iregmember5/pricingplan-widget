import React, { useEffect, useId, useRef, useState } from 'react';
import {
  beginMoovCollection, completeMoovCollection, payWithMoovCollection, readMoovRecovery, saveMoovRecovery,
  type MoovCollection, type MoovPayment, type MoovPurchase,
} from './moovNativeCheckout';

const scriptUrl = 'https://js.moov.io/v1?min=v0.6.12';
const dropNames = ['moov-form', 'moov-text-input', 'moov-card-number-input', 'moov-expiration-date-input', 'moov-card-security-code-input'];
let drops: Promise<unknown> | undefined;

function loadDrops() {
  if (dropNames.every((name) => customElements.get(name))) return Promise.resolve();
  if (!drops) {
    drops = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = window.setTimeout(() => fail(), 15_000);
      const fail = () => {
        window.clearTimeout(timer);
        script.remove();
        reject(new Error('Moov secure fields could not be loaded.'));
      };
      script.src = scriptUrl;
      script.async = true;
      script.onerror = fail;
      Promise.all(dropNames.map((name) => customElements.whenDefined(name))).then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      }, fail);
      document.head.appendChild(script);
    }).catch((cause) => { drops = undefined; throw cause; });
  }
  return drops;
}

type DropForm = HTMLElement & {
  requestHeaders: Record<string, string>;
  requestBody: Record<string, unknown>;
  requestSubmit(): void;
  onSuccess?: (response: Response) => void;
  onError?: (response: Response) => void;
  onReportValidity?: (valid: boolean) => void;
};

const inputClass = 'payora-checkout__input';
const buttonClass = 'payora-checkout__button';

export function MoovNativeCardCheckout({ apiRoot, purchase, onPayment, onSubmissionStart, onSubmissionUncertain }: {
  apiRoot: string;
  purchase: MoovPurchase;
  onPayment: (payment: MoovPayment) => void;
  onSubmissionStart?: () => void;
  onSubmissionUncertain?: () => void;
}) {
  const id = useId().replace(/[^-\w]/g, '');
  const busy = useRef(false);
  const mounted = useRef(false);
  const drop = useRef<DropForm | null>(null);
  const hostedFields = useRef<HTMLDivElement | null>(null);
  const [checkoutExpired, setCheckoutExpired] = useState(() => !(Date.parse(purchase.expiresAt) > Date.now()));
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [collection, setCollection] = useState<MoovCollection | null>(null);
  const [cardId, setCardId] = useState(() => readMoovRecovery(purchase.purchaseId).cardId || '');
  const [working, setWorking] = useState(false);
  const [locked, setLocked] = useState(() => Boolean(readMoovRecovery(purchase.purchaseId).submitted));
  const [dropReady, setDropReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState('');
  const secureOrigin = window.location.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const remaining = Date.parse(purchase.expiresAt) - Date.now();
    if (!(remaining > 0)) { setCheckoutExpired(true); return; }
    setCheckoutExpired(false);
    const timer = window.setTimeout(() => setCheckoutExpired(true), Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [purchase.expiresAt]);

  useEffect(() => {
    const host = hostedFields.current;
    if (!collection || collection.ready || cardId || locked || checkoutExpired || !host || !collection.oauth_token) return;
    let active = true;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, Date.parse(collection.expires_at) - Date.now()));
    void loadDrops().then(() => {
      if (!active) return;
      const name = 'secure-moov-' + id;
      const form = document.createElement('moov-form') as DropForm;
      form.setAttribute('name', name);
      form.setAttribute('method', 'POST');
      form.setAttribute('action', '/accounts/' + collection.payer_account_id + '/cards');
      form.requestHeaders = {
        Authorization: 'Bearer ' + collection.oauth_token,
        'Content-Type': 'application/json',
        'X-Moov-Version': 'v2026.10.00',
      };
      form.requestBody = { merchantAccountID: collection.merchant_account_id, cardOnFile: false };
      const unlock = () => { busy.current = false; if (active) setWorking(false); };
      form.onReportValidity = (valid) => { if (!valid) unlock(); };
      const keepLinkedCard = (card: unknown) => {
        if (!active || typeof card !== 'string' || !card) return false;
        saveMoovRecovery(purchase.purchaseId, { collectionId: collection.collection_id, cardId: card });
        setCardId(card);
        setCollection({ ...collection, oauth_token: undefined });
        return true;
      };
      form.onError = async (response) => {
        try {
          if (!active) return;
          if (response?.status === 409 && keepLinkedCard((await response.json())?.existingCardID)) return;
          if (!active) return;
          if (response?.status === 401 || response?.status === 403) setExpired(true);
          setError('Moov could not link the card. Check the card details or refresh secure fields.');
        } catch {
          if (active) setError('The card link could not be confirmed. Contact the business with your checkout reference.');
        } finally { unlock(); }
      };
      form.onSuccess = async (response) => {
        try {
          const data = await response.json();
          if (!keepLinkedCard(data?.cardID) && active) throw new Error();
        } catch {
          if (active) setError('The card link could not be confirmed. Contact the business with your checkout reference.');
        } finally { unlock(); }
      };
      const fields = [
        { tag: 'moov-text-input', name: 'holderName', label: 'Name on card', autocomplete: 'cc-name', placeholder: 'Full name' },
        { tag: 'moov-card-number-input', name: 'cardNumber', label: 'Card number', autocomplete: 'cc-number', placeholder: '1234  5678  9012  3456' },
        { tag: 'moov-expiration-date-input', name: 'expiration', label: 'Expiration date', autocomplete: 'cc-exp', placeholder: 'MM / YY', compact: true },
        { tag: 'moov-card-security-code-input', name: 'cardCvv', label: 'Security code', autocomplete: 'cc-csc', placeholder: 'CVC', compact: true },
        { tag: 'moov-text-input', name: 'billingAddress.postalCode', label: 'Billing ZIP code', autocomplete: 'postal-code', placeholder: 'ZIP or postal code' },
      ];
      host.appendChild(form);
      for (const config of fields) {
        const container = document.createElement('div');
        container.className = config.compact ? 'payora-moov__group payora-moov__group--compact' : 'payora-moov__group';
        const label = document.createElement('label');
        label.textContent = config.label;
        const fieldId = `${name}-${config.name.replace(/[^A-Za-z0-9_-]/g, '-')}`;
        label.htmlFor = fieldId;
        const field = document.createElement(config.tag) as HTMLElement & { inputStyle?: Record<string, string> };
        field.id = fieldId;
        field.setAttribute('formname', name);
        field.setAttribute('name', config.name);
        field.setAttribute('required', '');
        field.setAttribute('autocomplete', config.autocomplete);
        field.setAttribute('placeholder', config.placeholder);
        field.setAttribute('aria-label', config.label);
        field.className = 'payora-moov__input';
        field.inputStyle = { fontSize: '16px', color: '#1d2a40', lineHeight: '1.4' };
        container.append(label, field);
        host.appendChild(container);
      }
      drop.current = form;
      setDropReady(true);
    }).catch(() => { if (active) { setError('Moov secure fields could not be loaded.'); setExpired(true); } });
    return () => {
      active = false;
      window.clearTimeout(timer);
      const form = drop.current;
      if (form) {
        form.requestHeaders = {};
        form.onSuccess = form.onError = form.onReportValidity = undefined;
      }
      drop.current = null;
      host.replaceChildren();
    };
  }, [cardId, checkoutExpired, collection, id, locked, purchase.purchaseId]);

  async function run(action: () => Promise<void>, fallback: string) {
    if (busy.current || locked || !secureOrigin) return;
    busy.current = true;
    setWorking(true);
    setError('');
    try { await action(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : fallback); }
    finally { busy.current = false; if (mounted.current) setWorking(false); }
  }

  function begin() {
    void run(async () => {
      const data = await beginMoovCollection(apiRoot, purchase, firstName, lastName);
      if (!mounted.current) return;
      saveMoovRecovery(purchase.purchaseId, { collectionId: data.collection_id });
      setExpired(false);
      setDropReady(false);
      setCollection(data.ready ? { ...data, oauth_token: undefined } : data);
    }, 'Secure card setup could not be confirmed. Retry this checkout or contact the business.');
  }

  function verify() {
    if (!collection || !cardId) return;
    void run(async () => {
      await completeMoovCollection(apiRoot, purchase, collection.collection_id, cardId);
      if (mounted.current) setCollection({ ...collection, ready: true });
    }, 'Could not verify the linked card. Check the same card again.');
  }

  function link() {
    if (busy.current || !drop.current || expired || !collection || !(Date.parse(collection.expires_at) > Date.now())) {
      if (collection && !(Date.parse(collection.expires_at) > Date.now())) setExpired(true);
      return;
    }
    busy.current = true;
    setWorking(true);
    setError('');
    try { drop.current.requestSubmit(); }
    catch {
      busy.current = false;
      setWorking(false);
      setError('Moov could not link this card.');
    }
  }

  function pay() {
    if (!collection?.ready) return;
    void run(async () => {
      try {
        const result = await payWithMoovCollection(apiRoot, purchase, collection.collection_id, onSubmissionStart);
        if (mounted.current) onPayment(result);
      } catch {
        if (mounted.current && readMoovRecovery(purchase.purchaseId).submitted) onSubmissionUncertain?.();
        throw new Error('The payment result could not be confirmed. Check the original payment status before paying again.');
      } finally {
        if (mounted.current) setLocked(Boolean(readMoovRecovery(purchase.purchaseId).submitted));
      }
    }, 'Check the original payment status.');
  }

  if (!secureOrigin) return <p role="alert">Moov card collection requires a registered HTTPS checkout page.</p>;
  if (locked) return <p role="status">Check the original payment status before paying again.</p>;
  if (checkoutExpired) return <p role="alert">This checkout has expired. Check its status before continuing.</p>;

  return <section className="mt-4 space-y-4" aria-label="Secure Moov card payment" aria-busy={working}>
    {!collection && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">First name<input className={inputClass} autoComplete="given-name" maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={working} /></label>
        <label className="text-sm font-medium">Last name<input className={inputClass} autoComplete="family-name" maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={working} /></label>
      </div>
      <button className={buttonClass} type="button" disabled={working || !firstName.trim() || !lastName.trim()} onClick={begin}>Continue to secure card entry</button>
    </>}
    {collection && !collection.ready && !cardId && <>
      <div className="payora-moov__fields" ref={hostedFields} />
      {expired
        ? <button className={buttonClass} type="button" disabled={working} onClick={begin}>Refresh secure card fields</button>
        : <button className={buttonClass} type="button" disabled={working || !dropReady} onClick={link}>{dropReady ? 'Link card securely' : 'Loading secure fields…'}</button>}
    </>}
    {collection && !collection.ready && cardId && (
      <button className={buttonClass} type="button" disabled={working} onClick={verify}>Verify linked card</button>
    )}
    {collection?.ready && <button className={buttonClass} type="button" disabled={working} onClick={pay}>Pay {purchase.amount} {purchase.currency}</button>}
    {working && <p role="status">Waiting for secure payment service…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
