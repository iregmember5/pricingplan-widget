import type { WidgetPaymentStatus } from './widgetCheckoutService';

export function confirmedAchRefund(payment?: WidgetPaymentStatus | null) {
  const amount = payment?.confirmed_refund_amount;
  return typeof amount === 'string' && /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 ? amount : null;
}

export function hasAchReceipt(payment?: WidgetPaymentStatus | null) {
  return payment?.receipt_available === true && payment.return_status !== 'returned'
    && payment.review_required !== true && payment.status !== 'failed' && payment.status !== 'cancelled';
}
