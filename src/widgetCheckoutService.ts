import { API_BASE_URL } from './apiConfig';

export type WidgetKind = 'new' | 'legacy';

export interface WidgetCheckoutIdentity {
  widgetKind: WidgetKind;
  widgetId: string;
  planId: string;
  quantity: number;
  amountMinor?: number;
  currencyMinorDigits?: number;
  referenceId?: string;
  comments?: string;
  embedOrigin?: string;
  creationReference: string;
  recoverySecret: string;
  createAcknowledged?: boolean;
}

export interface WidgetCollectionConfig {
  provider: string;
  payment_method?: string;
  environment?: string;
  publishable_key?: string;
  stripe_account?: string | null;
  gateway?: string;
  flow?: string;
  begin_endpoint?: string;
  saving?: string;
}

export interface WidgetPaymentStatus {
  status?: string;
  transaction_id?: string | number | null;
  gateway_tx_id?: string | null;
  settlement_status?: string;
  receipt_available?: boolean;
  can_start_replacement?: boolean;
  payment_method?: string;
  amount?: string;
  currency?: string;
}

export interface WidgetCheckoutSession {
  checkoutId: string;
  purchaseId: string;
  widgetKind: WidgetKind;
  widgetId: string;
  planId: string;
  planName: string;
  pricingMode: string;
  referenceId: string;
  comments: string;
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
  payment: WidgetPaymentStatus | null;
  servicePaymentPlan: Record<string, any> | null;
}

const STORAGE_PREFIX = 'payora.widget-checkout.v1';
const endpointRetryAt = new Map<string, number>();
const endpointRetryCount = new Map<string, number>();

function retryAfterMs(value: string | null) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

function storageKey(widgetKind: WidgetKind, widgetId: string, planId: string) {
  // A PWYW widget has one pending intent at a time. A changed amount must not
  // silently mint a second identity while the previous request is unresolved.
  const identityKey = planId || 'pwyw-pending';
  return `${STORAGE_PREFIX}:${widgetKind}:${widgetId}:${identityKey}`;
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
      ? Object.values(body.errors).flatMap((value: any) => Array.isArray(value) ? value : [value]).filter(Boolean).join(' ')
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
    planId: row?.plan_id == null ? '' : String(row.plan_id),
    planName: String(row?.plan_name || ''),
    pricingMode: String(row?.pricing_mode || ''),
    referenceId: String(row?.reference_id || ''),
    comments: String(row?.comments || ''),
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
    payment: row?.payment && typeof row.payment === 'object' ? row.payment : null,
    servicePaymentPlan: row?.service_payment_plan && typeof row.service_payment_plan === 'object' ? row.service_payment_plan : null,
  };

  if (!session.checkoutId || !session.purchaseId || !session.widgetId
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
    || identity.planId && session.planId !== identity.planId
    || !identity.planId && session.planId && !(session.planId === 'pay_what_you_want' && (session.pricingMode === 'pay_what_you_want' || Number.isInteger(identity.amountMinor)))
    || session.quantity !== identity.quantity) {
    throw new Error('The payment service returned a checkout for a different published offer. Stop and contact support.');
  }
}

function checkoutCreatePayload(identity: WidgetCheckoutIdentity) {
  return {
    widget_kind: identity.widgetKind,
    widget_id: identity.widgetId,
    ...(identity.planId ? { plan_id: identity.planId } : {}),
    quantity: identity.quantity,
    ...(Number.isInteger(identity.amountMinor) ? { amount_minor: identity.amountMinor } : {}),
    ...(identity.referenceId ? { reference_id: identity.referenceId } : {}),
    ...(identity.comments ? { comments: identity.comments } : {}),
    ...(identity.embedOrigin ? { embed_origin: identity.embedOrigin } : {}),
    creation_reference: identity.creationReference,
    recovery_secret: identity.recoverySecret,
  };
}

