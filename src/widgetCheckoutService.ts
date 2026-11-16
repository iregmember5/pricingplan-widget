import { API_BASE_URL } from './apiConfig';

export type WidgetKind = 'new' | 'legacy';

export interface WidgetCheckoutIdentity {
  widgetKind: WidgetKind;
  widgetId: string;
  planId: string;
  quantity: number;
  creationReference: string;
  recoverySecret: string;
  createAcknowledged?: boolean;
}

export interface WidgetCollectionConfig {
  provider: string;
  payment_method?: string;
  publishable_key?: string;
  stripe_account?: string | null;
  gateway?: string;
  flow?: string;
  begin_endpoint?: string;
  saving?: string;
}

export interface WidgetCheckoutSession {
  checkoutId: string;
  purchaseId: string;
  widgetKind: WidgetKind;
  widgetId: string;
  planId: string;
  planName: string;
  quantity: number;
  unitAmount: string;
  amount: string;
  currency: string;
  expiresAt: string;
  recoveryExpiresAt: string;
  status: string;
  canSubmit: boolean;
  purchaseToken: string | null;
  idempotencyKey: string;
  attemptId: string | null;
  nextAction: Record<string, any> | null;
  collection: WidgetCollectionConfig | null;
}

const STORAGE_PREFIX = 'payora.widget-checkout.v1';

function storageKey(widgetKind: WidgetKind, widgetId: string, planId: string) {
  return `${STORAGE_PREFIX}:${widgetKind}:${widgetId}:${planId}`;
}

function createUuidV4() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createRecoverySecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function extractData(body: any) {
  if (body?.success !== true || !body?.data || typeof body.data !== 'object') {
    const fieldErrors = body?.errors && typeof body.errors === 'object'
      ? Object.values(body.errors).flat().filter(Boolean).join(' ')
      : '';
    throw new Error(fieldErrors || body?.message || 'The checkout request was rejected.');
  }
  return body.data;
}

function normalizeSession(body: any): WidgetCheckoutSession {
  const row = extractData(body);
  const session: WidgetCheckoutSession = {
    checkoutId: String(row?.checkout_id || ''),
    purchaseId: String(row?.purchase_id || ''),
    widgetKind: row?.widget_kind,
    widgetId: String(row?.widget_id || ''),
    planId: String(row?.plan_id || ''),
    planName: String(row?.plan_name || ''),
    quantity: Number(row?.quantity || 1),
    unitAmount: String(row?.unit_amount ?? ''),
    amount: String(row?.amount ?? ''),
    currency: String(row?.currency || '').toUpperCase(),
    expiresAt: String(row?.expires_at || ''),
    recoveryExpiresAt: String(row?.recovery_expires_at || ''),
    status: String(row?.status || ''),
    canSubmit: row?.can_submit === true,
    purchaseToken: typeof row?.purchase_token === 'string' ? row.purchase_token : null,
    idempotencyKey: String(row?.idempotency_key || ''),
    attemptId: typeof row?.attempt_id === 'string' ? row.attempt_id : null,
    nextAction: row?.next_action && typeof row.next_action === 'object' ? row.next_action : null,
    collection: row?.collection && typeof row.collection === 'object' ? row.collection : null,
  };

  if (!session.checkoutId || !session.purchaseId || !session.widgetId || !session.planId
    || !['new', 'legacy'].includes(session.widgetKind)
    || !Number.isInteger(session.quantity) || session.quantity < 1
    || !/^\d+(\.\d{1,2})?$/.test(session.amount) || !/^[A-Z]{3}$/.test(session.currency)
    || !session.status) {
    throw new Error('The payment service returned an incomplete checkout session. Keep this page open and contact support.');
  }
  return session;
}

function assertCheckoutMatchesIdentity(session: WidgetCheckoutSession, identity: WidgetCheckoutIdentity) {
  if (session.widgetKind !== identity.widgetKind || session.widgetId !== identity.widgetId
    || session.planId !== identity.planId || session.quantity !== identity.quantity) {
    throw new Error('The payment service returned a checkout for a different published offer. Stop and contact support.');
  }
}

export class WidgetCheckoutRequestError extends Error {
  identity: WidgetCheckoutIdentity;
  phase: 'create' | 'status';

  constructor(message: string, identity: WidgetCheckoutIdentity, phase: 'create' | 'status') {
    super(message);
    this.name = 'WidgetCheckoutRequestError';
    this.identity = identity;
    this.phase = phase;
  }
}

