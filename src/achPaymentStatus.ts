import { API_BASE_URL } from './apiConfig';
import type { WidgetPaymentStatus } from './widgetCheckoutService';

export function confirmedAchRefund(payment?: WidgetPaymentStatus | null) {
  const amount = payment?.confirmed_refund_amount;
  return typeof amount === 'string' && /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 ? amount : null;
}

export function hasAchReceipt(payment?: WidgetPaymentStatus | null) {
  return payment?.status === 'succeeded' && payment.receipt_available === true
    && payment.return_status !== 'returned' && payment.review_required !== true;
}

export function achReceiptUrl(payment?: WidgetPaymentStatus | null) {
  if (!hasAchReceipt(payment) || !payment?.receipt_url) return null;
  try {
    const url = new URL(payment.receipt_url, API_BASE_URL);
    return url.origin === new URL(API_BASE_URL).origin && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