export class WidgetCheckoutRequestError extends Error {
  identity: WidgetCheckoutIdentity;
  phase: 'create' | 'status';
  httpStatus: number | null;
  fieldErrors: Record<string, string[]>;

  constructor(message: string, identity: WidgetCheckoutIdentity, phase: 'create' | 'status', httpStatus: number | null = null, fieldErrors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'WidgetCheckoutRequestError';
    this.identity = identity;
    this.phase = phase;
    this.httpStatus = httpStatus;
    this.fieldErrors = fieldErrors;
  }
}

async function post(path: string, payload: Record<string, unknown>, expectedStatuses?: number[]) {
  const retryAt = endpointRetryAt.get(path) || 0;
  if (retryAt > Date.now()) await new Promise(resolve => window.setTimeout(resolve, retryAt - Date.now()));
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
    if (response.status === 429) {
      const count = (endpointRetryCount.get(path) || 0) + 1;
      endpointRetryCount.set(path, count);
      const backoff = Math.min(30000, 1000 * (2 ** Math.min(count, 5)));
      endpointRetryAt.set(path, Date.now() + Math.max(backoff, retryAfterMs(response.headers.get('Retry-After'))));
    }
    const rawErrors = body?.errors && typeof body.errors === 'object' ? body.errors : {};
    const fieldErrors = Object.fromEntries(Object.entries(rawErrors).map(([key, value]: [string, any]) => [key, (Array.isArray(value) ? value : [value]).map(String)]));
    const message = body?.message || body?.error || Object.values(fieldErrors).flat().join(' ') || `Checkout request failed (HTTP ${response.status}).`;
    const error: any = new Error(`${message} (HTTP ${response.status})`);
    error.httpStatus = response.status;
    error.fieldErrors = fieldErrors;
    throw error;
  }
  endpointRetryAt.delete(path);
  endpointRetryCount.delete(path);
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
      && value?.widgetKind && value?.widgetId && value?.planId !== undefined
    ) return value as WidgetCheckoutIdentity;
  } catch {
    // An unreadable stored credential is not replaced automatically.
  }
  throw new Error('A saved checkout reference could not be read. Do not start another checkout in this tab.');
}

export function getSavedPayWhatYouWantIntent(widgetId: string) {
  try {
    const identity = readIdentity(storageKey('new', widgetId, ''));
    if (!identity || !Number.isInteger(identity.amountMinor)) return null;
    return {
      amount: (identity.amountMinor! / (10 ** (identity.currencyMinorDigits ?? 2))).toFixed(identity.currencyMinorDigits ?? 2),
      currencyMinorDigits: identity.currencyMinorDigits ?? 2,
      referenceId: identity.referenceId || '',
      comments: identity.comments || '',
      embedOrigin: identity.embedOrigin || '',
      locked: true,
    };
  } catch {
    return null;
  }
}

export function clearConfirmedPayWhatYouWantIntent(identity: WidgetCheckoutIdentity) {
  if (!identity.widgetId || identity.planId) return;
  sessionStorage.removeItem(storageKey(identity.widgetKind, identity.widgetId, ''));
}

