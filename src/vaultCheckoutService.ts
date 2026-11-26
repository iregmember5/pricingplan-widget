import { API_BASE_URL } from './apiConfig';
import type { WidgetCheckoutSession } from './widgetCheckoutService';

export type VaultProvider = 'vgs' | 'basis_theory' | 'spreedly' | 'pci_vault';
export type VaultCollectionState =
  | 'initializing' | 'provisioning' | 'collecting' | 'ready' | 'uncertain'
  | 'consumed' | 'revoked' | 'failed' | 'expired' | 'unavailable';

export interface PurchaseProof {
  purchase_id: string;
  purchase_token: string;
}

function vgsSubmitFlagKey(purchaseId: string, collectionId: string) {
  return `payora.vgs-submit-started.v1:${purchaseId}:${collectionId}`;
}

export function hasVgsSubmissionStarted(purchaseId: string, collectionId: string) {
  try { return sessionStorage.getItem(vgsSubmitFlagKey(purchaseId, collectionId)) === '1'; }
  catch { return true; }
}

export function markVgsSubmissionStarted(purchaseId: string, collectionId: string) {
  sessionStorage.setItem(vgsSubmitFlagKey(purchaseId, collectionId), '1');
}

export function clearVgsSubmissionStarted(purchaseId: string, collectionId: string) {
  sessionStorage.removeItem(vgsSubmitFlagKey(purchaseId, collectionId));
}

export interface VaultCollection {
  collection_id: string;
  purchase_id: string;
  provider: VaultProvider;
  gateway: string;
  state: VaultCollectionState;
  expires_at: string;
  can_pay: boolean;
  can_enter_new_card: boolean;
  saving: 'not_requested';
  collection: Record<string, any> | null;
}

export interface VaultChargeResult {
  purchase_id: string;
  attempt_id: string | null;
  transaction_id: string | number | null;
  gateway_tx_id: string | null;
  gateway: string;
  status: string;
  amount: string;
  currency: string;
  next_action: Record<string, any> | null;
  invoice_payment_status?: string;
  invoice_status?: string;
}

export interface VaultReturnResult {
  status: string;
  environment: 'sandbox' | 'live';
  reference?: string | null;
  purchase_id?: string;
  attempt_id?: string | null;
  amount?: string;
  currency?: string;
  can_start_replacement: false;
}

export class PaymentApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfter?: string | null;

  constructor(message: string, status: number, code?: string, retryAfter?: string | null) {
    super(message);
    this.name = 'PaymentApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const endpointRetryAt = new Map<string, number>();
const endpointRetryCount = new Map<string, number>();

function retryAfterMs(value: string | null) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

function extractEnvelopeData<T>(envelope: any, status: number): T {
  if (!envelope || envelope.success !== true || !envelope.data || typeof envelope.data !== 'object') {
    throw new PaymentApiError(
      typeof envelope?.message === 'string' ? envelope.message : 'The payment service could not confirm this request.',
      status,
      typeof envelope?.code === 'string' ? envelope.code : undefined,
    );
  }
  return envelope.data as T;
}

async function postApi<T>(suffix: string, payload: Record<string, unknown>, expectedStatuses = [200, 201, 202]): Promise<T> {
  const url = paymentEndpoint(suffix);
  const endpointKey = `${url.pathname}${url.search}`;
  const retryAt = endpointRetryAt.get(endpointKey) || 0;
  if (retryAt > Date.now()) await new Promise(resolve => window.setTimeout(resolve, retryAt - Date.now()));

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
    throw new PaymentApiError('The request outcome is not confirmed. Recover the original checkout before trying again.', 0);
  }

  let envelope: any;
  try {
    envelope = await response.json();
  } catch {
    throw new PaymentApiError('The request outcome is not confirmed. Recover the original checkout before trying again.', response.status);
  }

  if (!response.ok || !expectedStatuses.includes(response.status)) {
    if (response.status === 429) {
      const count = (endpointRetryCount.get(endpointKey) || 0) + 1;
      endpointRetryCount.set(endpointKey, count);
      const backoff = Math.min(30000, 1000 * (2 ** Math.min(count, 5)));
      endpointRetryAt.set(endpointKey, Date.now() + Math.max(backoff, retryAfterMs(response.headers.get('Retry-After'))));
    }
    throw new PaymentApiError(
      typeof envelope?.message === 'string' ? envelope.message : 'The payment service could not confirm this request.',
      response.status,
      typeof envelope?.code === 'string' ? envelope.code : undefined,
      response.headers.get('Retry-After'),
    );
  }
  endpointRetryAt.delete(endpointKey);
  endpointRetryCount.delete(endpointKey);
  return extractEnvelopeData<T>(envelope, response.status);
}

