import { API_BASE_URL } from './apiConfig';
import type { WidgetCheckoutSession } from './widgetCheckoutService';

export interface PurchaseChargeResult {
  status: string;
  purchase_id?: string;
  attempt_id?: string | null;
  transaction_id?: string | number | null;
  gateway_tx_id?: string | null;
  next_action?: Record<string, any> | null;
}

export async function submitWidgetPayment(
  session: WidgetCheckoutSession,
  stripePaymentMethod: string,
): Promise<PurchaseChargeResult> {
  if (!session.purchaseToken || !session.idempotencyKey) {
    throw new Error('This checkout is not authorized to accept a payment.');
  }

  const response = await fetch(`${API_BASE_URL}/payments/router/charge/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      purchase_id: session.purchaseId,
      purchase_token: session.purchaseToken,
      idempotency_key: session.idempotencyKey,
      target_gateway: 'stripe',
      payment_method: 'card',
      stripe_payment_method: stripePaymentMethod,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    const errors = body?.errors && typeof body.errors === 'object'
      ? Object.values(body.errors).flat().filter(Boolean).join(' ')
      : '';
    throw new Error(errors || body?.message || body?.error || `Payment could not be submitted (HTTP ${response.status}).`);
  }

  const data = body?.data && typeof body.data === 'object' ? body.data : body;
  return {
    status: String(data?.status || ''),
    purchase_id: data?.purchase_id,
    attempt_id: data?.attempt_id ?? null,
    transaction_id: data?.transaction_id ?? null,
    gateway_tx_id: data?.gateway_tx_id ?? null,
    next_action: data?.next_action && typeof data.next_action === 'object' ? data.next_action : null,
  };
}
