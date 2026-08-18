import React, { useMemo } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, Stripe } from '@stripe/stripe-js';

interface StripeProviderProps {
  children: React.ReactNode;
  stripeAccount?: string;
}

export const StripeProvider: React.FC<StripeProviderProps> = ({ children, stripeAccount }) => {
  const stripePromise = useMemo(() => {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
    return stripeAccount 
      ? loadStripe(key, { stripeAccount })
      : loadStripe(key);
  }, [stripeAccount]);

  return <Elements stripe={stripePromise}>{children}</Elements>;
};
