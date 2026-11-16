import React, { useEffect, useId, useRef, useState } from 'react';

// The backend handoff returns vault_id/environment/submit_path and uses the
// classic inbound-proxy form.submit contract. The current VGS script is 4.0.1.
// Its create() compatibility API is deprecated but still documented; the
// preferred session() API needs formId/authHandler absent from this contract.
const VGS_COLLECT_VERSION = '4.0.1';
const VGS_COLLECT_SRC = `https://js.verygoodvault.com/vgs-collect/${VGS_COLLECT_VERSION}/vgs-collect.js`;
const VGS_COLLECT_INTEGRITY = 'sha384-Sr5xwyR0H5rcDXa7/iDJDM3qBBvtHuR97A8ELbd+DFBDi32Caf72to9UVqvI8R95';

type VgsField = { promise?: Promise<unknown>; loadingState?: string };
type VgsForm = {
  SERIALIZERS: {
    separate: (options: { monthName: string; yearName: string }) => unknown;
  };
  field: (selector: string, options: Record<string, unknown>) => VgsField;
  submit: (
    path: string,
    options: Record<string, unknown>,
    responseCallback: (status: number, response: unknown) => void,
    validationCallback: (errors: unknown) => void,
  ) => void;
  unmount?: () => void;
};
type VgsApi = { create: (vaultId: string, environment: string, stateCallback: (state: any) => void) => VgsForm };

declare global {
  interface Window { VGSCollect?: VgsApi }
}

let collectScriptPromise: Promise<void> | null = null;

function loadVgsCollect(): Promise<void> {
  if (collectScriptPromise) return collectScriptPromise;

  collectScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${VGS_COLLECT_SRC}"]`);
    if (window.VGSCollect?.create) {
      if (existing?.integrity === VGS_COLLECT_INTEGRITY && existing.crossOrigin === 'anonymous') resolve();
      else reject(new Error('An unverified VGS script is already present.'));
      return;
    }
    if (existing && (existing.integrity !== VGS_COLLECT_INTEGRITY || existing.crossOrigin !== 'anonymous')) {
      reject(new Error('The secure card library integrity check did not match.'));
      return;
    }
    if (existing) {
      reject(new Error('The secure card library is already loading but is not ready. Reload checkout before continuing.'));
      return;
    }
    const script = document.createElement('script');
    script.src = VGS_COLLECT_SRC;
    script.integrity = VGS_COLLECT_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.async = true;
    const onLoad = () => window.VGSCollect?.create
      ? resolve()
      : reject(new Error('The secure card library did not initialize.'));
    const onError = () => reject(new Error('The secure card library could not be loaded.'));
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    collectScriptPromise = null;
    throw error;
  });
  return collectScriptPromise;
}

type FieldValidity = { number_alias: boolean; expiry: boolean; cvc_alias: boolean; expiryHint: string };

function readFieldValidity(state: any): FieldValidity {
  const fields = state && typeof state === 'object' ? state : {};
  return {
    number_alias: fields.number_alias?.isValid === true,
    expiry: fields.expiry?.isValid === true,
    cvc_alias: fields.cvc_alias?.isValid === true,
    // VGS exposes generic field errorMessages in its state object. Map only
    // known, non-sensitive messages; never render or log field contents.
    expiryHint: Array.isArray(fields.expiry?.errorMessages)
      ? fields.expiry.errorMessages.some((message: unknown) => message === 'is required')
        ? 'Enter the expiration date.'
        : fields.expiry.errorMessages.some((message: unknown) => message === 'is not a valid expiration date')
          ? 'Enter a valid, unexpired expiration date.'
          : ''
      : '',
  };
}

function safeSubmitPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
    || value.includes('://') || value.includes('?') || value.includes('#')) return null;
  return value;
}

