import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { CheckoutHeader, formatCheckoutAmount } from './CheckoutUI';
import { getVaultPaymentReturnStatus, type VaultReturnResult } from './vaultCheckoutService';

export function VaultPaymentReturn({ token }: { token: string }) {
  const [result, setResult] = useState<VaultReturnResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const check = async () => {
    setLoading(true);
    setError('');
    try { setResult(await getVaultPaymentReturnStatus(token)); }
    catch { setError('We could not verify the payment yet. Keep your checkout reference and check again before trying another payment.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void check(); /* Return token remains only in component memory. */ }, []);

  const succeeded = result?.status === 'succeeded';
  return (
    <main className="payora-checkout payora-checkout--return">
      <div className="payora-checkout__container">
        <CheckoutHeader />
        <section className="payora-checkout__return-card" aria-live="polite">
          <div className={`payora-checkout__success-mark${succeeded ? '' : ' payora-checkout__success-mark--pending'}`}>
            {succeeded ? <CheckCircle2 size={29} /> : <ShieldCheck size={27} />}
          </div>
          <div className="payora-checkout__eyebrow">Bank verification return</div>
          <h1 className="payora-checkout__title">{loading ? 'Checking your payment' : succeeded ? 'Payment confirmed' : 'Payment is not confirmed'}</h1>
          <p className="payora-checkout__description">
            {loading ? 'We’re checking the original payment with the payment service.' : succeeded ? 'The payment service confirmed your payment.' : error || 'Your bank returned you to checkout, but the payment service has not confirmed success. Please do not pay again.'}
          </p>
          {result?.environment === 'sandbox' && <p className="payora-checkout__sandbox-note">Sandbox test payment</p>}
          {result?.amount && result.currency && <p className="payora-checkout__return-amount">{formatCheckoutAmount(result.amount, result.currency)}</p>}
          {result?.reference && <p className="payora-checkout__reference">Reference: {result.reference}</p>}
          {!succeeded && <button className="payora-checkout__button" type="button" onClick={() => void check()} disabled={loading}>
            {loading ? <><span className="payora-checkout__spinner" /> Checking…</> : <><RefreshCw size={16} /> Check payment status</>}
          </button>}
          <p className="payora-checkout__card-assurance"><ShieldCheck size={15} /> Status verified securely with the payment service.</p>
        </section>
      </div>
    </main>
  );
}
