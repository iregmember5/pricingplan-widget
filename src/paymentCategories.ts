export const PAYMENT_CATEGORY_LABELS = {
  card: 'Card Payments',
  ach: 'Bank Payments (ACH)',
  wallet: 'Digital Wallets',
} as const;

export type PaymentCategory = keyof typeof PAYMENT_CATEGORY_LABELS;
export type PaymentMethodOption = { category: PaymentCategory; label: string; available: boolean };

export function readPaymentCategory(value: unknown): PaymentCategory | undefined {
  return value === 'card' || value === 'ach' || value === 'wallet' ? value : undefined;
}

export function readPaymentMethods(value: unknown): PaymentMethodOption[] {
  if (!Array.isArray(value)) throw new Error('The payment service did not return available methods.');
  return (Object.keys(PAYMENT_CATEGORY_LABELS) as PaymentCategory[]).map(category => {
    const option = value.find(row => row?.payment_category === category);
    return {
      category, label: typeof option?.label === 'string' && option.label ? option.label : PAYMENT_CATEGORY_LABELS[category],
      available: category !== 'wallet' && option?.available === true,
    };
  });
}
