import React, { useState } from 'react';
import { CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface StripeIntegrationProps {
  clientSecret: string;
  paymentType?: 'subscription' | 'payment' | 'one_time';
  stripeAccount?: string;
  onSuccess: () => void;
  onBack: () => void;
}

export const StripeIntegration: React.FC<StripeIntegrationProps> = ({
  clientSecret,
  paymentType = 'subscription',
  stripeAccount,
  onSuccess,
  onBack
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [cardNumberComplete, setCardNumberComplete] = useState(false);
  const [cardExpiryComplete, setCardExpiryComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const [cardNumberError, setCardNumberError] = useState<string>('');
  const [cardExpiryError, setCardExpiryError] = useState<string>('');
  const [cardCvcError, setCardCvcError] = useState<string>('');
  const [error, setError] = useState<string>('');

  const cardComplete = cardNumberComplete && cardExpiryComplete && cardCvcComplete;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !cardComplete) return;

    setProcessing(true);
    setError('');

    try {
      const cardNumberElement = elements.getElement(CardNumberElement);
      if (!cardNumberElement) {
        setError('Card element not found');
        setProcessing(false);
        return;
      }

      // Check if client_secret is SetupIntent or PaymentIntent
      const isSetupIntent = clientSecret.startsWith('seti_');
      const isPaymentIntent = clientSecret.startsWith('pi_');

      if (isSetupIntent) {
        const options = stripeAccount ? { stripeAccount } : {};
        const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(
          clientSecret,
          {
            payment_method: {
              card: cardNumberElement,
            }
          },
          options
        );

        if (confirmError) {
          setError(confirmError.message || 'Payment setup failed. Please try again.');
        } else if (setupIntent?.status === 'succeeded') {
          onSuccess();
        } else {
          setError('Payment setup was not successful. Please try again.');
        }
      } else if (isPaymentIntent) {
        const options = stripeAccount ? { stripeAccount } : {};
        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
          clientSecret,
          {
            payment_method: {
              card: cardNumberElement,
            }
          },
          options
        );

        if (confirmError) {
          setError(confirmError.message || 'Payment failed. Please try again.');
        } else if (paymentIntent?.status === 'succeeded') {
          onSuccess();
        } else {
          setError('Payment was not successful. Please try again.');
        }
      } else {
        setError('Invalid payment secret received.');
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err?.message || 'An error occurred. Please try again.');
    } finally {
      setProcessing(false);
    }
  };



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
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        ← Back
      </button>

      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px', textAlign: 'center' }}>
        Enter Card Details
      </h2>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            Card Number
          </label>
          <div style={{
            padding: '12px',
            border: `1px solid ${cardNumberError ? '#dc2626' : '#d1d5db'}`,
            borderRadius: '8px',
            backgroundColor: 'white'
          }}>
            <CardNumberElement
              onChange={(e) => {
                setCardNumberComplete(e.complete);
                setCardNumberError(e.error?.message || '');
              }}
              options={{
                style: {
                  base: {
                    fontSize: '16px',
                    color: '#424770',
                    '::placeholder': {
                      color: '#aab7c4',
                    },
                  },
                  invalid: {
                    color: '#9e2146',
                  },
                },
              }}
            />
          </div>
          {cardNumberError && (
            <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
              {cardNumberError}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              Expiry (MM/YY)
            </label>
            <div style={{
              padding: '12px',
              border: `1px solid ${cardExpiryError ? '#dc2626' : '#d1d5db'}`,
              borderRadius: '8px',
              backgroundColor: 'white'
            }}>
              <CardExpiryElement
                onChange={(e) => {
                  setCardExpiryComplete(e.complete);
                  setCardExpiryError(e.error?.message || '');
                }}
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#424770',
                      '::placeholder': {
                        color: '#aab7c4',
                      },
                    },
                    invalid: {
                      color: '#9e2146',
                    },
                  },
                }}
              />
            </div>
            {cardExpiryError && (
              <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
                {cardExpiryError}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
              CVC (3-4 digits)
            </label>
            <div style={{
              padding: '12px',
              border: `1px solid ${cardCvcError ? '#dc2626' : '#d1d5db'}`,
              borderRadius: '8px',
              backgroundColor: 'white'
            }}>
              <CardCvcElement
                onChange={(e) => {
                  setCardCvcComplete(e.complete);
                  setCardCvcError(e.error?.message || '');
                }}
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#424770',
                      '::placeholder': {
                        color: '#aab7c4',
                      },
                    },
                    invalid: {
                      color: '#9e2146',
                    },
                  },
                }}
              />
            </div>
            {cardCvcError && (
              <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
                {cardCvcError}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{
            padding: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#dc2626',
            fontSize: '14px',
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}



        <button
          type="submit"
          disabled={!stripe || !cardComplete || processing}
          style={{
            width: '100%',
            padding: '16px',
            background: (!stripe || !cardComplete || processing) ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '500',
            cursor: (!stripe || !cardComplete || processing) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          {processing ? (
            <>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid #ffffff',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              Processing...
            </>
          ) : (
            'Complete Payment'
          )}
        </button>
      </form>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};