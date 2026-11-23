import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/basisTheoryContract.ts', import.meta.url), 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'esm' });
const { validateBasisTheoryCardConfiguration, basisTheoryTokenRequest } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
const now = Date.parse('2026-11-20T10:00:00Z');
const fixture = () => ({
  collection_id: 'collection-id', purchase_id: 'purchase-id', expires_at: '2026-11-20T10:30:00Z',
  collection: { provider: 'basis_theory', flow: 'hosted_fields', environment: 'sandbox', api_base_url: 'https://api.test.basistheory.com', saving: 'not_requested', metadata: { mypowerly_collection_id: 'collection-id', mypowerly_purchase_id: 'purchase-id' }, token_contract: 'basis_theory_card_token_v2', application_id: 'public-app', publishable_key: 'public-key', token_options: {
    id: 'collection-id', type: 'card', containers: ['/pci/'], expiresAt: '2026-11-20T10:30:00Z', deduplicateToken: false,
    metadata: { mypowerly_collection_id: 'collection-id', mypowerly_purchase_id: 'purchase-id' },
  } },
});

test('preserves the server-issued card options and metadata', () => {
  const input = fixture();
  assert.deepEqual(validateBasisTheoryCardConfiguration(input, now).tokenOptions, input.collection.token_options);
});
test('maps every issued option and preserves hosted element references', () => {
  const options = validateBasisTheoryCardConfiguration(fixture(), now).tokenOptions;
  const hosted = { number: {}, expiration_month: {}, expiration_year: {}, cvc: {} };
  assert.deepEqual(basisTheoryTokenRequest(options, hosted), {
    type: 'card', data: hosted, id: options.id, containers: options.containers,
    metadata: options.metadata, expiresAt: options.expiresAt, deduplicateToken: false,
  });
});
for (const [name, modify] of [
  ['live environment', x => { x.collection.environment = 'live'; }],
  ['wrong API host', x => { x.collection.api_base_url = 'https://example.com'; }],
  ['older contract', x => { x.collection.token_contract = 'legacy'; }],
  ['different token ID', x => { x.collection.token_options.id = 'other'; }],
  ['different purchase', x => { x.collection.token_options.metadata.mypowerly_purchase_id = 'other'; }],
  ['different collection', x => { x.collection.token_options.metadata.mypowerly_collection_id = 'other'; }],
  ['wrong container', x => { x.collection.token_options.containers = ['/other/']; }],
  ['deduplication enabled', x => { x.collection.token_options.deduplicateToken = true; }],
  ['expired token', x => { x.collection.token_options.expiresAt = '2026-11-20T09:59:00Z'; }],
  ['expiry beyond collection', x => { x.collection.token_options.expiresAt = '2026-11-20T11:00:00Z'; }],
  ['unknown token option', x => { x.collection.token_options.extra = true; }],
  ['missing public key', x => { x.collection.publishable_key = ''; }],
]) test(`rejects ${name}`, () => {
  const input = fixture(); modify(input);
  assert.throws(() => validateBasisTheoryCardConfiguration(input, now), /invalid or unsupported/);
});
