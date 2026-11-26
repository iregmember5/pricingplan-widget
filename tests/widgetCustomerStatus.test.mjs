import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [new URL('../src/widgetCustomerService.ts', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const service = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function intercept(t, reply) {
  const actual = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, ...init, body: JSON.parse(init.body) });
    return reply(requests.at(-1));
  };
  t.after(() => { globalThis.fetch = actual; });
  return requests;
}

const checkout = { purchaseId: 'purchase-test', purchaseToken: 'purchase-proof-test' };
const preference = { contact_saved: true, status_updates_requested: true, status_updates_enabled: false };

test('contact replay keeps the same scoped payload, and a saved email does not imply delivery', async (t) => {
  const requests = intercept(t, ({ body }) => Response.json({ success: true,
    data: { customer_notifications: { ...preference, status_updates_requested: body.status_updates_requested } } }));
  assert.deepEqual(await service.saveWidgetContact(checkout, 'customer@example.com', true), preference);
  await service.saveWidgetContact(checkout, 'customer@example.com', true);
  await service.saveWidgetContact(checkout, '', false);
  assert.equal(requests[0].method, 'PUT');
  assert.match(requests[0].url, /\/widget-checkouts\/contact\/$/);
  assert.deepEqual(requests[0].body, {
    purchase_id: 'purchase-test', purchase_token: 'purchase-proof-test',
    customer_email: 'customer@example.com', status_updates_requested: true,
  });
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[2].body.status_updates_requested, false);
  assert.equal('customer_email' in requests[2].body, false);
});

test('read-only status and receipt send only a scoped session token on fixed endpoints', async (t) => {
  const requests = intercept(t, ({ url }) => Response.json({ success: true,
    data: url.endsWith('/exchange/') ? {
      status_token: 'wss_fixture', expires_at: new Date(Date.now() + 60_000).toISOString(),
    } : { status: 'processing', receipt_available: true, amount: '1.00', currency: 'USD' } }));
  const session = await service.exchangeWidgetStatus('ws_fixture');
  assert.equal(session.token, 'wss_fixture');
  assert.equal((await service.readWidgetStatus(session.token)).receipt_available, true);
  await service.readWidgetReceipt(session.token);
  assert.deepEqual(requests.map(({ body }) => body), [
    { status_token: 'ws_fixture' }, { status_token: 'wss_fixture' }, { status_token: 'wss_fixture' },
  ]);
  assert.equal(requests.every(({ referrerPolicy, credentials }) => referrerPolicy === 'no-referrer' && credentials === 'omit'), true);
  assert.equal(service.isWidgetReceiptEndpoint('/v1/api/payments/widget-payment-status/receipt/'), true);
  assert.equal(service.isWidgetReceiptEndpoint('https://other.example/v1/api/payments/widget-payment-status/receipt/'), false);
  assert.equal(service.isWidgetReceiptEndpoint('/v1/api/payments/widget-payment-status/receipt/?next=1'), false);
});

test('revoked, rate-limited, and frozen requests carry authoritative HTTP status', async (t) => {
  const statuses = [404, 429, 409];
  intercept(t, () => Response.json({ success: false }, { status: statuses.shift(), headers: { 'Retry-After': '20' } }));
  await assert.rejects(service.exchangeWidgetStatus('ws_fixture'), { status: 404 });
  await assert.rejects(service.readWidgetStatus('wss_fixture'), (err) => err.status === 429 && err.retryAt >= Date.now() + 19_000);
  await assert.rejects(service.saveWidgetContact(checkout, 'customer@example.com', true), { status: 409 });
});