export function VgsHostedFields({
  config,
  disabled = false,
  onSubmitStart,
  onSubmitFinished,
  onValidationFailure,
}: {
  config: Record<string, any>;
  disabled?: boolean;
  onSubmitStart: () => boolean;
  onSubmitFinished: () => void;
  onValidationFailure: () => void;
}) {
  const localId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const formRef = useRef<VgsForm | null>(null);
  const mountedRef = useRef(false);
  const submittedRef = useRef(false);
  const [fieldsReady, setFieldsReady] = useState(false);
  const [fieldValidity, setFieldValidity] = useState<FieldValidity>({
    number_alias: false,
    expiry: false,
    cvc_alias: false,
    expiryHint: '',
  });
  const fieldsValid = fieldValidity.number_alias && fieldValidity.expiry && fieldValidity.cvc_alias;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const vaultId = typeof config.vault_id === 'string' ? config.vault_id : '';
    const environment = typeof config.environment === 'string' ? config.environment : '';
    const submitPath = safeSubmitPath(config.submit_path);
    if (!/^tnt[a-z0-9]+$/i.test(vaultId) || !/^(sandbox|live(?:-[a-z0-9-]+)?)$/.test(environment) || !submitPath) {
      setError('The payment service has not configured secure VGS card entry. No card details were collected.');
      return () => { active = false; mountedRef.current = false; };
    }

    void loadVgsCollect().then(async () => {
      if (!active || !window.VGSCollect?.create) return;
      const form = window.VGSCollect.create(vaultId, environment, (state) => {
        if (active) setFieldValidity(readFieldValidity(state));
      });
      formRef.current = form;
      const inputCss = {
        color: '#17243a', 'font-size': '16px', 'font-family': 'Arial, sans-serif',
        'line-height': '22px', 'padding': '12px 13px', 'background-color': '#ffffff',
      };
      const fields = [
        form.field(`#vgs-number-${localId}`, {
          name: 'number_alias', type: 'card-number', placeholder: 'Card number',
          autoComplete: 'cc-number', showCardIcon: true,
          validations: ['required', 'validCardNumber'], css: inputCss,
          ariaLabel: 'Card number', iframeTitle: 'Secure card number input',
        }),
        form.field(`#vgs-expiry-${localId}`, {
          name: 'expiry', type: 'card-expiration-date', placeholder: 'MM / YYYY',
          autoComplete: 'cc-exp', yearLength: 4,
          validations: ['required', 'validCardExpirationDate'],
          serializers: [form.SERIALIZERS.separate({ monthName: 'exp_month', yearName: 'exp_year' })],
          css: inputCss, ariaLabel: 'Expiration date', iframeTitle: 'Secure expiration date input',
        }),
        form.field(`#vgs-cvc-${localId}`, {
          name: 'cvc_alias', type: 'card-security-code', placeholder: 'Security code',
          autoComplete: 'cc-csc', hideValue: true,
          validations: ['required', 'validCardSecurityCode'], css: inputCss,
          ariaLabel: 'Card security code', iframeTitle: 'Secure card security code input',
        }),
      ];
      try {
        await Promise.all(fields.map((field) => field.promise || Promise.resolve()));
        if (active) setFieldsReady(fields.every((field) => field.loadingState !== 'failed'));
      } catch {
        if (active) setError('Secure card fields could not be prepared. Check the status before trying again.');
      }
    }).catch(() => {
      if (active) setError('The secure VGS card form could not be loaded. No card details were collected.');
    });

    return () => {
      active = false;
      mountedRef.current = false;
      try { formRef.current?.unmount?.(); } catch { /* No field values are read or retained. */ }
      formRef.current = null;
    };
  }, [config.environment, config.submit_path, config.vault_id, localId]);

  const submit = () => {
    if (disabled || busy || submittedRef.current || !fieldsReady || !fieldsValid || !formRef.current) return;
    const submitPath = safeSubmitPath(config.submit_path);
    if (!submitPath) {
      setError('Secure card submission is not configured. No payment was submitted.');
      return;
    }
    if (!onSubmitStart()) {
      setError('This tab cannot safely remember card preparation status. Reload checkout before entering card details.');
      return;
    }
    submittedRef.current = true;
    setBusy(true);
    setError('');
    let finished = false;
    const finishAndRecover = () => {
      if (finished) return;
      finished = true;
      if (mountedRef.current) setBusy(false);
      onSubmitFinished(); // Parent reads collection status; response is intentionally discarded.
    };
    const timer = window.setTimeout(finishAndRecover, 45000);
    try {
      formRef.current.submit(submitPath, {
        method: 'POST',
        serialization: 'json',
        withCredentials: false,
        // The returned submit_path is collection-scoped. The backend resolves
        // its purchase and validates the VGS-injected private callback header.
        // Never include purchase/session credentials in the card capture body.
        // VGS Collect hands back placeholders for the protected field values.
        // Use its supported custom-body callback to flatten the split expiry
        // placeholders without reading card number or CVC in application code.
        data: (formValues: Record<string, any>) => ({
          number_alias: formValues.number_alias,
          cvc_alias: formValues.cvc_alias,
          exp_month: formValues.expiry?.exp_month,
          exp_year: formValues.expiry?.exp_year,
        }),
      }, (_status, _response) => {
        window.clearTimeout(timer);
        finishAndRecover();
      }, (_validationErrors) => {
        window.clearTimeout(timer);
        finished = true;
        submittedRef.current = false;
        if (mountedRef.current) {
          setBusy(false);
          setError('Check the card number, expiration date, and security code.');
        }
        onValidationFailure();
      });
    } catch {
      window.clearTimeout(timer);
      finishAndRecover();
    }
  };

  return (
    <div className="payora-vgs-form" aria-busy={busy}>
      <div className="payora-vgs-field">
        <label>Card number</label><div id={`vgs-number-${localId}`} className="payora-vgs-field__frame" />
      </div>
      <div className="payora-vgs-field-row">
        <div className="payora-vgs-field">
          <label>Expiration date</label><div id={`vgs-expiry-${localId}`} className="payora-vgs-field__frame" />
        </div>
        <div className="payora-vgs-field">
          <label>Security code</label><div id={`vgs-cvc-${localId}`} className="payora-vgs-field__frame" />
        </div>
      </div>
      {!fieldsReady && !error && <p className="payora-vault__muted">Loading secure card fields…</p>}
      {fieldsReady && !fieldsValid && <p className="payora-vault__muted" role="status">
        {[
          !fieldValidity.number_alias && 'Card number needs attention',
          !fieldValidity.expiry && (fieldValidity.expiryHint || 'Expiration date needs attention'),
          !fieldValidity.cvc_alias && 'Security code needs attention',
        ].filter(Boolean).join('. ')}. Card values stay inside VGS and are not shown here.
      </p>}
      {error && <p className="payora-vault__error" role="alert">{error}</p>}
      <button type="button" className="payora-checkout__button" onClick={submit} disabled={disabled || busy || !fieldsReady || !fieldsValid || submittedRef.current}>
        {busy ? <><span className="payora-checkout__spinner" /> Sending securely…</> : 'Continue securely'}
      </button>
      <p className="payora-vault__muted">Card fields are hosted by VGS. This step prepares your payment; it does not charge your card.</p>
    </div>
  );
}
