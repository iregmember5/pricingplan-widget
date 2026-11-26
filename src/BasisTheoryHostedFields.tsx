import { useEffect, useId, useRef, useState } from 'react';
import type { BasisTheorySDK, Element as BasisElement, ExpiryElement } from '@basis-theory/web-elements';
import { basisTheoryTokenRequest, validateBasisTheoryCardConfiguration } from './basisTheoryContract';
import type { VaultCollection } from './vaultCheckoutService';

type HostedElement = BasisElement;
type Props = {
  collection: VaultCollection;
  disabled: boolean;
  onTokenizationStart: () => boolean;
  onTokenCreated: (id: string) => Promise<void>;
  onUncertain: () => void;
  payerNamesRequired?: boolean;
  payerFirstName?: string;
  payerLastName?: string;
};

/** Only provider-hosted iframes receive card number, expiry, or CVC. */
export function BasisTheoryHostedFields({ collection, disabled, onTokenizationStart, onTokenCreated, onUncertain, payerNamesRequired = false, payerFirstName = '', payerLastName = '' }: Props) {
  const localId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const numberRef = useRef<HTMLDivElement>(null);
  const expiryRef = useRef<HTMLDivElement>(null);
  const cvvRef = useRef<HTMLDivElement>(null);
  const instance = useRef<{ bt: BasisTheorySDK; number: HostedElement; expiry: ExpiryElement; cvv: HostedElement } | null>(null);
  const starting = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let elements: HostedElement[] = [];
    setReady(false); setError('');
    void (async () => {
      try {
        const config = validateBasisTheoryCardConfiguration(collection);
        const { default: BasisTheory } = await import('@basis-theory/web-elements');
        if (!active || !numberRef.current || !expiryRef.current || !cvvRef.current) return;
        const bt = BasisTheory(config.publishableKey, { apiBaseUrl: config.apiBaseUrl, debug: false });
        const number = bt.createElement('cardNumber');
        const expiry = bt.createElement('expiry');
        const cvv = bt.createElement('cvv');
        elements = [number, expiry, cvv];
        await Promise.all([number.mount(numberRef.current), expiry.mount(expiryRef.current), cvv.mount(cvvRef.current)]);
        if (!active) { elements.forEach(element => element.unmount()); return; }
        instance.current = { bt, number, expiry, cvv };
        setReady(true);
      } catch {
        if (active) setError('Secure card entry could not be initialized. No card details were submitted.');
      }
    })();
    return () => { active = false; instance.current = null; elements.forEach(element => element.unmount()); };
  }, [collection.collection_id]);

  const submit = async () => {
    if (!instance.current || starting.current || disabled || !ready) return;
    const firstName = payerFirstName.trim();
    const lastName = payerLastName.trim();
    if (payerNamesRequired && (!firstName || !lastName || firstName.length > 64 || lastName.length > 64)) {
      setError('Enter a first and last name, each no longer than 64 characters.');
      return;
    }
    if (!navigator.locks?.request) { setError('Secure card entry requires browser support for checkout recovery.'); return; }
    starting.current = true; setBusy(true); setError('');
    try {
      await navigator.locks.request(`payora-basis-tokenize:${collection.collection_id}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('locked');
        const current = instance.current;
        if (!current) throw new Error('unavailable');
        const { tokenOptions } = validateBasisTheoryCardConfiguration(collection);
        // Record before sending: a lost response can never trigger automatic re-tokenization.
        if (!onTokenizationStart()) throw new Error('recovery unavailable');
        const request = basisTheoryTokenRequest(tokenOptions, { number: current.number, expiration_month: current.expiry, expiration_year: current.expiry, cvc: current.cvv });
        const token = await current.bt.tokens.create(request);
        if (token.id !== tokenOptions.id) throw new Error('mismatched token');
        await onTokenCreated(token.id);
      });
    } catch {
      setError('Card preparation could not be confirmed. Check its status before trying another card.');
      onUncertain();
    } finally { starting.current = false; setBusy(false); }
  };

  return <div className="payora-vgs-form" aria-busy={busy}>
    <div className="payora-vgs-field"><label htmlFor={`basis-number-${localId}`}>Card number</label><div id={`basis-number-${localId}`} ref={numberRef} className="payora-vgs-field__frame" /></div>
    <div className="payora-vgs-field-row">
      <div className="payora-vgs-field"><label htmlFor={`basis-expiry-${localId}`}>Expiration date</label><div id={`basis-expiry-${localId}`} ref={expiryRef} className="payora-vgs-field__frame" /></div>
      <div className="payora-vgs-field"><label htmlFor={`basis-cvv-${localId}`}>Security code</label><div id={`basis-cvv-${localId}`} ref={cvvRef} className="payora-vgs-field__frame" /></div>
    </div>
    {error && <p className="payora-vault__error" role="alert">{error}</p>}
    <button type="button" className="payora-checkout__button" disabled={disabled || !ready || busy} onClick={() => void submit()}>{busy ? 'Preparing card…' : 'Continue'}</button>
  </div>;
}