function normalizeCollection(data: any): VaultCollection {
  const provider = String(data?.provider || '') as VaultProvider;
  const allowedProviders: VaultProvider[] = ['vgs', 'basis_theory', 'spreedly', 'pci_vault'];
  const allowedStates: VaultCollectionState[] = ['initializing', 'provisioning', 'collecting', 'ready', 'uncertain', 'consumed', 'revoked', 'failed', 'expired', 'unavailable'];
  if (!allowedProviders.includes(provider) || !data?.collection_id || !data?.purchase_id || !allowedStates.includes(data?.state)
    || (data.gateway === 'moov' || data.collection?.gateway === 'moov') && data.saving !== 'not_requested') {
    throw new Error('The payment service returned unsupported card preparation details. No payment was submitted.');
  }
  return {
    collection_id: String(data.collection_id),
    purchase_id: String(data.purchase_id),
    provider,
    gateway: String(data.gateway || data.collection?.gateway || ''),
    state: String(data.state) as VaultCollectionState,
    expires_at: String(data.expires_at || ''),
    can_pay: data.can_pay === true,
    can_enter_new_card: data.can_enter_new_card === true,
    saving: 'not_requested',
    collection: data.collection && typeof data.collection === 'object' ? data.collection : null,
  };
}

export function getPurchaseProof(checkout: WidgetCheckoutSession): PurchaseProof {
  if (!checkout.purchaseToken) throw new Error('This checkout is no longer authorized. Recover it before continuing.');
  return { purchase_id: checkout.purchaseId, purchase_token: checkout.purchaseToken };
}

function supportsVaultPair(config: WidgetCheckoutSession['collection']) {
  if (!config) return false;
  const providerSupported = config.provider === 'vgs'
    || config.provider === 'basis_theory' && ['sandbox', 'live'].includes(config.environment || '');
  if (!providerSupported) return false;
  if (config.payment_method && config.payment_method !== 'card') return false;
  return config.flow === 'vault_to_moov'
    ? config.gateway === 'moov'
    : config.flow === 'vault_to_stripe' && (config.gateway === undefined || config.gateway === 'stripe');
}

