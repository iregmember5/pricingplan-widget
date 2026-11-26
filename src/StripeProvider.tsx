import React, { useMemo } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

interface StripeProviderProps {
  children: React.ReactNode;
  publishableKey: string;
  stripeAccount?: string | null;
}

export const StripeProvider: React.FC<StripeProviderProps> = ({ children, publishableKey, stripeAccount }) => {
  const stripePromise = useMemo(() => (
    publishableKey
      ? loadStripe(publishableKey, stripeAccount ? { stripeAccount } : undefined)
      : Promise.resolve(null)
  ), [publishableKey, stripeAccount]);

  return <Elements stripe={stripePromise}>{children}</Elements>;
};
