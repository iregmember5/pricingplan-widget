import { API_BASE_URL } from './apiConfig';
import type { WidgetCheckoutSession, WidgetPaymentStatus } from './widgetCheckoutService';

export interface CpachargeAchCollection {
  collection_id: string;
  purchase_id: string;
  provider: 'cpacharge';
  payment_method: 'ach';
  flow: 'hosted_bank_token';
  environment: 'sandbox' | 'live';
  public_key: string;
  form_data: Record<string, string>;
  authorization_version: string;
  authorization_text: string;
  amount: string;
  currency: 'USD';
  expires_at: string;
  submitted: boolean;
}

export interface CpachargeAchCharge extends WidgetPaymentStatus {
  purchase_id: string;
  attempt_id: string | null;
  transaction_id: string | number | null;
  gateway_tx_id: string | null;
  gateway: 'cpacharge';
  status: string;
  amount: string;
  currency: string;
  payment_method?: 'ach';
  settlement_status?: string;
  receipt_available?: boolean;
  can_start_replacement?: boolean;
}

function purchaseProof(checkout: WidgetCheckoutSession) {
  if (!checkout.purchaseToken) throw new Error('This checkout needs recovery before payment can continue.');
  return { purchase_id: checkout.purchaseId, purchase_token: checkout.purchaseToken };
}