export function clearTerminalPayWhatYouWantIntent(identity: WidgetCheckoutIdentity, session: WidgetCheckoutSession) {
  const safeTerminal = ['offer_changed', 'offer_unavailable', 'expired'].includes(session.status)
    && !session.attemptId && !session.payment;
  if (!identity.widgetId || identity.planId || !safeTerminal) return false;
  sessionStorage.removeItem(storageKey(identity.widgetKind, identity.widgetId, ''));
  return true;
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
  const session = normalizeSession(body);
  assertCheckoutMatchesIdentity(session, identity);
  return session;
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
  planId?: string;
  quantity?: number;
  amountMinor?: number;
  currencyMinorDigits?: number;
  referenceId?: string;
  comments?: string;
  embedOrigin?: string;
}) {
  const { widgetKind, widgetId, planId = '', quantity = 1, amountMinor, currencyMinorDigits = 2, referenceId, comments, embedOrigin } = input;
  const key = storageKey(widgetKind, widgetId, planId);
  const existing = readIdentity(key);
  if (existing && (!planId && (existing.amountMinor !== amountMinor
    || (existing.referenceId || '') !== (referenceId || '')
    || (existing.comments || '') !== (comments || '')
    || (existing.embedOrigin || '') !== (embedOrigin || '')))) {
    throw new Error('A previous payment request for this widget is still saved. Retry it with the same amount and details, or check its payment status before starting another payment.');
  }
  const identity: WidgetCheckoutIdentity = existing || {
    widgetKind,
    widgetId,
    planId,
    quantity,
    ...(Number.isInteger(amountMinor) ? { amountMinor } : {}),
    ...(Number.isInteger(amountMinor) ? { currencyMinorDigits } : {}),
    ...(referenceId ? { referenceId } : {}),
    ...(comments ? { comments } : {}),
    ...(embedOrigin ? { embedOrigin } : {}),
    creationReference: createUuidV4(),
    recoverySecret: createRecoverySecret(),
  };
  if (!existing) {
    // Persist the original credentials before the first create request. Every
    // retry replays creation with this exact identity and plan selection.
    persistIdentity(key, identity);
  }

  if (existing?.createAcknowledged) {
    // A known-created checkout is recovered. An expired no-attempt checkout
    // returns immediately so it is not repeatedly resumed or status-polled.
    const resumed = await resumeWidgetCheckout(existing);
    assertCheckoutMatchesIdentity(resumed, existing);
    if (resumed.status === 'expired' && !resumed.attemptId && !resumed.payment) {
      return { identity: existing, session: resumed, recovered: true };
    }
    const current = await getWidgetCheckoutStatus(existing);
    assertCheckoutMatchesIdentity(current, existing);
    if (resumed.purchaseId !== current.purchaseId) {
      throw new Error('Checkout recovery returned different purchase references. Keep the support reference and contact the merchant.');
    }
    return { identity: existing, session: current, recovered: true };
  }

  // A first request or an unacknowledged pending request replays create with
  // its saved identity. This safely recovers a lost create response without
  // minting a second identity.
  let createdSession: WidgetCheckoutSession;
  try {
    const creationBody = await post('/payments/widget-checkouts/', checkoutCreatePayload(identity), [200, 201]);
    createdSession = normalizeSession(creationBody);
    assertCheckoutMatchesIdentity(createdSession, identity);
    const acknowledgedIdentity = { ...identity, createAcknowledged: true };
    persistIdentity(key, acknowledgedIdentity);
    Object.assign(identity, acknowledgedIdentity);
  } catch (error: any) {
    if (error instanceof WidgetCheckoutRequestError) throw error;
    const status = Number(error?.message?.match(/\(HTTP (\d{3})\)/)?.[1]) || null;
    if (status === 409) {
      try {
        const resumed = await resumeWidgetCheckout(identity);
        const acknowledgedIdentity = { ...identity, createAcknowledged: true };
        persistIdentity(key, acknowledgedIdentity);
        const current = await getWidgetCheckoutStatus(acknowledgedIdentity);
        if (current.purchaseId === resumed.purchaseId) return { identity: acknowledgedIdentity, session: current, recovered: true };
      } catch {
        // Leave the same identity in place. The UI can retry or check status;
        // it must not manufacture a replacement identity for an unresolved 409.
      }
    }
    if (status === 400 || status === 422) sessionStorage.removeItem(key);
    throw new WidgetCheckoutRequestError(
      error?.message || 'Checkout could not be created. Keep this checkout and retry the same request.',
      identity,
      'create',
      error?.httpStatus || status,
      error?.fieldErrors || {},
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

function archiveCheckoutReference(key: string, identity: WidgetCheckoutIdentity, session: WidgetCheckoutSession) {
  const historyKey = `${key}:history`;
  let history: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(historyKey) || '[]');
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    // Keep the new checkout usable if older local history cannot be parsed.
  }
  history.push({
    creationReference: identity.creationReference,
    checkoutId: session.checkoutId,
    purchaseId: session.purchaseId,
    status: session.status,
    archivedAt: new Date().toISOString(),
  });
  sessionStorage.setItem(historyKey, JSON.stringify(history.slice(-20)));
}

export async function startNewWidgetCheckout(input: {
  widgetKind: WidgetKind;
  widgetId: string;
  planId?: string;
  quantity: number;
  amountMinor?: number;
  currencyMinorDigits?: number;
  referenceId?: string;
  comments?: string;
  embedOrigin?: string;
  expiredIdentity: WidgetCheckoutIdentity;
  expiredSession: WidgetCheckoutSession;
  pendingIdentity?: WidgetCheckoutIdentity | null;
}) {
  const { widgetKind, widgetId, planId = '', quantity, expiredIdentity, expiredSession } = input;
  if (expiredSession.status !== 'expired' || expiredSession.attemptId || expiredSession.payment) {
    throw new Error('We’re still checking the previous payment. Refresh its status before starting another checkout.');
  }

  const intent = {
    amountMinor: input.amountMinor ?? expiredIdentity.amountMinor,
    currencyMinorDigits: input.currencyMinorDigits ?? expiredIdentity.currencyMinorDigits ?? 2,
    referenceId: input.referenceId ?? expiredIdentity.referenceId ?? '',
    comments: input.comments ?? expiredIdentity.comments ?? '',
    embedOrigin: input.embedOrigin ?? expiredIdentity.embedOrigin ?? '',
  };
  const key = storageKey(widgetKind, widgetId, planId);
  let identity = input.pendingIdentity || null;
  if (!identity) {
    identity = {
      widgetKind,
      widgetId,
      planId,
      quantity,
      ...(Number.isInteger(intent.amountMinor) ? { amountMinor: intent.amountMinor } : {}),
      ...(Number.isInteger(intent.amountMinor) ? { currencyMinorDigits: intent.currencyMinorDigits } : {}),
      ...(intent.referenceId ? { referenceId: intent.referenceId } : {}),
      ...(intent.comments ? { comments: intent.comments } : {}),
      ...(intent.embedOrigin ? { embedOrigin: intent.embedOrigin } : {}),
      creationReference: createUuidV4(),
      recoverySecret: createRecoverySecret(),
    };
    archiveCheckoutReference(key, expiredIdentity, expiredSession);
    // Persist before network I/O so a timeout or refresh reuses this identity.
    persistIdentity(key, identity);
  }

  let createdSession: WidgetCheckoutSession;
  try {
    const creationBody = await post('/payments/widget-checkouts/', checkoutCreatePayload(identity), [200, 201]);
    createdSession = normalizeSession(creationBody);
    assertCheckoutMatchesIdentity(createdSession, identity);
    const acknowledgedIdentity = { ...identity, createAcknowledged: true };
    persistIdentity(key, acknowledgedIdentity);
    identity = acknowledgedIdentity;
  } catch (error: any) {
    const status = Number(error?.message?.match(/\(HTTP (\d{3})\)/)?.[1]) || null;
    if (status === 400 || status === 422) sessionStorage.removeItem(key);
    throw new WidgetCheckoutRequestError(
      error?.message || 'We could not start your new checkout. Retry to safely recover the same request.',
      identity,
      'create',
      status,
    );
  }

  try {
    const statusSession = await getWidgetCheckoutStatus(identity);
    if (statusSession.purchaseId !== createdSession.purchaseId) {
      throw new Error('The new checkout reference did not match its status. Keep this page open and contact support before paying.');
    }
    return { identity, session: statusSession };
  } catch (error: any) {
    throw new WidgetCheckoutRequestError(
      `Your new checkout was created, but its latest status could not be confirmed. Retry to recover this same checkout. ${error?.message || ''}`.trim(),
      identity,
      'status',
    );
  }
}