function paymentEndpoint(suffix: string) {
  const apiRoot = new URL(`${API_BASE_URL}/`);
  const paymentsRoot = new URL('payments/', apiRoot);
  const candidate = suffix.startsWith(`${apiRoot.pathname}payments/`)
    ? new URL(suffix, apiRoot.origin)
    : new URL(suffix.replace(/^\//, ''), paymentsRoot);
  if (candidate.origin !== apiRoot.origin || !candidate.pathname.startsWith(paymentsRoot.pathname)) {
    throw new Error('The payment service returned an unsafe payment endpoint.');
  }
  return candidate;
}

export async function beginVaultCollection(checkout: WidgetCheckoutSession): Promise<VaultCollection> {
  const configured = checkout.collection;
  if (!supportsVaultPair(configured) || checkout.canSubmit !== true) {
    throw new Error('Secure card collection is not available for this checkout. No payment was submitted.');
  }
  const endpoint = configured.begin_endpoint || (configured.flow === 'vault_to_stripe' ? 'vault-collections/' : undefined);
  if (!endpoint) throw new Error('The payment service did not provide a secure card collection endpoint.');
  const data = await postApi<any>(endpoint, getPurchaseProof(checkout));
  const collection = normalizeCollection(data);
  if (collection.purchase_id !== checkout.purchaseId || collection.provider !== configured.provider
    || configured.gateway && collection.gateway !== configured.gateway) {
    throw new Error('The card preparation does not match this checkout. Stop and contact support.');
  }
  return collection;
}

export async function getVaultCollectionStatus(
  collectionId: string,
  checkout: WidgetCheckoutSession,
): Promise<VaultCollection> {
  const data = await postApi<any>(`vault-collections/${encodeURIComponent(collectionId)}/status/`, getPurchaseProof(checkout));
  const collection = normalizeCollection(data);
  if (collection.collection_id !== collectionId || collection.purchase_id !== checkout.purchaseId || collection.provider !== checkout.collection?.provider
    || checkout.collection?.gateway && collection.gateway !== checkout.collection.gateway) {
    throw new Error('The card preparation status does not match this checkout.');
  }
  return collection;
}

export async function completeVaultCollection(
  collectionId: string,
  checkout: WidgetCheckoutSession,
  providerToken: string,
  payerNames?: { firstName: string; lastName: string },
): Promise<VaultCollection> {
  if (!providerToken.trim()) throw new Error('The secure card provider did not return a token.');
  const payload: Record<string, unknown> = {
    ...getPurchaseProof(checkout),
    provider_token: providerToken,
  };
  if (checkout.collection?.gateway === 'moov') {
    const firstName = payerNames?.firstName.trim() || '';
    const lastName = payerNames?.lastName.trim() || '';
    if (!firstName || !lastName || firstName.length > 64 || lastName.length > 64) {
      throw new Error('Enter a first and last name, each no longer than 64 characters.');
    }
    payload.payer_first_name = firstName;
    payload.payer_last_name = lastName;
  }
  const data = await postApi<any>(`vault-collections/${encodeURIComponent(collectionId)}/complete/`, {
    ...payload,
  });
  const collection = normalizeCollection(data);
  if (collection.collection_id !== collectionId || collection.purchase_id !== checkout.purchaseId || collection.provider !== checkout.collection?.provider
    || checkout.collection?.gateway && collection.gateway !== checkout.collection.gateway) {
    throw new Error('Card preparation completion does not match this checkout.');
  }
  return collection;
}

export async function requestNewVaultCard(
  collectionId: string,
  checkout: WidgetCheckoutSession,
): Promise<VaultCollection> {
  if (!supportsVaultPair(checkout.collection)) {
    throw new Error('This provider is not enabled for card replacement in the current checkout.');
  }
  const data = await postApi<any>(`vault-collections/${encodeURIComponent(collectionId)}/new-card/`, getPurchaseProof(checkout));
  const collection = normalizeCollection(data);
  if (collection.purchase_id !== checkout.purchaseId || collection.provider !== checkout.collection?.provider
    || checkout.collection?.gateway && collection.gateway !== checkout.collection.gateway) {
    throw new Error('The replacement card preparation does not match this checkout.');
  }
  return collection;
}

export async function submitVaultPayment(checkout: WidgetCheckoutSession, collection: VaultCollection): Promise<VaultChargeResult> {
  if (!checkout.canSubmit || !checkout.purchaseToken || !checkout.idempotencyKey) {
    throw new Error('This checkout is not authorized to submit payment. Recover its current status first.');
  }
  if (!supportsVaultPair(checkout.collection)
    || collection.provider !== checkout.collection.provider || !collection.can_pay || collection.state !== 'ready'
    || checkout.collection.gateway && collection.gateway !== checkout.collection.gateway
    || collection.purchase_id !== checkout.purchaseId) {
    throw new Error('Secure card preparation is not ready to pay.');
  }
  const data = await postApi<any>('router/charge/', {
    ...getPurchaseProof(checkout),
    idempotency_key: checkout.idempotencyKey,
    target_gateway: collection.gateway || checkout.collection.gateway || 'stripe',
    payment_method: 'card',
    vault_collection_id: collection.collection_id,
  });
  return {
    purchase_id: String(data?.purchase_id || ''),
    attempt_id: typeof data?.attempt_id === 'string' ? data.attempt_id : null,
    transaction_id: data?.transaction_id ?? null,
    gateway_tx_id: typeof data?.gateway_tx_id === 'string' ? data.gateway_tx_id : null,
    gateway: String(data?.gateway || ''),
    status: String(data?.status || 'unknown'),
    amount: String(data?.amount || ''),
    currency: String(data?.currency || '').toUpperCase(),
    next_action: data?.next_action && typeof data.next_action === 'object' ? data.next_action : null,
    invoice_payment_status: typeof data?.invoice_payment_status === 'string' ? data.invoice_payment_status : undefined,
    invoice_status: typeof data?.invoice_status === 'string' ? data.invoice_status : undefined,
  };
}

export async function getPurchasePaymentStatus(checkout: WidgetCheckoutSession): Promise<VaultChargeResult> {
  const data = await postApi<any>('purchases/status/', getPurchaseProof(checkout));
  if (String(data?.purchase_id || '') !== checkout.purchaseId) {
    throw new Error('Payment status does not match the original checkout. Keep the support reference and contact the merchant.');
  }
  const allowedStatuses = ['ready', 'submitting', 'processing', 'uncertain', 'requires_action', 'succeeded', 'failed', 'cancelled'];
  if (!allowedStatuses.includes(String(data?.status || ''))) {
    throw new Error('The payment service returned an unknown payment status. Keep the support reference and contact the merchant.');
  }
  return {
    purchase_id: String(data.purchase_id),
    attempt_id: typeof data.attempt_id === 'string' ? data.attempt_id : null,
    transaction_id: data.transaction_id ?? null,
    gateway_tx_id: typeof data.gateway_tx_id === 'string' ? data.gateway_tx_id : null,
    gateway: String(data.gateway || checkout.collection?.gateway || ''),
    status: String(data.status || 'unknown'),
    amount: typeof data.amount === 'string' ? data.amount : checkout.amount,
    currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : checkout.currency,
    next_action: data.next_action && typeof data.next_action === 'object' ? data.next_action : null,
    invoice_payment_status: typeof data.invoice_payment_status === 'string' ? data.invoice_payment_status : undefined,
    invoice_status: typeof data.invoice_status === 'string' ? data.invoice_status : undefined,
  };
}

const vaultPaymentStartedKey = (purchaseId: string) => `payora.vault-payment-started.v1:${purchaseId}`;
export function hasVaultPaymentStarted(purchaseId: string) {
  try { return sessionStorage.getItem(vaultPaymentStartedKey(purchaseId)) === '1'; } catch { return true; }
}
export function markVaultPaymentStarted(purchaseId: string) {
  sessionStorage.setItem(vaultPaymentStartedKey(purchaseId), '1');
  if (!hasVaultPaymentStarted(purchaseId)) throw new Error('Payment recovery could not be saved. Do not submit again; contact support.');
}

const newCardStartedKey = (purchaseId: string, collectionId: string) => `payora.vault-new-card-started.v1:${purchaseId}:${collectionId}`;
export function hasNewVaultCardStarted(purchaseId: string, collectionId: string) {
  try { return sessionStorage.getItem(newCardStartedKey(purchaseId, collectionId)) === '1'; } catch { return true; }
}
export function markNewVaultCardStarted(purchaseId: string, collectionId: string) {
  sessionStorage.setItem(newCardStartedKey(purchaseId, collectionId), '1');
  if (!hasNewVaultCardStarted(purchaseId, collectionId)) throw new Error('Card replacement recovery could not be saved. Do not repeat this request; contact support.');
}
export function clearNewVaultCardStarted(purchaseId: string, collectionId: string) {
  try { sessionStorage.removeItem(newCardStartedKey(purchaseId, collectionId)); } catch { /* Existing request is already resolved. */ }
}

export async function getVaultPaymentReturnStatus(returnToken: string): Promise<VaultReturnResult> {
  if (!returnToken) throw new Error('The bank return could not be verified.');
  const data = await postApi<any>('vault-payment-returns/status/', { return_token: returnToken });
  if (!['sandbox', 'live'].includes(data?.environment) || data?.can_start_replacement !== false) {
    throw new Error('The payment service returned incomplete bank return details.');
  }
  return {
    status: String(data.status || 'unknown'),
    environment: data.environment,
    reference: typeof data.reference === 'string' ? data.reference : null,
    purchase_id: typeof data.purchase_id === 'string' ? data.purchase_id : undefined,
    attempt_id: typeof data.attempt_id === 'string' ? data.attempt_id : null,
    amount: typeof data.amount === 'string' ? data.amount : undefined,
    currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : undefined,
    can_start_replacement: false,
  };
}
