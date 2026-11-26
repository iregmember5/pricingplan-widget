/** Persist only backend collection identity and an irreversible submission marker. */
const PREFIX = 'payora.basis-collection.v2:';
export type BasisRecovery = { collectionId: string; tokenizationStarted: boolean };

export function readBasisRecovery(storage: Storage, purchaseId: string): BasisRecovery | null {
  const raw = storage.getItem(PREFIX + purchaseId);
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Card recovery information is invalid. Contact support.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Card recovery information is invalid. Contact support.');
  const row = value as Record<string, unknown>;
  if (typeof row.collectionId !== 'string' || !row.collectionId.trim() || typeof row.tokenizationStarted !== 'boolean') {
    throw new Error('Card recovery information is invalid. Contact support.');
  }
  return { collectionId: row.collectionId, tokenizationStarted: row.tokenizationStarted };
}

export function saveBasisRecovery(storage: Storage, purchaseId: string, value: BasisRecovery): void {
  storage.setItem(PREFIX + purchaseId, JSON.stringify(value));
  const saved = readBasisRecovery(storage, purchaseId);
  if (!saved || saved.collectionId !== value.collectionId || saved.tokenizationStarted !== value.tokenizationStarted) {
    throw new Error('Card recovery information could not be saved. No card details were submitted.');
  }
}
