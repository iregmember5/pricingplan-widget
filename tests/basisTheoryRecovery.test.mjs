import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const source = await readFile(new URL('../src/basisTheoryRecovery.ts', import.meta.url), 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'esm' });
const { readBasisRecovery, saveBasisRecovery } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}
test('persists only collection identity and the tokenization marker across reloads', () => {
  const store = storage();
  assert.equal(readBasisRecovery(store, 'purchase'), null);
  saveBasisRecovery(store, 'purchase', { collectionId: 'collection', tokenizationStarted: false });
  saveBasisRecovery(store, 'purchase', { collectionId: 'collection', tokenizationStarted: true });
  assert.deepEqual(readBasisRecovery(store, 'purchase'), { collectionId: 'collection', tokenizationStarted: true });
  assert.equal([...store.values.values()][0], '{"collectionId":"collection","tokenizationStarted":true}');
  assert.equal(readBasisRecovery(store, 'other-purchase'), null);
});
test('rejects corrupt recovery data instead of starting a new collection', () => {
  const store = storage();
  store.setItem('payora.basis-collection.v2:purchase', '{');
  assert.throws(() => readBasisRecovery(store, 'purchase'), /invalid/);
});
test('fails closed when storage cannot persist the marker', () => {
  assert.throws(() => saveBasisRecovery({ getItem: () => null, setItem: () => {} }, 'purchase', { collectionId: 'collection', tokenizationStarted: true }), /could not be saved/);
});
