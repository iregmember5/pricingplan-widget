import { API_BASE_URL } from './apiConfig';
import type { WidgetPaymentStatus, WidgetCheckoutSession } from './widgetCheckoutService';

export interface WidgetNotificationPreference {
  contact_saved: boolean;
  status_updates_requested: boolean;
  status_updates_enabled: boolean;
}

export interface PrivatePaymentStatus extends WidgetPaymentStatus {
  purchase_id: string;
  attempt_id?: string;
  gateway: string;
  status: string;
  amount: string;
  currency: string;
  support_reference?: string;
  receipt_url?: string | null;
}

export interface PrivatePaymentReceipt {
  merchant_display_name?: string;
  amount: string;
  currency: string;
  support_reference?: string;
  provider_reference?: string;
  settlement_status?: string;
  receipt_explanation?: string;
}

export class WidgetCustomerError extends Error {
  constructor(public status: number, public retryAt = 0) {
    super('The payment service could not complete this request.');
  }
}

async function request<T>(path: string, body: Record<string, unknown>, method = 'POST'): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/payments/${path}`, {
    method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body), credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
  }).catch(() => { throw new WidgetCustomerError(0); });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true || !result?.data || typeof result.data !== 'object') {
    const retryAfter = response.headers.get('Retry-After');
    const retryAt = retryAfter && /^\d+$/.test(retryAfter) ? Date.now() + Number(retryAfter) * 1000 : Date.parse(retryAfter || '');
    throw new WidgetCustomerError(response.status, response.status === 429 ? Math.max(Date.now() + 1000, retryAt || Date.now() + 30_000) : 0);
  }
  return result.data as T;
}

export async function saveWidgetContact(checkout: WidgetCheckoutSession, email: string, requested: boolean) {
  const result = await request<{ customer_notifications: WidgetNotificationPreference }>('widget-checkouts/contact/', {
    purchase_id: checkout.purchaseId, purchase_token: checkout.purchaseToken,
    ...(email ? { customer_email: email } : {}), status_updates_requested: requested,
  }, 'PUT');
  if (typeof result.customer_notifications?.contact_saved !== 'boolean'
    || result.customer_notifications.status_updates_requested !== requested) throw new WidgetCustomerError(0);
  return result.customer_notifications;
}

export async function exchangeWidgetStatus(token: string) {
  const result = await request<{ status_token: string; expires_at: string }>('widget-payment-status/exchange/', { status_token: token });
  if (typeof result.status_token !== 'string' || !result.status_token.startsWith('wss_')
    || !(Date.parse(result.expires_at) > Date.now())) throw new WidgetCustomerError(404);
  return { token: result.status_token, expiresAt: Date.parse(result.expires_at) };
}

export function readWidgetStatus(token: string) {
  return request<PrivatePaymentStatus>('widget-payment-status/', { status_token: token });
}

const receiptEndpoint = `${API_BASE_URL}/payments/widget-payment-status/receipt/`;
export function isWidgetReceiptEndpoint(value?: string | null) {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value, new URL(API_BASE_URL).origin).href === receiptEndpoint;
  } catch { return false; }
}

export function readWidgetReceipt(token: string) {
  return request<PrivatePaymentReceipt>('widget-payment-status/receipt/', { status_token: token });
}