async function postApi<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const paymentsRoot = new URL(`${API_BASE_URL}/payments/`);
  const url = new URL(path.replace(/^\//, ''), paymentsRoot);
  if (url.origin !== paymentsRoot.origin || !url.pathname.startsWith(paymentsRoot.pathname)) {
    throw new Error('Unexpected payment API location.');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new Error('The request outcome is not confirmed. Check the original checkout status before trying again.');
  }

  const envelope = await response.json().catch(() => null);
  if (!response.ok || envelope?.success !== true || !envelope?.data || typeof envelope.data !== 'object') {
    const message = typeof envelope?.message === 'string' ? envelope.message : `Payment request could not be confirmed (HTTP ${response.status}).`;
    throw Object.assign(new Error(message), { status: response.status, retryAfter: response.headers.get('Retry-After') });
  }
  return envelope.data as T;
}

export function supportsCpachargeAch(checkout: WidgetCheckoutSession) {
  const collection = checkout.collection;
  return collection?.provider === 'cpacharge'
    && collection.gateway === 'cpacharge'
    && collection.payment_method === 'ach'
    && collection.flow === 'hosted_bank_token'
    && (collection.environment === 'sandbox' || collection.environment === 'live')
    && checkout.currency === 'USD';
}

function hasExpectedBeginEndpoint(value: unknown) {
  if (value == null || value === '') return true;
  if (typeof value !== 'string') return false;
  if (value === 'ach-collections/' || value === '/api/payments/ach-collections/') return true;
  try {
    const apiRoot = new URL(API_BASE_URL);
    const expected = new URL(`${API_BASE_URL}/payments/ach-collections/`);
    const advertised = new URL(value, apiRoot.origin);
    return advertised.origin === expected.origin && advertised.pathname === expected.pathname;
  } catch { return false; }
}

export async function beginCpachargeAchCollection(checkout: WidgetCheckoutSession): Promise<CpachargeAchCollection> {
  if (!supportsCpachargeAch(checkout) || !hasExpectedBeginEndpoint(checkout.collection?.begin_endpoint)
    || !checkout.canSubmit || checkout.status !== 'ready') {
    throw new Error('The backend has not authorized CPACharge bank payment for this checkout. No debit was submitted.');
  }
  const data = await postApi<any>('ach-collections/', purchaseProof(checkout));
  const collectionId = typeof data?.collection_id === 'string' ? data.collection_id : '';
  const formData = data?.form_data;
  if (!collectionId || data?.purchase_id !== checkout.purchaseId
    || data?.provider !== 'cpacharge' || data?.payment_method !== 'ach'
    || data?.flow !== 'hosted_bank_token' || data?.environment !== checkout.collection?.environment
    || typeof data?.public_key !== 'string' || !data.public_key
    || !formData || typeof formData !== 'object'
    || formData.mypowerly_collection_id !== collectionId
    || typeof data?.authorization_version !== 'string' || !data.authorization_version
    || typeof data?.authorization_text !== 'string' || !data.authorization_text
    || String(data?.amount) !== checkout.amount || data?.currency !== 'USD'
    || typeof data?.expires_at !== 'string' || !Number.isFinite(Date.parse(data.expires_at))
    || Date.parse(data.expires_at) <= Date.now()) {
    throw new Error('The payment service returned incomplete or mismatched bank checkout details. No debit was submitted. Contact support.');
  }
  return {
    collection_id: collectionId,
    purchase_id: data.purchase_id,
    provider: 'cpacharge',
    payment_method: 'ach',
    flow: 'hosted_bank_token',
    environment: data.environment,
    public_key: data.public_key,
    // Keep backend-issued provider field names and values unchanged.
    form_data: { ...formData },
    authorization_version: data.authorization_version,
    authorization_text: data.authorization_text,
    amount: String(data.amount),
    currency: 'USD',
    expires_at: data.expires_at,
    submitted: data.submitted === true,
  };
}

export async function submitCpachargeAchPayment(
  checkout: WidgetCheckoutSession,
  collection: CpachargeAchCollection,
  providerToken: string,
) {
  if (!supportsCpachargeAch(checkout) || checkout.status !== 'ready' || !checkout.canSubmit
    || collection.purchase_id !== checkout.purchaseId || collection.submitted
    || collection.environment !== checkout.collection?.environment
    || collection.amount !== checkout.amount || collection.currency !== checkout.currency
    || !(Date.parse(collection.expires_at) > Date.now())
    || !providerToken || !checkout.purchaseToken || !checkout.idempotencyKey) {
    throw new Error('This bank payment is not ready to submit. Recover the original checkout before taking another action.');
  }
  const result = await postApi<any>('purchase-payments/', {
    ...purchaseProof(checkout),
    idempotency_key: checkout.idempotencyKey,
    target_gateway: 'cpacharge',
    payment_method: 'ach',
    ach_collection_id: collection.collection_id,
    cpacharge_token: providerToken,
    authorization_accepted: true,
    authorization_version: collection.authorization_version,
  });
  if (result?.purchase_id !== checkout.purchaseId || result?.gateway !== 'cpacharge'
    || typeof result?.status !== 'string' || String(result?.amount) !== checkout.amount
    || result?.currency !== 'USD') {
    throw new Error('The bank payment response did not match this checkout. Recover the original status before proceeding.');
  }
  return {
    purchase_id: result.purchase_id,
    attempt_id: typeof result.attempt_id === 'string' ? result.attempt_id : null,
    transaction_id: typeof result.transaction_id === 'string' || typeof result.transaction_id === 'number' ? result.transaction_id : null,
    gateway_tx_id: typeof result.gateway_tx_id === 'string' ? result.gateway_tx_id : null,
    gateway: 'cpacharge',
    status: result.status,
    amount: String(result.amount),
    currency: 'USD',
    payment_method: result.payment_method === 'ach' ? 'ach' : undefined,
    settlement_status: typeof result.settlement_status === 'string' ? result.settlement_status : undefined,
    receipt_available: result.receipt_available === true,
    merchant_display_name: typeof result.merchant_display_name === 'string' ? result.merchant_display_name : undefined,
    customer_notifications: result.customer_notifications,
    return_status: typeof result.return_status === 'string' ? result.return_status : undefined,
    confirmed_refund_amount: typeof result.confirmed_refund_amount === 'string' ? result.confirmed_refund_amount : undefined,
    review_required: result.review_required === true,
    can_start_replacement: result.can_start_replacement === true,
  } satisfies CpachargeAchCharge;
}

export function hasCpachargeSubmissionStarted(purchaseId: string) {
  try { return sessionStorage.getItem(`payora.cpacharge-ach-submit.v1:${purchaseId}`) === '1'; }
  catch { return true; }
}

export function markCpachargeSubmissionStarted(purchaseId: string) {
  sessionStorage.setItem(`payora.cpacharge-ach-submit.v1:${purchaseId}`, '1');
}

export function clearCpachargeSubmissionStarted(purchaseId: string) {
  sessionStorage.removeItem(`payora.cpacharge-ach-submit.v1:${purchaseId}`);
}
