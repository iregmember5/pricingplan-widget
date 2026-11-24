import { API_BASE_URL } from './apiConfig';
import type { WidgetCheckoutSession } from './widgetCheckoutService';

const PREFIX = 'payora.service-plan.v1.';

function unwrap(body: any) {
  if (body?.success !== true || !body?.data || typeof body.data !== 'object') {
    const errors = body?.errors && typeof body.errors === 'object' ? Object.values(body.errors).flat().filter(Boolean).join(' ') : '';
    throw new Error(errors || body?.message || 'The payment service did not confirm this request.');
  }
  return body.data;
}

async function post(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload), credentials: 'omit', cache: 'no-store', redirect: 'error',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${body?.message || body?.error || 'Payment request failed.'} (HTTP ${response.status})`);
  return unwrap(body);
}

const planKey = (rootId: string) => `${PREFIX}root.${rootId}`;
const tokenKey = (id: string) => `${PREFIX}token.${id}`;
const quoteKey = (id: string) => `${PREFIX}quote.${id}`;
const previewKey = (id: string) => `${PREFIX}preview.${id}`;
export const readWidgetPlanForRoot = (rootId: string) => sessionStorage.getItem(planKey(rootId));
export const readWidgetPlanToken = (id: string) => sessionStorage.getItem(tokenKey(id));
export const readWidgetPlanQuote = (id: string) => sessionStorage.getItem(quoteKey(id));
export const readWidgetPlanQuotePreview = (id: string) => { try { return JSON.parse(sessionStorage.getItem(previewKey(id)) || 'null'); } catch { return null; } };
export function clearWidgetPlanQuote(id: string, quoteId: string) {
  sessionStorage.removeItem(quoteKey(id));
  sessionStorage.removeItem(previewKey(id));
  sessionStorage.removeItem(`payora.service-plan.child.${id}.${quoteId}`);
}
const proof = (id: string) => {
  const token = readWidgetPlanToken(id);
  if (!token) throw new Error('Private plan access is unavailable. Contact the business to restore access securely.');
  return { plan_id: id, plan_token: token };
};

export async function enrollWidgetServicePlan(session: WidgetCheckoutSession, includeDeposit: boolean | null, email?: string) {
  if (!session.purchaseToken || !session.servicePaymentPlan?.revision_id) throw new Error('The original checkout does not contain valid plan enrollment authority.');
  const data = await post('/payments/service-payment-plans/', {
    purchase_id: session.purchaseId, purchase_token: session.purchaseToken,
    revision_id: session.servicePaymentPlan.revision_id, agreement_accepted: true,
    ...(includeDeposit == null ? {} : { include_deposit: includeDeposit }), ...(email ? { buyer_email: email } : {}),
  });
  const id = String(data?.plan?.id || '');
  if (!id || typeof data.plan_token !== 'string' || !data.plan_token) throw new Error('The service returned an incomplete plan agreement.');
  sessionStorage.setItem(planKey(session.purchaseId), id);
  sessionStorage.setItem(tokenKey(id), data.plan_token);
  return { plan: data.plan, id };
}

export const getWidgetPlanStatus = (id: string) => post('/payments/service-payment-plans/status/', proof(id));
export async function requestWidgetPlanQuote(id: string, option: string, amount?: string, extraAmount?: string) {
  const intentKey = `${PREFIX}quote-intent.${id}.${option}.${amount || ''}.${extraAmount || ''}`;
  const creationReference = sessionStorage.getItem(intentKey) || crypto.randomUUID();
  sessionStorage.setItem(intentKey, creationReference);
  const result = await post('/payments/service-payment-plans/quote/', {
    ...proof(id), creation_reference: creationReference, option,
    ...(option === 'custom' && amount ? { amount } : {}), ...(option === 'due_plus_extra' && extraAmount ? { extra_amount: extraAmount } : {}),
  });
  sessionStorage.removeItem(intentKey);
  if (result?.id) { sessionStorage.setItem(quoteKey(id), String(result.id)); sessionStorage.setItem(previewKey(id), JSON.stringify(result)); }
  return result;
}
export const checkoutWidgetPlanQuote = (id: string, quoteId: string) => post('/payments/service-payment-plans/checkout/', { ...proof(id), quote_id: quoteId });
export const reconcileWidgetServicePlan = (id: string, quoteId: string) => post('/payments/service-payment-plans/reconcile/', { ...proof(id), quote_id: quoteId });
export async function chargeWidgetPlanQuote(checkout: any, quoteId: string, paymentMethod: string) {
  return post('/payments/purchase-payments/', {
    purchase_id: checkout.purchase_id, purchase_token: checkout.purchase_token,
    idempotency_key: checkout.idempotency_key, service_quote_id: quoteId,
    target_gateway: checkout.collection?.gateway, payment_method: checkout.collection?.payment_method,
    stripe_payment_method: paymentMethod,
  });
}
