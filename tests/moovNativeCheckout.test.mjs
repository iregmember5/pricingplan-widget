import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [new URL('../src/moovNativeCheckout.ts', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const moov = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const root = 'https://example.test/v1/api/payments';
const collectionId = '0a435e1d-eafc-438f-bbae-aa475dd98e01';
const cardId = '0a435e1d-eafc-438f-bbae-aa475dd98e02';
const payerId = '0a435e1d-eafc-438f-bbae-aa475dd98e03';
const merchantId = '0a435e1d-eafc-438f-bbae-aa475dd98e04';
const descriptor = { provider: 'moov', gateway: 'moov', flow: 'native_moov', payment_method: 'card', environment: 'sandbox' };
const purchase = () => ({ purchaseId: 'purchase-example', purchaseToken: 'proof-example', idempotencyKey: 'key-example',
  amount: '1.00', currency: 'USD', canSubmit: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), collection: descriptor });
const collection = () => ({ ...descriptor, collection_id: collectionId, payer_account_id: payerId, merchant_account_id: merchantId,
  expires_at: new Date(Date.now() + 60_000).toISOString(), oauth_token: 'browser-fixture', ready: false });
const success = (data) => Response.json({ success: true, data });

function mock(t, respond) {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.sessionStorage;
  const state = new Map();
  const requests = [];
  globalThis.sessionStorage = {
    getItem: key => state.get(key) ?? null,
    setItem: (key, value) => state.set(key, value),
  };
  globalThis.fetch = async (url, options) => {
    const request = { url, body: JSON.parse(options.body), headers: options.headers };
    requests.push(request);
    return respond(request);
  };
  t.after(() => { globalThis.fetch = previousFetch; globalThis.sessionStorage = previousStorage; });
  return { requests, state };
}

test('native collection is distinct from vault collection and only admits issued USD card checkout', async (t) => {
  const { requests } = mock(t, () => success(collection()));
  assert.equal(moov.isNativeMoov(descriptor, 'USD'), true);
  assert.equal(moov.isNativeMoov({ ...descriptor, flow: 'vault_to_moov' }, 'USD'), false);
  for (const checkout of [
    { ...purchase(), currency: 'CAD' },
    { ...purchase(), canSubmit: false },
    { ...purchase(), expiresAt: '2000-01-01T00:00:00Z' },
  ]) {
    await assert.rejects(moov.beginMoovCollection(root, checkout, 'First', 'Last'), /unavailable/);
  }
  assert.equal(requests.length, 0);
});

test('begin replay and card verification send only scoped fields with no charge', async (t) => {
  const { requests, state } = mock(t, ({ url }) => success(url.endsWith('/complete/') ? { ready: true } : collection()));
  const checkout = purchase();
  const begun = await moov.beginMoovCollection(root, checkout, ' First ', 'Last');
  await moov.beginMoovCollection(root, checkout, ' First ', 'Last');
  moov.saveMoovRecovery(checkout.purchaseId, { collectionId: begun.collection_id, cardId });
  await moov.completeMoovCollection(root, checkout, collectionId, cardId);
  assert.equal(requests[0].url, root + '/moov-native-collections/');
  assert.deepEqual(requests[0], requests[1]);
  assert.deepEqual(requests[0].body, { purchase_id: checkout.purchaseId, purchase_token: checkout.purchaseToken,
    payer_first_name: 'First', payer_last_name: 'Last' });
  assert.deepEqual(requests[2].body, { purchase_id: checkout.purchaseId, purchase_token: checkout.purchaseToken,
    collection_id: collectionId, card_id: cardId });
  assert.equal(requests.every(request => !request.url.endsWith('/purchase-payments/')), true);
  assert.doesNotMatch([...state.values()].join(), /browser-fixture|proof-example/);
  assert.throws(() => moov.saveMoovRecovery(checkout.purchaseId, { collectionId: cardId }), /collection changed/);
});

test('lost setup replays begin with the original proof and no payment request', async (t) => {
  let lost = true;
  const { requests } = mock(t, () => {
    if (lost) { lost = false; throw new TypeError('Connection interrupted'); }
    return success(collection());
  });
  const checkout = purchase();
  await assert.rejects(moov.beginMoovCollection(root, checkout, 'First', 'Last'), /Connection interrupted/);
  assert.equal((await moov.beginMoovCollection(root, checkout, 'First', 'Last')).collection_id, collectionId);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
});

test('wrong-origin setup and a rejected card never submit a payment', async (t) => {
  const { requests } = mock(t, ({ url }) => url.endsWith('/complete/')
    ? Response.json({ success: false, message: 'Card ownership could not be verified.' }, { status: 409 })
    : Response.json({ success: false, message: 'Origin is not registered.' }, { status: 403 }));
  const checkout = purchase();
  await assert.rejects(moov.beginMoovCollection(root, checkout, 'First', 'Last'), /Origin is not registered/);
  await assert.rejects(moov.completeMoovCollection(root, checkout, collectionId, cardId), /Card ownership/);
  assert.equal(requests.filter(request => request.url.endsWith('/purchase-payments/')).length, 0);
});

test('the first pay locks the original collection before a lost response and blocks double or refreshed submission', async (t) => {
  const { requests } = mock(t, () => { throw new TypeError('Connection interrupted'); });
  const checkout = purchase();
  await assert.rejects(moov.payWithMoovCollection(root, checkout, collectionId), /Connection interrupted/);
  assert.deepEqual(moov.readMoovRecovery(checkout.purchaseId), { collectionId, submitted: true });
  await assert.rejects(moov.payWithMoovCollection(root, checkout, collectionId), /original payment status/);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body, {
    purchase_id: checkout.purchaseId, purchase_token: checkout.purchaseToken, idempotency_key: checkout.idempotencyKey,
    target_gateway: 'moov', payment_method: 'card', moov_collection_id: collectionId,
  });
});

test('pending and successful server outcomes remain distinct', async (t) => {
  mock(t, ({ body }) => success({ purchase_id: body.purchase_id, gateway: 'moov', status: body.purchase_id === 'first' ? 'processing' : 'succeeded' }));
  assert.equal((await moov.payWithMoovCollection(root, { ...purchase(), purchaseId: 'first' }, collectionId)).status, 'processing');
  assert.equal((await moov.payWithMoovCollection(root, purchase(), collectionId)).status, 'succeeded');
});