async function post(path: string, payload: Record<string, unknown>, expectedStatuses?: number[]) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || body?.error || `Checkout request failed (HTTP ${response.status}).`;
    throw new Error(`${message} (HTTP ${response.status})`);
  }
  if (expectedStatuses && !expectedStatuses.includes(response.status)) {
    throw new Error(`Checkout creation returned unexpected HTTP ${response.status}; expected 200 or 201.`);
  }
  return body;
}

function readIdentity(key: string): WidgetCheckoutIdentity | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      value?.creationReference && value?.recoverySecret
      && value?.widgetKind && value?.widgetId && value?.planId
    ) return value as WidgetCheckoutIdentity;
  } catch {
    // An unreadable stored credential is not replaced automatically.
  }
  throw new Error('A saved checkout reference could not be read. Do not start another checkout in this tab.');
}

function persistIdentity(key: string, identity: WidgetCheckoutIdentity) {
  sessionStorage.setItem(key, JSON.stringify(identity));
}

function identityPayload(identity: WidgetCheckoutIdentity) {
  return {
    creation_reference: identity.creationReference,
    recovery_secret: identity.recoverySecret,
  };
}

export async function resumeWidgetCheckout(identity: WidgetCheckoutIdentity) {
  const body = await post('/payments/widget-checkouts/resume/', identityPayload(identity));
  return normalizeSession(body);
}

export async function getWidgetCheckoutStatus(identity: WidgetCheckoutIdentity) {
  const body = await post('/payments/widget-checkouts/status/', identityPayload(identity));
  const session = normalizeSession(body);
  assertCheckoutMatchesIdentity(session, identity);
  return session;
}

export async function getOrCreateWidgetCheckout(input: {
  widgetKind: WidgetKind;
  widgetId: string;
  planId: string;
  quantity?: number;
}) {
  const { widgetKind, widgetId, planId, quantity = 1 } = input;
  const key = storageKey(widgetKind, widgetId, planId);
  const existing = readIdentity(key);
  const identity: WidgetCheckoutIdentity = existing || {
    widgetKind,
    widgetId,
    planId,
    quantity,
    creationReference: createUuidV4(),
    recoverySecret: createRecoverySecret(),
  };
  if (!existing) {
    // Persist the original credentials before the first create request. Every
    // retry replays creation with this exact identity and plan selection.
    persistIdentity(key, identity);
  }

  // Creation is an idempotent create-or-recover operation keyed by the
  // persisted reference and secret. Replay it before status so an identity
  // saved before a lost creation response can be recovered (and so an
  // acknowledged checkout is resolved to the same canonical purchase).
  // This endpoint does not submit a payment. Never mint a new identity here.
  let createdSession: WidgetCheckoutSession;
  try {
    const creationBody = await post('/payments/widget-checkouts/', {
      widget_kind: widgetKind,
      widget_id: widgetId,
      plan_id: planId,
      quantity: identity.quantity,
      creation_reference: identity.creationReference,
      recovery_secret: identity.recoverySecret,
    }, [200, 201]);
    createdSession = normalizeSession(creationBody);
    assertCheckoutMatchesIdentity(createdSession, identity);
    const acknowledgedIdentity = { ...identity, createAcknowledged: true };
    persistIdentity(key, acknowledgedIdentity);
    Object.assign(identity, acknowledgedIdentity);
  } catch (error: any) {
    if (error instanceof WidgetCheckoutRequestError) throw error;
    throw new WidgetCheckoutRequestError(
      error?.message || 'Checkout could not be created. Keep this checkout and retry the same request.',
      identity,
      'create',
    );
  }

  // Follow successful creation/replay with the exact same recovery identity.
  // This lets the UI use the status endpoint's current authoritative state.
  let statusSession: WidgetCheckoutSession;
  try {
    statusSession = await getWidgetCheckoutStatus(identity);
  } catch (error: any) {
    throw new WidgetCheckoutRequestError(
      `Checkout creation succeeded, but status could not be retrieved. Keep this checkout and recover its status. ${error?.message || ''}`.trim(),
      identity,
      'status',
    );
  }
  if (statusSession.purchaseId !== createdSession.purchaseId) {
    throw new Error('Checkout creation and status returned different purchase references. Keep this checkout and contact support before paying.');
  }
  return { identity, session: statusSession, recovered: Boolean(existing) };
}
