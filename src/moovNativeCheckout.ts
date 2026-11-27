export type MoovPurchase = {
  purchaseId: string;
  purchaseToken: string;
  idempotencyKey: string;
  amount: string;
  currency: string;
  canSubmit: boolean;
  expiresAt: string;
  collection: unknown;
};

export type MoovPayment = {
  purchase_id: string;
  status: 'succeeded' | 'submitting' | 'processing' | 'uncertain' | 'requires_action' | 'failed' | 'cancelled' | 'review_required';
  attempt_id?: string;
  transaction_id?: string | number;
  gateway_tx_id?: string;
  invoice_payment_status?: string;
  invoice_status?: string;
  gateway?: string;
  amount?: string;
  currency?: string;
};

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const states = new Set(['succeeded', 'submitting', 'processing', 'uncertain', 'requires_action', 'failed', 'cancelled', 'review_required']);
const prefix = 'payora.moov.collection.v1.';

export function isNativeMoov(collection: unknown, currency: string) {
  const row = collection as Record<string, unknown> | null;
  return currency === 'USD' && row?.flow === 'native_moov' && row.provider === 'moov' && row.gateway === 'moov'
    && row.payment_method === 'card' && (row.environment === 'sandbox' || row.environment === 'live');
}

type Recovery = { collectionId?: string; cardId?: string; submitted?: boolean };

function storage(purchaseId: string): Recovery {
  const data = JSON.parse(sessionStorage.getItem(prefix + purchaseId) || '{}');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Payment recovery is unavailable.');
  return data;
}

export function readMoovRecovery(purchaseId: string): Recovery {
  try { return storage(purchaseId); } catch { return {}; }
}

export function saveMoovRecovery(purchaseId: string, update: Recovery) {
  const current = storage(purchaseId);
  if (update.collectionId && current.collectionId && current.collectionId !== update.collectionId) {
    throw new Error('Secure card collection changed. Contact the business with your checkout reference.');
  }
  if (update.submitted && current.submitted) throw new Error('Check the original payment status before continuing.');
  sessionStorage.setItem(prefix + purchaseId, JSON.stringify({ ...current, ...update }));
}

function proof(purchase: MoovPurchase) {
  if (!purchase.canSubmit || !purchase.purchaseId || !purchase.purchaseToken || !purchase.idempotencyKey
    || !(Date.parse(purchase.expiresAt) > Date.now())
    || !isNativeMoov(purchase.collection, purchase.currency)) {
    throw new Error('Native card collection is unavailable for this checkout.');
  }
  return { purchase_id: purchase.purchaseId, purchase_token: purchase.purchaseToken };
}

async function post<T>(apiRoot: string, route: string, body: object): Promise<T> {
  const response = await fetch(apiRoot.replace(/\/$/, '') + '/' + route, {
    method: 'POST', body: JSON.stringify(body), redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true || !result.data) {
    if (response.status === 429) throw new Error('Too many requests. Please wait before checking again.');
    throw new Error(typeof result?.message === 'string' ? result.message : 'The payment service could not confirm this request.');
  }
  return result.data;
}

export type MoovCollection = {
  collection_id: string;
  payer_account_id: string;
  merchant_account_id: string;
  expires_at: string;
  oauth_token?: string;
  ready: boolean;
  provider: string;
  flow: string;
  environment: string;
};

export async function beginMoovCollection(apiRoot: string, purchase: MoovPurchase, firstName: string, lastName: string) {
  const data = await post<MoovCollection>(apiRoot, 'moov-native-collections/', {
    ...proof(purchase), payer_first_name: firstName.trim(), payer_last_name: lastName.trim(),
  });
  const descriptor = purchase.collection as Record<string, unknown>;
  if (!uuid.test(data.collection_id) || !uuid.test(data.payer_account_id) || !uuid.test(data.merchant_account_id)
    || data.provider !== 'moov' || data.flow !== 'native_moov' || data.environment !== descriptor.environment
    || typeof data.ready !== 'boolean'
    || (!data.ready && (typeof data.oauth_token !== 'string' || !data.oauth_token || !(Date.parse(data.expires_at) > Date.now())))) {
    throw new Error('The payment service returned incomplete Moov collection details.');
  }
  return data;
}

export async function completeMoovCollection(apiRoot: string, purchase: MoovPurchase, collectionId: string, cardId: string) {
  if (!uuid.test(collectionId) || !uuid.test(cardId)) throw new Error('The provider returned an invalid card reference.');
  const data = await post<{ ready?: boolean }>(apiRoot, 'moov-native-collections/complete/', {
    ...proof(purchase), collection_id: collectionId, card_id: cardId,
  });
  if (data.ready !== true) throw new Error('The linked card is not ready. Check the same card again.');
}

export async function payWithMoovCollection(apiRoot: string, purchase: MoovPurchase, collectionId: string, onSubmissionStart?: () => void) {
  if (!uuid.test(collectionId)) throw new Error('Verify the linked card before paying.');
  const payload = {
    ...proof(purchase),
    idempotency_key: purchase.idempotencyKey,
    target_gateway: 'moov',
    payment_method: 'card',
    moov_collection_id: collectionId,
  };
  saveMoovRecovery(purchase.purchaseId, { collectionId, submitted: true });
  onSubmissionStart?.();
  const data = await post<MoovPayment>(apiRoot, 'purchase-payments/', payload);
  if (data.purchase_id !== purchase.purchaseId || data.gateway !== 'moov' || !states.has(data.status)) {
    throw new Error('The payment response could not be verified. Check the original payment status.');
  }
  return data;
}
