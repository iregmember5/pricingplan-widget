import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadModule(path) {
  const result = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const ach = await loadModule('../src/cpachargeAchService.ts');
const widget = await loadModule('../src/widgetCheckoutService.ts');
const sampleFormData = { mypowerly_collection_id: 'collection-1', account_type: 'checking', custom_key: 'issued-value' };
const issueCollection = (purchaseId = 'purchase-1', amount = '25.00') => ({
  collection_id: 'collection-1', purchase_id: purchaseId, provider: 'cpacharge', payment_method: 'ach',
  flow: 'hosted_bank_token', environment: 'live', public_key: 'public-key', form_data: sampleFormData,
  authorization_version: 'auth-v2', authorization_text: 'I authorize this debit.', amount, currency: 'USD',
  expires_at: new Date(Date.now() + 60_000).toISOString(), submitted: false,
});
function mockFetch(response, inspect) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    inspect?.(String(url), options);
    return new Response(JSON.stringify({ success: true, data: response }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return () => { globalThis.fetch = original; };
}

test('live widget ACH collection uses issued collection fields without changing form_data', async () => {
  const restore = mockFetch(issueCollection(), (url, request) => {
    assert.match(url, /\/payments\/ach-collections\/$/);
    assert.deepEqual(JSON.parse(request.body), { purchase_id: 'purchase-1', purchase_token: 'purchase-token' });
    assert.equal(request.credentials, 'omit');
  });
  try {
    const checkout = { purchaseId: 'purchase-1', purchaseToken: 'purchase-token', collection: {
      flow: 'hosted_bank_token', gateway: 'cpacharge', provider: 'cpacharge', payment_method: 'ach', begin_endpoint: '/v1/api/payments/ach-collections/', environment: 'live',
    }, currency: 'USD', amount: '25.00', status: 'ready', canSubmit: true };
    const value = await ach.beginCpachargeAchCollection(checkout);
    assert.equal(value.environment, 'live');
    assert.deepEqual(value.form_data, sampleFormData);
    assert.equal(value.authorization_version, 'auth-v2');
  } finally { restore(); }
});

test('widget ACH submits scoped proof and explicit authorization, without amount or bank details', async () => {
  const restore = mockFetch({ purchase_id: 'purchase-1', gateway: 'cpacharge', status: 'processing', amount: '25.00', currency: 'USD' }, (_url, request) => {
    assert.match(String(_url), /\/payments\/purchase-payments\/$/);
    const body = JSON.parse(request.body);
    assert.deepEqual(body, { purchase_id: 'purchase-1', purchase_token: 'purchase-token', idempotency_key: 'key-1', target_gateway: 'cpacharge', payment_method: 'ach', ach_collection_id: 'collection-1', cpacharge_token: 'provider-token', authorization_accepted: true, authorization_version: 'auth-v2' });
    assert.equal('amount' in body, false);
    assert.equal('account_number' in body, false);
  });
  try {
    const checkout = { purchaseId: 'purchase-1', purchaseToken: 'purchase-token', idempotencyKey: 'key-1', collection: { flow: 'hosted_bank_token', gateway: 'cpacharge', provider: 'cpacharge', payment_method: 'ach', environment: 'live' }, currency: 'USD', amount: '25.00', status: 'ready', canSubmit: true };
    const collection = { ...issueCollection(), purchase_id: 'purchase-1' };
    const result = await ach.submitCpachargeAchPayment(checkout, collection, 'provider-token');
    assert.equal(result.status, 'processing');
  } finally { restore(); }
});

test('a live PWYW status response is recognized as CPACharge ACH', async () => {
  const identity = {
    widgetKind: 'new', widgetId: 'widget-1', planId: '', quantity: 1, amountMinor: 100,
    creationReference: 'original-reference', recoverySecret: 'original-secret',
  };
  const restore = mockFetch({
    checkout_id: 'checkout-1',
    purchase_id: 'purchase-1',
    widget_kind: 'new',
    widget_id: 'widget-1',
    plan_id: 'pay_what_you_want',
    pricing_mode: 'pay_what_you_want',
    quantity: 1,
    unit_amount: '1.00',
    amount: '1.00',
    currency: 'USD',
    status: 'ready',
    can_submit: true,
    purchase_token: 'purchase-token',
    idempotency_key: 'key-1',
    collection: {
      provider: 'cpacharge', gateway: 'cpacharge', payment_method: 'ach', flow: 'hosted_bank_token',
      environment: 'live', begin_endpoint: '/v1/api/payments/ach-collections/', saving: 'not_requested',
    },
  }, (url, request) => {
    assert.match(url, /\/payments\/widget-checkouts\/status\/$/);
    assert.deepEqual(JSON.parse(request.body), { creation_reference: 'original-reference', recovery_secret: 'original-secret' });
  });
  try {
    const checkout = await widget.getWidgetCheckoutStatus(identity);
    assert.equal(ach.supportsCpachargeAch(checkout), true);
    assert.equal(ach.supportsCpachargeAch({ ...checkout, collection: { ...checkout.collection, environment: 'sandbox' } }), true);
    assert.equal(ach.supportsCpachargeAch({ ...checkout, collection: { ...checkout.collection, environment: 'unknown' } }), false);
    assert.equal(ach.supportsCpachargeAch({ ...checkout, currency: 'CAD' }), false);
  } finally { restore(); }
});

test('an ACH collection for another purchase is rejected', async () => {
  const restore = mockFetch(issueCollection('other-purchase'));
  try {
    const checkout = { purchaseId: 'purchase-1', purchaseToken: 'purchase-token', collection: { provider: 'cpacharge', flow: 'hosted_bank_token', gateway: 'cpacharge', payment_method: 'ach', begin_endpoint: '/v1/api/payments/ach-collections/', environment: 'live' }, amount: '25.00', currency: 'USD', status: 'ready', canSubmit: true };
    await assert.rejects(ach.beginCpachargeAchCollection(checkout), /mismatched bank checkout/);
  } finally { restore(); }
});

test('a live checkout rejects a sandbox collection and an expired collection before charging', async () => {
  const checkout = {
    purchaseId: 'purchase-1', purchaseToken: 'purchase-token', idempotencyKey: 'key-1',
    amount: '25.00', currency: 'USD', status: 'ready', canSubmit: true,
    collection: {
      provider: 'cpacharge', gateway: 'cpacharge', payment_method: 'ach', flow: 'hosted_bank_token',
      environment: 'live', begin_endpoint: '/v1/api/payments/ach-collections/',
    },
  };
  const sandbox = { ...issueCollection(), environment: 'sandbox' };
  const restore = mockFetch(sandbox, (url) => assert.match(url, /\/payments\/ach-collections\/$/));
  try {
    await assert.rejects(ach.beginCpachargeAchCollection(checkout), /mismatched bank checkout/);
    await assert.rejects(ach.submitCpachargeAchPayment(checkout, sandbox, 'provider-token'), /not ready to submit/);
    const expired = { ...issueCollection(), expires_at: new Date(Date.now() - 1000).toISOString() };
    await assert.rejects(ach.submitCpachargeAchPayment(checkout, expired, 'provider-token'), /not ready to submit/);
  } finally { restore(); }
});
