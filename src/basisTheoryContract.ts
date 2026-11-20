/** Sandbox-only Basis Theory card-token contract. Card values never enter this module. */
export const BASIS_THEORY_CARD_TOKEN_CONTRACT = 'basis_theory_card_token_v2';
export const BASIS_THEORY_TEST_API = 'https://api.test.basistheory.com';

type UnknownRecord = Record<string, unknown>;
export type IssuedBasisTheoryCardOptions = {
  id: string;
  type: 'card';
  containers: ['/pci/'];
  metadata: Record<string, string>;
  expiresAt: string;
  deduplicateToken: false;
};
export type BasisTheoryCardConfiguration = {
  publishableKey: string;
  applicationId: string;
  tokenOptions: IssuedBasisTheoryCardOptions;
};

/** Keep every issued option, including fields missing from the SDK's type declaration. */
export function basisTheoryTokenRequest<T>(options: IssuedBasisTheoryCardOptions, hostedCardData: T) {
  return {
    type: options.type,
    data: hostedCardData,
    id: options.id,
    containers: options.containers,
    metadata: options.metadata,
    expires_at: options.expiresAt,
    deduplicate_token: options.deduplicateToken,
  };
}

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord : null;
}

/** Reject incomplete, mismatched, or older contracts before mounting hosted fields. */
export function validateBasisTheoryCardConfiguration(
  collection: { collection_id: string; purchase_id: string; expires_at: string; collection: unknown },
  now = Date.now(),
): BasisTheoryCardConfiguration {
  const details = record(collection.collection);
  const options = record(details?.token_options);
  const metadata = record(options?.metadata);
  const unsupportedOptions = Object.keys(options ?? {}).filter(key =>
    !['id', 'type', 'containers', 'metadata', 'expiresAt', 'deduplicateToken'].includes(key));
  const expiresAt = typeof options?.expiresAt === 'string' ? Date.parse(options.expiresAt) : NaN;
  const collectionExpiresAt = Date.parse(collection.expires_at);
  if (
    details?.token_contract !== BASIS_THEORY_CARD_TOKEN_CONTRACT ||
    details.provider !== 'basis_theory' || details.flow !== 'hosted_fields' ||
    details.environment !== 'sandbox' || details.api_base_url !== BASIS_THEORY_TEST_API ||
    details.saving !== 'not_requested' ||
    typeof details.publishable_key !== 'string' || !details.publishable_key.trim() ||
    typeof details.application_id !== 'string' || !details.application_id.trim() ||
    !options || unsupportedOptions.length > 0 ||
    options.id !== collection.collection_id || options.type !== 'card' ||
    !Array.isArray(options.containers) || options.containers.length !== 1 || options.containers[0] !== '/pci/' ||
    options.deduplicateToken !== false || !metadata ||
    metadata.mypowerly_collection_id !== collection.collection_id ||
    metadata.mypowerly_purchase_id !== collection.purchase_id ||
    record(details.metadata)?.mypowerly_collection_id !== collection.collection_id ||
    record(details.metadata)?.mypowerly_purchase_id !== collection.purchase_id ||
    Object.values(metadata).some(value => typeof value !== 'string') ||
    !Number.isFinite(expiresAt) || !Number.isFinite(collectionExpiresAt) ||
    expiresAt <= now || expiresAt > collectionExpiresAt
  ) {
    throw new Error('The secure card collection configuration is invalid or unsupported. No card details were submitted.');
  }
  return {
    publishableKey: details.publishable_key,
    applicationId: details.application_id,
    tokenOptions: {
      id: options.id as string,
      type: 'card',
      containers: ['/pci/'],
      metadata: metadata as Record<string, string>,
      expiresAt: options.expiresAt as string,
      deduplicateToken: false,
    },
  };
}
