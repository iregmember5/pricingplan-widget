import { API_BASE_URL } from './apiConfig';
import type { WidgetCheckoutSession } from './widgetCheckoutService';

export type VaultProvider = 'vgs' | 'basis_theory' | 'spreedly' | 'pci_vault';
export type VaultCollectionState =
  | 'initializing' | 'provisioning' | 'collecting' | 'ready' | 'uncertain'
  | 'consumed' | 'revoked' | 'failed' | 'expired';

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
  const base = new URL(`${API_BASE_URL}/payments/`);
  const url = new URL(suffix.replace(/^\//, ''), `${base.toString().replace(/\/$/, '')}/`);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
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
    throw new PaymentApiError('The request outcome is not confirmed. Recover the original checkout before trying again.', 0);
  }

  let envelope: any;
  try {
    envelope = await response.json();
  } catch {
    throw new PaymentApiError('The request outcome is not confirmed. Recover the original checkout before trying again.', response.status);
  }

  if (!response.ok || !expectedStatuses.includes(response.status)) {
    throw new PaymentApiError(
      typeof envelope?.message === 'string' ? envelope.message : 'The payment service could not confirm this request.',
      response.status,
      typeof envelope?.code === 'string' ? envelope.code : undefined,
      response.headers.get('Retry-After'),
    );
  }
  return extractEnvelopeData<T>(envelope, response.status);
}

function normalizeCollection(data: any): VaultCollection {
  const provider = String(data?.provider || '') as VaultProvider;
  const allowedProviders: VaultProvider[] = ['vgs', 'basis_theory', 'spreedly', 'pci_vault'];
  if (!allowedProviders.includes(provider) || !data?.collection_id || !data?.purchase_id || !data?.state) {
    throw new Error('The payment service returned unsupported card preparation details. No payment was submitted.');
  }
  return {
    collection_id: String(data.collection_id),
    purchase_id: String(data.purchase_id),
    provider,
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

export async function beginVaultCollection(checkout: WidgetCheckoutSession): Promise<VaultCollection> {
  const configured = checkout.collection;
  if (configured?.flow !== 'vault_to_stripe' || configured.provider !== 'vgs' || checkout.canSubmit !== true) {
    throw new Error('Secure card collection is not available for this checkout. No payment was submitted.');
  }
  const data = await postApi<any>('vault-collections/', getPurchaseProof(checkout));
  const collection = normalizeCollection(data);
  if (collection.purchase_id !== checkout.purchaseId || collection.provider !== configured.provider) {
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
  if (collection.collection_id !== collectionId || collection.purchase_id !== checkout.purchaseId) {
    throw new Error('The card preparation status does not match this checkout.');
  }
  return collection;
}

export async function completeVaultCollection(
  collectionId: string,
  checkout: WidgetCheckoutSession,
  providerToken: string,
): Promise<VaultCollection> {
  if (!providerToken.trim()) throw new Error('The secure card provider did not return a token.');
  const data = await postApi<any>(`vault-collections/${encodeURIComponent(collectionId)}/complete/`, {
    ...getPurchaseProof(checkout),
    provider_token: providerToken,
  });
  const collection = normalizeCollection(data);
  if (collection.collection_id !== collectionId || collection.purchase_id !== checkout.purchaseId) {
    throw new Error('Card preparation completion does not match this checkout.');
  }
  return collection;
}

export async function requestNewVaultCard(
  collectionId: string,
  checkout: WidgetCheckoutSession,
): Promise<VaultCollection> {
  if (checkout.collection?.provider !== 'vgs') {
    throw new Error('This provider is not enabled for card replacement in the current checkout.');
  }
  const data = await postApi<any>(`vault-collections/${encodeURIComponent(collectionId)}/new-card/`, getPurchaseProof(checkout));
  const collection = normalizeCollection(data);
  if (collection.purchase_id !== checkout.purchaseId || collection.provider !== checkout.collection?.provider) {
    throw new Error('The replacement card preparation does not match this checkout.');
  }
  return collection;
}

export async function submitVaultPayment(checkout: WidgetCheckoutSession, collection: VaultCollection): Promise<VaultChargeResult> {
  if (!checkout.canSubmit || !checkout.purchaseToken || !checkout.idempotencyKey) {
    throw new Error('This checkout is not authorized to submit payment. Recover its current status first.');
  }
  if (checkout.collection?.flow !== 'vault_to_stripe' || checkout.collection.provider !== 'vgs'
    || collection.provider !== 'vgs' || !collection.can_pay || collection.state !== 'ready'
    || collection.purchase_id !== checkout.purchaseId) {
    throw new Error('Secure card preparation is not ready to pay.');
  }
  const data = await postApi<any>('router/charge/', {
    ...getPurchaseProof(checkout),
    idempotency_key: checkout.idempotencyKey,
    target_gateway: 'stripe',
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
