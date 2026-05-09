import React, { useState } from 'react';
import { StripeIntegration } from './StripeIntegration';
import { StripeProvider } from './StripeProvider';
import { getVaultPublicKeys } from './vaultService';
import { routerCharge } from './routerService';

declare global {
  interface Window { VGSCollect: any; }
}

interface PaymentFlowProps {
  widgetId: string;
  planId: string;
  interval?: string;
  paymentType: string;
  amount?: string;
  useNewPaymentApi?: boolean;
  paymentMethod?: 'stripe_direct' | 'vault';
  onBack: () => void;
}

export const PaymentFlow: React.FC<PaymentFlowProps> = ({
  widgetId,
  planId,
  interval,
  paymentType,
  amount = '0.00',
  useNewPaymentApi = false,
  paymentMethod = 'vault',
  onBack
}) => {
  const [step, setStep] = useState<'methods' | 'stripe' | 'vault' | 'success'>('methods');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');
  const [backendPaymentType, setBackendPaymentType] = useState<'subscription' | 'payment' | 'one_time'>('subscription');
  const [stripeAccount, setStripeAccount] = useState<string>();
  const [confirmedPaymentId, setConfirmedPaymentId] = useState<string>('');

  // Vault (Method 2) state
  const [vgsForm, setVgsForm] = useState<any>(null);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState('');
  const [vaultSubmitting, setVaultSubmitting] = useState(false);

  const handlePaymentMethodSelect = async (method: string) => {
    if (method !== 'credit_card' || !email) return;

    // Route to vault (Method 2) if configured
    if (paymentMethod === 'vault') {
      setVaultLoading(true);
      setVaultError('');
      try {
        const keys = await getVaultPublicKeys();
        const { vault_id, environment } = keys.vgs;
        if (!window.VGSCollect) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://js.verygoodvault.com/vgs-collect/2.18.0/vgs-collect.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load VGS'));
            document.head.appendChild(script);
          });
        }
        const form = window.VGSCollect.create(vault_id, environment, () => {});
        setVgsForm(form);
        setStep('vault'); // render DOM divs first
        // mount fields after DOM is painted
        setTimeout(() => {
          const fieldStyle = { base: { fontSize: '15px', color: '#111827', '::placeholder': { color: '#9ca3af' } }, invalid: { color: '#dc2626' } };
          form.field('#vgs-wgt-number', {
            type: 'card-number',
            name: 'card.number',
            placeholder: '4111 1111 1111 1111',
            validations: ['required', 'validCardNumber'],
            showCardIcon: true,
            style: fieldStyle
          });
          form.field('#vgs-wgt-expiry', {
            type: 'card-expiration-date',
            name: 'card.exp',
            placeholder: 'MM / YY',
            validations: ['required', 'validCardExpirationDate'],
            style: fieldStyle
          });
          form.field('#vgs-wgt-cvc', {
            type: 'card-security-code',
            name: 'card.cvc',
            placeholder: '•••',
            validations: ['required', 'validCardSecurityCode'],
            style: fieldStyle
          });
        }, 100);
      } catch (err: any) {
        setVaultError(err.message || 'Failed to load card form');
      } finally {
        setVaultLoading(false);
      }
      return;
    }

    // Method 1 — Stripe direct (commented out, Method 2 is default)
    /*
    const payload: any = {
      widget_id: widgetId,
      plan_id: planId,
      customer_email: email
    };
    
    if (paymentType === 'subscription' && interval) {
      payload.interval = interval;
    }

    const apiUrls = useNewPaymentApi
      ? [
          'https://mypowerly.com/v1/api/widgets/payment/initiate/',
          'https://esign-admin.signmary.com/api/widgets/payment/initiate/'
        ]
      : [
          'https://mypowerly.com/v1/api/widgets/stripe/create-payment/',
          'https://esign-admin.signmary.com/api/widgets/stripe/create-payment/'
        ];

    let fetchAttempt = 0;

    const tryFetch = async () => {
      const apiUrl = apiUrls[fetchAttempt];
      console.log('Creating payment with:', apiUrl);

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Payment creation failed');

        const data = await response.json();
        
        const resolvedClientSecret = data.clientSecret || data.client_secret;
        const resolvedPaymentIntentId = data.paymentIntentId || data.payment_intent_id || data.subscription_id;
        const resolvedPaymentType = data.payment_type || data.paymentType || (paymentType === 'subscription' ? 'subscription' : 'one_time');

        if (resolvedClientSecret) {
          setClientSecret(resolvedClientSecret);
          setPaymentIntentId(resolvedPaymentIntentId || '');
          setBackendPaymentType(resolvedPaymentType);
          setStripeAccount(data.stripe_account || data.stripeAccount);
          setStep('stripe');
        } else {
          alert(data.message || data.error || 'Payment creation failed');
        }
        setLoading(false);
      } catch (error) {
        console.error(`Failed to create payment with ${apiUrl}:`, error);
        fetchAttempt++;
        if (fetchAttempt < apiUrls.length) {
          tryFetch();
        } else {
          alert('Network error. Please try again.');
          setLoading(false);
        }
      }
    };

    tryFetch();
    */
  };

  const handleStripeSuccess = () => {
    setConfirmedPaymentId(paymentIntentId);
    setStep('success');
  };

  if (step === 'success') {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px', color: '#10b981' }}>
          Payment Successful!
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '12px' }}>
          Thank you for your purchase. You will receive a confirmation email shortly.
        </p>
        {confirmedPaymentId && (
          <p style={{ fontSize: '13px', color: '#9ca3af', fontFamily: 'monospace' }}>
            Transaction ID: {confirmedPaymentId}
          </p>
        )}
      </div>
    );
  }

  if (step === 'stripe') {
    return (
      <StripeProvider stripeAccount={stripeAccount}>
        <StripeIntegration 
          clientSecret={clientSecret}
          paymentType={backendPaymentType}
          stripeAccount={stripeAccount}
          onSuccess={handleStripeSuccess}
          onBack={() => setStep('methods')}
        />
      </StripeProvider>
    );
  }

  if (step === 'vault') {
    const handleVaultSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!vgsForm || vaultSubmitting) return;
      setVaultSubmitting(true);
      setVaultError('');
      vgsForm.submit(
        '/api/payments/vault/vgs-collect/',
        { headers: { 'Content-Type': 'application/json' } },
        async (status: number, data: any) => {
          console.log('VGS response status:', status, 'data:', JSON.stringify(data));
        // VGS returns token at data.token or data.data.token depending on backend shape
        const token = data?.token || data?.data?.token;
        const aliased_card = data?.aliased_card || data?.data?.aliased_card;

        // parse card.exp "MM / YYYY" into exp_month and exp_year if backend needs them split
        const rawExp: string = data?.card?.exp || data?.['card.exp'] || data?.['card[exp]'] || '';
        const [expMonth, expYear] = rawExp.replace(/\s/g, '').split('/');
        const resolvedCard = aliased_card || (rawExp ? { exp_month: expMonth, exp_year: expYear } : undefined);

        if (status !== 200 || !token) {
          setVaultError(data?.message || data?.error || 'Card tokenization failed');
          setVaultSubmitting(false);
          return;
        }
        try {
          const result = await routerCharge({
            vault_token: token,
            vault_provider: 'vgs',
            target_gateway: 'stripe',
            amount,
            business_email: email,
            widget_id: widgetId,
            aliased_card: resolvedCard,
          });
          if (result.success) {
            setConfirmedPaymentId(String(result.transaction_id || result.gateway_tx_id));
            setStep('success');
          } else {
            setVaultError(result.error || 'Payment failed');
          }
        } catch (err: any) {
          setVaultError(err?.message || 'Payment failed');
        } finally {
          setVaultSubmitting(false);
        }
      },
      (errors: any) => {
        // VGS field validation errors
        console.log('VGS validation errors:', errors);
        setVaultError('Please check your card details and try again.');
        setVaultSubmitting(false);
      }
      );
    };

    return (
      <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
        <button onClick={() => setStep('methods')} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '14px' }}>
          ← Back
        </button>
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>Enter Card Details</h2>
        {vaultLoading ? (
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading secure card form...</p>
        ) : (
          <form onSubmit={handleVaultSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Card Number</label>
              <div id="vgs-wgt-number" style={{ padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: 'white', minHeight: '48px' }} />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>Expiry</label>
                <div id="vgs-wgt-expiry" style={{ padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: 'white', minHeight: '48px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>CVC</label>
                <div id="vgs-wgt-cvc" style={{ padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: 'white', minHeight: '48px' }} />
              </div>
            </div>
            {vaultError && (
              <div style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '14px', marginBottom: '16px' }}>
                {vaultError}
              </div>
            )}
            <button type="submit" disabled={vaultSubmitting} style={{ width: '100%', padding: '16px', background: vaultSubmitting ? '#9ca3af' : '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '500', cursor: vaultSubmitting ? 'not-allowed' : 'pointer' }}>
              {vaultSubmitting ? 'Processing...' : 'Complete Payment'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px' }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px',
          background: 'none',
          border: 'none',
          color: '#6b7280',
          cursor: 'pointer'
        }}
      >
        ← Back to Plans
      </button>

      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>
        Complete Your Purchase
      </h2>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
          Email Address *
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '16px'
          }}
          required
        />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500' }}>
          Payment Method
        </label>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => handlePaymentMethodSelect('credit_card')}
            disabled={!email || loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              background: email ? '#fff' : '#f9fafb',
              cursor: email ? 'pointer' : 'not-allowed',
              opacity: email ? 1 : 0.6,
              transition: 'all 0.2s'
            }}
          >
            <div style={{ fontSize: '24px' }}>💳</div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontWeight: '500' }}>Credit Card</div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>Visa, Mastercard, American Express</div>
            </div>
            {loading && <div>Loading...</div>}
          </button>

          <button
            disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              background: '#f9fafb',
              cursor: 'not-allowed',
              opacity: 0.4
            }}
          >
            <div style={{ fontSize: '24px' }}>🏦</div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontWeight: '500' }}>Bank Transfer</div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>Coming soon</div>
            </div>
          </button>

          <button
            disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              background: '#f9fafb',
              cursor: 'not-allowed',
              opacity: 0.4
            }}
          >
            <div style={{ fontSize: '24px' }}>📱</div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontWeight: '500' }}>Digital Wallet</div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>Apple Pay, Google Pay</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

